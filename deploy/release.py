"""Package an externally built commit and activate it without building on the server."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import subprocess
import tarfile
import time
import urllib.request


def command(*args, cwd=None):
    return subprocess.check_output(args, cwd=cwd, text=True).strip()


def pack(output: Path):
    root = Path(command('git', 'rev-parse', '--show-toplevel'))
    revision = command('git', 'rev-parse', 'HEAD', cwd=root)
    if command('git', 'diff', 'HEAD', '--name-only', '--', 'apps/web', 'services', 'packages', 'deploy', 'pyproject.toml', cwd=root):
        raise RuntimeError('Commit application changes before packaging')
    build = root / 'apps/web/.next'
    for filename in ('BUILD_ID', 'prerender-manifest.json', 'routes-manifest.json'):
        if not (build / filename).is_file():
            raise RuntimeError(f'Missing build artifact: {filename}')
    routes = json.loads((build / 'routes-manifest.json').read_text())
    if 'http://127.0.0.1:8010/api/' not in json.dumps(routes.get('rewrites')):
        raise RuntimeError('Build with VERIFLOW_API_ORIGIN=http://127.0.0.1:8010')
    data = subprocess.check_output(['git', 'archive', 'HEAD'], cwd=root)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data)) as source, tarfile.open(output, 'w:gz') as archive:
        for item in source.getmembers():
            if item.isfile():
                archive.addfile(item, source.extractfile(item))
        for path in build.rglob('*'):
            if path.is_file() and 'cache' not in path.relative_to(build).parts:
                archive.add(path, arcname=path.relative_to(root).as_posix())
        content = json.dumps({'revision': revision, 'node': command('node', '--version')}).encode()
        member = tarfile.TarInfo('RELEASE.json'); member.size = len(content)
        archive.addfile(member, io.BytesIO(content))
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(output.suffix + '.sha256').write_text(digest + '\n')
    print(json.dumps({'archive': str(output), 'sha256': digest, 'revision': revision}))


def healthy(url: str, revision=None):
    for _ in range(20):
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                content = response.read()
            if revision and json.loads(content).get('git_commit') != revision:
                raise RuntimeError('version mismatch')
            if url.endswith('/api/health') and not json.loads(content).get('ok'):
                raise RuntimeError('API reports unhealthy')
            return
        except Exception:
            time.sleep(1)
    raise RuntimeError(f'Health probe failed: {url}')


def install(archive_path: Path, checksum: str, root: Path):
    if hashlib.sha256(archive_path.read_bytes()).hexdigest() != checksum:
        raise RuntimeError('Checksum mismatch')
    with tarfile.open(archive_path) as archive:
        manifest = json.load(archive.extractfile('RELEASE.json'))
        revision = manifest['revision']
        if len(revision) != 40 or any(ch not in '0123456789abcdef' for ch in revision):
            raise RuntimeError('Invalid revision')
        release = root / 'web-releases' / revision
        release.mkdir(parents=True, exist_ok=False)
        for member in archive.getmembers():
            path = PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or not member.isfile():
                raise RuntimeError('Unsafe archive entry')
            target = release.joinpath(*path.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(member) as source, target.open('wb') as dest:
                shutil.copyfileobj(source, dest)
    for name in ('apps/web/package-lock.json', 'pyproject.toml'):
        if (release / name).read_bytes().replace(b'\r\n', b'\n') != (root / name).read_bytes().replace(b'\r\n', b'\n'):
            raise RuntimeError(f'Dependencies changed; provision before activation: {name}')
    web = release / 'apps/web'
    (web / 'node_modules').symlink_to(root / 'apps/web/node_modules', target_is_directory=True)
    production_env = root / 'apps/web/.env.production'
    if production_env.exists(): shutil.copy2(production_env, web / '.env.production')
    backup = root / 'deploy/backups' / revision
    backup.mkdir(parents=True, exist_ok=False)
    # Only tracked backend code/fixtures are replaced. Credentials and data remain outside.
    files = [path for folder in ('services', 'packages', 'examples', 'experiments', 'scripts', 'tests')
             for path in (release / folder).rglob('*') if path.is_file()]
    web_conf = Path('/etc/systemd/system/veriflow-web.service.d/release.conf')
    api_conf = Path('/etc/systemd/system/veriflow-api.service.d/zz-release-version.conf')
    version_env = root / 'deploy/release-version.env'
    originals = {}
    for target in [root / path.relative_to(release) for path in files] + [web_conf, api_conf, version_env]:
        originals[str(target)] = target.read_bytes() if target.exists() else None
    with tarfile.open(backup / 'code-before.tar.gz', 'w:gz') as bundle:
        for name, content in originals.items():
            if content is not None:
                info = tarfile.TarInfo(name.lstrip('/')); info.size = len(content)
                bundle.addfile(info, io.BytesIO(content))
    (backup / 'restore-paths.json').write_text(json.dumps({p: v is not None for p, v in originals.items()}))
    # Get configured path without printing environment values.
    env = {}
    for line in (root / '.env').read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1); env[key.strip()] = value.strip().strip('"\'')
    db = Path(env.get('VERIFLOW_DB', str(root / 'artifacts/veriflow.db')))
    if not db.is_absolute(): db = root / db
    if db.exists():
        with sqlite3.connect(db) as source, sqlite3.connect(backup / 'database-before.db') as dest:
            source.backup(dest)
    try:
        for path in files:
            target = root / path.relative_to(release)
            target.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(path, target)
        # This checker must use its own disposable database and never call a paid model.
        subprocess.run([str(root / '.venv/bin/python'), str(release / 'deploy/release_smoke.py')], cwd=root, env={**os.environ, 'DEEPSEEK_API_KEY': ''}, check=True)
        web_conf.parent.mkdir(parents=True, exist_ok=True)
        api_conf.parent.mkdir(parents=True, exist_ok=True)
        version_env.write_text(f'VERIFLOW_GIT_COMMIT={revision}\nVERIFLOW_BUILD_TIME={time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}\n')
        api_conf.write_text(f'[Service]\nEnvironmentFile={version_env}\n')
        web_conf.write_text(f'[Service]\nWorkingDirectory={web}\n')
        subprocess.run(['systemctl', 'daemon-reload'], check=True)
        subprocess.run(['systemctl', 'restart', 'veriflow-api', 'veriflow-web'], check=True)
        healthy('http://127.0.0.1:8081/login')
        healthy('http://127.0.0.1:8081/api/health')
        healthy('http://127.0.0.1:8081/api/version', revision)
    except Exception:
        for name, content in originals.items():
            target = Path(name)
            if content is None: target.unlink(missing_ok=True)
            else: target.write_bytes(content)
        subprocess.run(['systemctl', 'daemon-reload'], check=True)
        subprocess.run(['systemctl', 'restart', 'veriflow-api', 'veriflow-web'], check=True)
        raise
    print(f'Activated {revision}; backup {backup}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['pack', 'install'])
    parser.add_argument('archive', type=Path)
    parser.add_argument('--sha256')
    parser.add_argument('--root', type=Path, default=Path('/opt/veriflow'))
    args = parser.parse_args()
    if args.action == 'pack': pack(args.archive)
    else:
        if not args.sha256: parser.error('install requires --sha256')
        import fcntl
        with open('/run/lock/veriflow-release.lock', 'w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            install(args.archive, args.sha256, args.root)
