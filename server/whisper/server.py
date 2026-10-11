"""A very small speech-to-text service for Pager. POST /transcribe with audio bytes, get {"text", "language"} back.
Runs on this machine only: nothing is sent anywhere else. The model is downloaded once, then kept in /models."""
import json, os, subprocess
import numpy as np
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock
from faster_whisper import WhisperModel

MODEL = os.environ.get("WHISPER_MODEL", "base")
model = WhisperModel(MODEL, device="cpu", compute_type="int8", download_root="/models")
busy = Lock()  # one recording at a time keeps a small server responsive


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def do_GET(self):
        self._send(200, {"ok": True, "model": MODEL}) if self.path == "/health" else self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/transcribe":
            return self._send(404, {"error": "not found"})
        size = int(self.headers.get("content-length") or 0)
        if size <= 0 or size > 25 * 1024 * 1024:
            return self._send(400, {"error": "bad size"})
        audio = self.rfile.read(size)
        try:
            # ffmpeg reads whatever the phone or browser recorded (ogg/opus, m4a, webm...) and hands back 16 kHz mono samples.
            pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", "16000", "pipe:1"], input=audio, capture_output=True, timeout=120, check=True).stdout
            samples = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0
            if samples.size == 0:
                return self._send(422, {"error": "no audio"})
            with busy:
                segments, info = model.transcribe(samples, vad_filter=True, beam_size=1)
                text = " ".join(s.text.strip() for s in segments).strip()
        except Exception as e:  # unreadable audio
            return self._send(422, {"error": str(e)[:200]})
        self._send(200, {"text": text, "language": info.language})

    def log_message(self, *a):  # do not log anything about what was said
        pass


ThreadingHTTPServer(("0.0.0.0", 9000), Handler).serve_forever()
