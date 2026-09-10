#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
APP=/opt/veriflow

if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

apt-get update
apt-get install -y git python3 python3-venv python3-pip nginx ca-certificates curl

if ! command -v docker >/dev/null 2>&1; then
  apt-get install -y docker.io
  systemctl enable --now docker
fi

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if [ ! -f "$APP/pyproject.toml" ]; then
  if git clone https://github.com/NineSense9/Veriflow.git "$APP"; then
    true
  else
    echo "git clone failed; put source in $APP first" >&2
    exit 1
  fi
elif [ -d "$APP/.git" ]; then
  git -C "$APP" fetch origin || true
  git -C "$APP" reset --hard origin/main || true
fi

python3 -m venv "$APP/.venv"
"$APP/.venv/bin/pip" install -U pip
"$APP/.venv/bin/pip" install -e "$APP"

if [ ! -f "$APP/.env" ]; then
  cat > "$APP/.env" <<'EOF'
VERIFLOW_SANDBOX=docker
VERIFLOW_SANDBOX_IMAGE=veriflow-sandbox:latest
VERIFLOW_DB=/opt/veriflow/artifacts/veriflow.db
VERIFLOW_API_ORIGIN=http://127.0.0.1:8010
DEMO_PASSWORD=demo
SETTER_PASSWORD=setter
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
EOF
fi

mkdir -p "$APP/artifacts"
if docker info >/dev/null 2>&1; then
  docker build -t veriflow-sandbox:latest "$APP/deploy/sandbox"
else
  sed -i 's/^VERIFLOW_SANDBOX=.*/VERIFLOW_SANDBOX=process/' "$APP/.env"
fi

cd "$APP/apps/web"
npm install
NODE_OPTIONS=--max-old-space-size=768 npm run build

install -m 644 "$APP/deploy/nginx-veriflow.conf" /etc/nginx/sites-available/veriflow
ln -sfn /etc/nginx/sites-available/veriflow /etc/nginx/sites-enabled/veriflow
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

install -m 644 "$APP/deploy/veriflow-api.service" /etc/systemd/system/veriflow-api.service
install -m 644 "$APP/deploy/veriflow-web.service" /etc/systemd/system/veriflow-web.service
systemctl daemon-reload
systemctl enable --now veriflow-api
systemctl enable --now veriflow-web
systemctl restart veriflow-api veriflow-web
sleep 2
systemctl --no-pager --full status veriflow-api veriflow-web | head -40
curl -sS http://127.0.0.1:8010/api/health || true
echo
curl -sS -o /dev/null -w "nginx:%{http_code}\n" http://127.0.0.1/login || true
