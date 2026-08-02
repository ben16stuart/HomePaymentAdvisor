FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV HOST=0.0.0.0 PORT=7860

EXPOSE 7860

# Render (and any other platform) injects its own $PORT at runtime, which
# overrides the default above. $PORT:-7860 keeps `docker run` with no env
# vars working the same as before.
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-7860} --workers 2 --timeout 60 app:app"]
