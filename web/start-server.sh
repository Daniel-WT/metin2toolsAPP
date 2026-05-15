#!/bin/bash
PORT="${PORT:-8777}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec powershell.exe -ExecutionPolicy Bypass -File "$ROOT/server.ps1"
