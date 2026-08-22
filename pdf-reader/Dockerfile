FROM node:22-alpine AS pdfjs

WORKDIR /dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --no-audit --no-fund
RUN mkdir -p /vendor/pdfjs \
    && cp -R node_modules/pdfjs-dist/build /vendor/pdfjs/build \
    && cp -R node_modules/pdfjs-dist/web /vendor/pdfjs/web \
    && cp -R node_modules/pdfjs-dist/cmaps /vendor/pdfjs/cmaps \
    && cp -R node_modules/pdfjs-dist/iccs /vendor/pdfjs/iccs \
    && cp -R node_modules/pdfjs-dist/standard_fonts /vendor/pdfjs/standard_fonts \
    && cp -R node_modules/pdfjs-dist/wasm /vendor/pdfjs/wasm

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend /app/backend
COPY frontend /app/static
COPY --from=pdfjs /vendor/pdfjs /app/static/vendor/pdfjs

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/pdf-reader/api/health', timeout=3)"

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "1", "--threads", "4", "--access-logfile", "-", "backend.app:create_app()"]
