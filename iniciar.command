#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ -x .venv/bin/python ]; then
    PYTHON_BIN=.venv/bin/python
else
    PYTHON_BIN=python3
fi
if ! "$PYTHON_BIN" -c 'import django' >/dev/null 2>&1; then
    echo 'Instale las dependencias siguiendo README.md antes de iniciar.'
    exit 1
fi
"$PYTHON_BIN" manage.py migrate --noinput
exec "$PYTHON_BIN" manage.py runserver 127.0.0.1:8000
