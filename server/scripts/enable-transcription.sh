#!/usr/bin/env bash
# Switches on voice-message transcription: starts a small speech-to-text service on this machine and points the Pager server at it.
# Nothing leaves your machine. The first start downloads the model once (about 150 MB for "base", 500 MB for "small").
# Usage: scripts/enable-transcription.sh [base|small|tiny]
set -euo pipefail
cd "$(dirname "$0")/.."
MODEL="${1:-base}"
touch .env
set_env() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }
set_env WHISPER_MODEL "$MODEL"
set_env TRANSCRIBE_URL "http://whisper:9000"
# Docker compose reads profiles from COMPOSE_PROFILES in .env.
if grep -q "^COMPOSE_PROFILES=" .env; then grep -q "^COMPOSE_PROFILES=.*transcribe" .env || sed -i "s|^COMPOSE_PROFILES=\(.*\)|COMPOSE_PROFILES=\1,transcribe|" .env; else echo "COMPOSE_PROFILES=transcribe" >> .env; fi
mkdir -p data/whisper
docker compose up -d --build whisper api
echo "Transcription is on (model: $MODEL). The first voice message may take a minute while the model downloads."
