#!/bin/bash
set -e
docker build -t veriflow-sandbox:latest /opt/veriflow/deploy/sandbox
sed -i 's/^VERIFLOW_SANDBOX=.*/VERIFLOW_SANDBOX=docker/' /opt/veriflow/.env
systemctl restart veriflow-api
echo DOCKER_SWITCHED
curl -sS http://127.0.0.1:8010/api/health
echo
