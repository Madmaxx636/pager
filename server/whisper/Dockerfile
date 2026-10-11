FROM python:3.12-slim
RUN pip install --no-cache-dir "faster-whisper>=1.2.1" requests
COPY server.py /app/server.py
ENV HF_HOME=/models
EXPOSE 9000
CMD ["python", "/app/server.py"]
