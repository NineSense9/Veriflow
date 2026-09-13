#!/usr/bin/env bash
# Build in a separate directory; activate only after all manifests exist.
set -euo pipefail
action=${1:?build or activate}
revision=${2:?full git revision}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || exit 2
root=/opt/veriflow
release="$root/web-releases/$revision"
web="$release/apps/web"
exec 9>/run/lock/veriflow-web-release.lock
flock -n 9

case "$action" in
  build)
    [[ ! -e "$release" ]] || { echo 'Release already exists'; exit 2; }
    mkdir -p "$release"
    tar -xzf "/tmp/veriflow-$revision.tar.gz" -C "$release"
    cmp "$web/package-lock.json" "$root/apps/web/package-lock.json"
    ln -s "$root/apps/web/node_modules" "$web/node_modules"
    if [[ -f "$root/apps/web/.env.production" ]]; then cp "$root/apps/web/.env.production" "$web/.env.production"; fi
    cd "$web"
    export NODE_OPTIONS=--max-old-space-size=512
    export NEXT_TELEMETRY_DISABLED=1
    export VERIFLOW_API_ORIGIN=http://127.0.0.1:8010
    npm run build
    test -s .next/BUILD_ID
    test -s .next/prerender-manifest.json
    printf '%s\n' "$revision" > "$release/READY"
    ;;
  activate)
    test "$(cat "$release/READY")" = "$revision"
    test -s "$web/.next/BUILD_ID"
    test -s "$web/.next/prerender-manifest.json"
    dropin=/etc/systemd/system/veriflow-web.service.d/release.conf
    mkdir -p "$(dirname "$dropin")"
    previous="$release/previous-release.conf"
    if [[ -f "$dropin" ]]; then cp "$dropin" "$previous"; fi
    rollback() {
      if [[ -f "$previous" ]]; then cp "$previous" "$dropin"; else rm -f "$dropin"; fi
      systemctl daemon-reload
      systemctl restart veriflow-web
    }
    trap rollback ERR
    printf '[Service]\nWorkingDirectory=%s\n' "$web" > "$dropin"
    systemctl daemon-reload
    systemctl restart veriflow-web
    healthy=0
    for i in $(seq 1 15); do
      if curl -fsS --max-time 3 http://127.0.0.1:3000/login >/dev/null; then healthy=1; break; fi
      sleep 1
    done
    test "$healthy" = 1
    curl -fsS --max-time 5 http://127.0.0.1:8081/api/health >/dev/null
    trap - ERR
    echo "Activated $revision"
    ;;
  *) exit 2 ;;
esac
