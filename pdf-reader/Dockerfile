FROM node:22-alpine AS pdfjs

# This commit contains the upstream iOS pinch fixes merged after pdfjs-dist 6.2.108.
# Replace the source build with a released package once those fixes are published.
ARG PDFJS_COMMIT=e05ab5e66a6239027ed76c9488308cd727027bfc
ARG PDFJS_ARCHIVE_SHA256=0d19175d9ecd3608713beb1caa5064cf24ef89dc73799e500d0f594b7946e965

WORKDIR /pdfjs
RUN wget -qO /tmp/pdfjs.tar.gz \
      "https://github.com/mozilla/pdf.js/archive/${PDFJS_COMMIT}.tar.gz" \
    && echo "${PDFJS_ARCHIVE_SHA256}  /tmp/pdfjs.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/pdfjs.tar.gz --strip-components=1 \
    && rm /tmp/pdfjs.tar.gz
RUN npm ci --omit=optional --no-audit --no-fund
RUN ./node_modules/.bin/gulp generic components
RUN mkdir -p /vendor/pdfjs \
    && cp -R build/generic/build /vendor/pdfjs/build \
    && cp -R build/components /vendor/pdfjs/web \
    && cp -R build/generic/web/cmaps /vendor/pdfjs/cmaps \
    && cp -R build/generic/web/iccs /vendor/pdfjs/iccs \
    && cp -R build/generic/web/standard_fonts /vendor/pdfjs/standard_fonts \
    && cp -R build/generic/web/wasm /vendor/pdfjs/wasm

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
