# PDF Reader developer reference

The PDF Reader is a small, shared-state web application for browsing and reading
PDF files stored by FileBrowser. It consists of a framework-free PDF.js client and
a Flask API backed by SQLite. All routes live under the fixed `/pdf-reader/`
prefix.

## System at a glance

```text
Browser
  |  /pdf-reader/*
  v
Nginx reverse proxy
  |  public mode: Authelia auth_request
  |  LAN mode: no authentication
  v
Gunicorn, 1 worker and 4 threads
  |
  +-- Flask static routes ------> HTML, CSS, app.js, vendored PDF.js
  +-- Flask content route ------> /library/**/*.pdf, read-only mount
  +-- Flask JSON API -----------> /data/pdf-reader.sqlite3
```

The backend is both the application server and the file server. There is no
frontend build step after the image has been assembled. The Docker build copies
the browser distribution of PDF.js into the static tree, then Gunicorn serves the
whole application.

State is shared across every browser using the instance. There are no accounts,
per-user libraries, or per-user reading positions inside the application.

## Source map

| Path | Responsibility |
| --- | --- |
| [`backend/app.py`](backend/app.py) | Flask application factory, SQLite schema, library scanning, document identity, state persistence, content and static routes |
| [`backend/test_app.py`](backend/test_app.py) | Backend unit and API tests using temporary library and database directories |
| [`frontend/index.html`](frontend/index.html) | Library and reader DOM structure |
| [`frontend/app.js`](frontend/app.js) | All client state, API calls, PDF.js integration, navigation, search, thumbnails, outline, zoom, and synchronization |
| [`frontend/styles.css`](frontend/styles.css) | Desktop, tablet, and mobile layouts plus PDF.js viewer overrides |
| [`Dockerfile`](Dockerfile) | Multi-stage PDF.js asset assembly and Python runtime image |
| [`package.json`](package.json), [`package-lock.json`](package-lock.json) | Pinned PDF.js browser dependency |
| [`requirements.txt`](requirements.txt) | Pinned Flask and Gunicorn dependencies |
| [`../docker-compose.yml`](../docker-compose.yml#L104-L120) | Runtime configuration, mounts, UID, network, and persistence |
| [`../nginx/nginx-lan.conf`](../nginx/nginx-lan.conf#L60-L75) | Unauthenticated LAN proxy and Range forwarding |
| [`../nginx/nginx-open.conf`](../nginx/nginx-open.conf#L139-L154) | Authelia-protected public proxy and Range forwarding |

## Runtime flow

### 1. Server startup

[`create_app()`](backend/app.py#L334-L448) reads configuration, creates the
SQLite schema, enables WAL mode, and constructs one `LibraryStore`. It then clears
only `settings.current_document_id`. Per-document reading positions remain in the
database.

The production command is:

```text
gunicorn --bind 0.0.0.0:8000 --workers 1 --threads 4 \
  --access-logfile - backend.app:create_app()
```

Keeping one worker matters. The scan lock is process-local, and every application
factory invocation clears the current-document setting.

### 2. Library discovery and identity

Opening or refreshing the library calls `GET /pdf-reader/api/library`.
[`scan_library()`](backend/app.py#L96-L200) recursively finds regular,
non-symlinked files whose suffix is `.pdf`, case-insensitively.

For unchanged path, size, and nanosecond modification time, the cached identity is
reused without opening the file. Otherwise a SHA-256 fingerprint is calculated:

- Files up to 3 MiB are hashed in full.
- Larger files hash their size plus 1 MiB samples from the start, middle, and end.
- A new document ID hashes the fingerprint together with its first observed path.
- A missing old path with the same fingerprint is treated as a rename, preserving
  the ID and reading state.
- Simultaneously present identical files receive distinct IDs because their paths
  differ.
- Removed files are deleted from `documents`; the foreign key cascade deletes
  their `reading_states` rows.
- Replacing a path with different content normally produces a new ID and resets
  its reading state.

The scan runs synchronously during the request. The current `/library` handler
scans twice because both `list_documents()` and `get_application_state()` request
a scan.

### 3. Opening and rendering a document

[`openDocument()`](frontend/app.js#L492-L569) starts three operations in parallel:

```js
GET /documents/:id/state
PUT /current-document { "documentId": "..." }
pdfjsLib.getDocument({ url: "/pdf-reader/content/:id", ... })
```

The content response uses Flask conditional file serving with an ETag, last
modified time, and byte-range support. Nginx forwards `Range` and `If-Range`,
disables proxy buffering, and permits a 300 second upstream read. PDF.js can
therefore request large files incrementally.

After loading, `PDFViewer` renders the main document. Thumbnails are created
lazily with `IntersectionObserver`; the PDF outline is rendered as a nested list;
`PDFFindController` drives text search; and `PDFLinkService` resolves outline and
document destinations. See the [PDF.js setup](frontend/app.js#L1-L43),
[thumbnail path](frontend/app.js#L810-L882), [outline path](frontend/app.js#L898-L940),
and [find path](frontend/app.js#L943-L960).

### 4. Saving and restoring reading position

The persisted state is a page number plus a normalized point on that page:

```json
{
  "pageNumber": 37,
  "anchorX": 0.5,
  "anchorY": 0.62
}
```

The anchor corresponds to the horizontal center and 25 percent of the viewer
height. [`capturePosition()`](frontend/app.js#L631-L680) selects the page crossing
that viewport point, or the nearest page, and converts the point into page-relative
coordinates between 0 and 1. [`restorePosition()`](frontend/app.js#L587-L623)
restores page-width zoom, selects the saved page, waits for rendering, then scrolls
the normalized point back under the viewport anchor.

Writes are debounced for 900 ms. A single-slot save queue coalesces rapid scroll
updates, while leaving an in-flight request to finish. Navigation back to the
library flushes the queue. Tab hiding and `pagehide` use a best-effort `fetch()`
with `keepalive: true`. See [the save path](frontend/app.js#L691-L766).

Synchronization is visibility-based, not real-time. When a tab becomes visible,
it fetches the current document state and restores it if `updatedAt` differs from
the last observed write and no save is queued or in flight. There is no polling,
push channel, version check, or conflict resolution. The latest successful write
wins. See
[`synchronizeVisibleTab()`](frontend/app.js#L769-L783).

### 5. Closing and restarting

`Library` flushes the current position and returns to the library while retaining
the globally active document. `Close PDF` also clears `current_document_id`, but
keeps the document's reading state. A backend restart performs the same active
document clear during application creation.

## Persistent data

SQLite is stored at `pdf-reader/data/pdf-reader.sqlite3` on the host and
`/data/pdf-reader.sqlite3` in the container. WAL and shared-memory sidecar files
can exist while the service is running.

| Table | Purpose | Important columns |
| --- | --- | --- |
| `documents` | Current library index | `id`, `fingerprint`, unique `relative_path`, `size`, `modified_ns`, timestamps |
| `reading_states` | One position per document | `document_id`, `page_number`, `anchor_x`, `anchor_y`, `updated_at` |
| `settings` | Global application state | key/value row for `current_document_id` |

Connections enable foreign keys, wait up to 30 seconds for locks, and use WAL
journaling. Schema creation is idempotent. The only explicit legacy migration adds
and populates `documents.fingerprint`.

## HTTP API

All JSON API responses set `Cache-Control: no-store`. API `HTTPException`s become
`{"error": "..."}` responses.

| Method and path | Purpose |
| --- | --- |
| `GET /pdf-reader/api/health` | Process-level liveness check; does not inspect the library or database |
| `GET /pdf-reader/api/library` | Rescan and return documents, current document ID, and its reading state |
| `GET /pdf-reader/api/state` | Rescan and return the global current document ID and reading state |
| `PUT /pdf-reader/api/current-document` | Set a valid document ID or `null` |
| `GET /pdf-reader/api/documents/:id/state` | Return `{ "state": null }` or the saved state |
| `PUT /pdf-reader/api/documents/:id/state` | Validate and upsert `pageNumber`, `anchorX`, and `anchorY` |
| `GET /pdf-reader/content/:id` | Serve a validated in-library PDF with conditional and Range support |
| `GET /pdf-reader/` | Serve `index.html` |
| `GET /pdf-reader/:asset` | Serve frontend and vendored PDF.js assets |

The backend validates `pageNumber >= 1` and both anchors in `[0, 1]`. It does not
parse PDFs, so it cannot validate the upper page bound. The client clamps a saved
page to the loaded PDF's actual page count.

## Dependencies and build

| Dependency | Version or source | Role |
| --- | --- | --- |
| Python | `python:3.12-slim` | Runtime image |
| Flask | `3.1.2` | Routing, JSON API, static and conditional file serving |
| Gunicorn | `23.0.0` | Production WSGI server |
| SQLite | Python standard library | Library index and shared state |
| Node | `node:22-alpine` | Build stage only |
| PDF.js | `pdfjs-dist` `6.2.108` | Browser renderer, viewer, worker, search, links, fonts, color maps, and WASM assets |
| Nginx | Root Compose service | Prefix routing, authentication hook, and Range proxying |
| FileBrowser | Root Compose service | File management for the mounted `Magazines` directory |
| Authelia | Root Compose `open` profile | Public-mode authentication outside Flask |

`npm ci` omits development and optional packages. Only PDF.js browser assets are
copied into the final image; Node is absent from runtime. The frontend uses native
ES modules and modern browser APIs without transpilation or polyfills.

The base images and root Compose images use moving tags such as `python:3.12-slim`,
`node:22-alpine`, and `latest`. Application packages are pinned, but image rebuilds
are not fully reproducible over time.

## Configuration and deployment

| Variable | Application default | Compose value | Meaning |
| --- | --- | --- | --- |
| `LIBRARY_ROOT` | `/library` | `/library` | Recursively scanned PDF root |
| `DATABASE_PATH` | `/data/pdf-reader.sqlite3` | `/data/pdf-reader.sqlite3` | SQLite database file |
| `STATIC_ROOT` | `<pdf-reader>/static` | `/app/static` | Served frontend and vendored PDF.js tree |

Compose mounts `filebrowser/data/Magazines` at `/library` read-only and
`pdf-reader/data` at `/data` read-write. The container runs as UID and GID 1000,
so that identity needs write permission on the host data directory. The library
is intentionally modified through FileBrowser rather than this service.

### Open-mode request path

The public surface confirms the proxy and authentication boundary; container,
mount, and database details remain repository-derived. Open mode routes requests
as follows:

1. Port 80 redirects to HTTPS, except for the ACME challenge path.
2. Nginx terminates TLS and HTTP/2 for `pbruneau.ddns.net`.
3. `/pdf-reader` redirects to `/pdf-reader/`.
4. Every `/pdf-reader/` request runs the internal `/authelia-verify` subrequest.
   Nginx supplies the original absolute URL through `X-Original-URL`.
5. Authelia uses a domain cookie, a default-deny policy, and a one-factor rule for
   `pbruneau.ddns.net`.
6. An authentication failure becomes a `302` to
   `/authelia/login?redirect=<original request URI>`.
7. An accepted request is proxied, with its `/pdf-reader/` prefix intact, to
   `pdf-reader:8000`. Content requests also forward `Range` and `If-Range`.

Unauthenticated live requests to both `/pdf-reader/` and
`/pdf-reader/api/health` currently follow that `302` login flow. The external
health URL is therefore not a public liveness probe. The Docker health check
bypasses Nginx and calls the backend directly on `127.0.0.1:8000`.

From the repository root:

```bash
# Full deployments
./deploy.sh lan --build
./deploy.sh open --build

# Rebuild only this image
docker compose build pdf-reader

# Backend test suite in an isolated container
docker compose run --rm pdf-reader python -m unittest backend.test_app

# Runtime checks
curl -fsS http://localhost:6080/pdf-reader/api/health
docker compose logs -f pdf-reader
```

The LAN URL is `http://HOST:6080/pdf-reader/`. The configured public URL is
`https://pbruneau.ddns.net/pdf-reader/` and is protected at Nginx by Authelia.
Flask itself performs no authentication or authorization.

## Tests

[`backend/test_app.py`](backend/test_app.py) currently covers:

- Library discovery in nested folders and the reading-state round trip.
- Closing the active document without deleting its saved position.
- Clearing only the active document during application startup.
- Preserving document identity across a rename.
- Keeping simultaneously present identical files as separate documents.
- HTTP byte-range support for PDF content.
- Basic reading-state validation.

Not covered:

- Frontend behavior, browser history, rendering, zoom, search, outline, or touch
  gestures.
- Multi-tab synchronization and write conflicts.
- Corrupt, encrypted, partially uploaded, deleted-during-scan, or very large PDFs.
- SQLite contention, permission failures, schema upgrades, and backup or recovery.
- Nginx, Authelia, FileBrowser, Compose, and end-to-end Range behavior.
- Accessibility and cross-browser testing.

## Known limitations and failure modes

| Symptom or area | Cause and behavior |
| --- | --- |
| Shared state changes unexpectedly | The database has one global current document and one position per PDF. Concurrent readers are last-writer-wins. |
| Updates from another tab appear late | Synchronization only runs when a tab becomes visible, and only when no save is queued or in flight. |
| A final position is missing | The 900 ms autosave normally catches scrolling, but `pagehide` persistence is best-effort and network or process loss can drop the last update. A toast reports ordinary save failures while the page remains active. |
| A PDF fails to open | Corrupt, unsupported, or password-protected files can make PDF.js reject loading. The parallel current-document update may already have succeeded, leaving that file as the Continue target. |
| Library refresh fails | A file disappearing or changing while scanned, unreadable files, SQLite errors, or data-directory permissions can fail the whole request. Scan exceptions are not isolated per file. |
| Large libraries refresh slowly | Scanning is synchronous, changed files require hashing, and `/api/library` currently scans twice. Requests serialize scans only within one process. |
| Rename state attaches unexpectedly | Rename matching uses sampled content fingerprints. Multiple identical missing files can make rename association ambiguous. |
| Replaced content is stale or keeps identity | Unchanged path, size, and `mtime_ns` bypass fingerprinting. Large-file fingerprints sample only three regions. PDF responses are privately cacheable for one hour. |
| Direct `?document=<id>` navigation opens an unexpected view | Initial loading ignores the query parameter and follows the server's current document, or opens the library when none is current. The query parameter is only consumed during `popstate`, so stable deep links are not implemented. |
| A restored page has different zoom | Only page and normalized position persist. Restore always selects page-width zoom. |
| Search misses visible words | Search uses the PDF text layer. Image-only scans have no OCR. |
| Database startup fails or stalls | UID 1000 needs write access to the data directory. SQLite waits up to 30 seconds for a lock. WAL sidecar handling matters during manual backups. |
| A public health probe receives `302` | Open mode authenticates the API as well as the UI. Use the container health status, a direct internal request, or an authenticated external monitor. |
| Additional Gunicorn workers behave oddly | Startup clearing and scan locking are not designed for multiple worker processes. Keep the configured single worker unless those semantics are redesigned. |
| A custom URL prefix fails | `/pdf-reader/` is hard-coded in backend routes, frontend asset URLs, API URLs, history URLs, Nginx, and the health check. |

Other scope limits include no upload endpoint, no download or print controls, no
application-level annotation or form-state persistence, no OCR, and no background
library watcher. New files become visible on the next library load or manual
refresh.

## Change guide

| Change | Primary code |
| --- | --- |
| Library inclusion, fingerprints, rename semantics | [`LibraryStore.scan_library()`](backend/app.py#L96-L200) and [`_document_fingerprint()`](backend/app.py#L78-L94) |
| Database schema or persisted fields | [`_initialize_database()`](backend/app.py#L37-L76), state serializers, API validation, and matching frontend payloads |
| API routes, cache headers, or static serving | [`create_app()`](backend/app.py#L334-L448) |
| Open and close lifecycle | [`openDocument()`](frontend/app.js#L492-L569), [`disposeCurrentDocument()`](frontend/app.js#L465-L489), and [`closeCurrentDocument()`](frontend/app.js#L440-L462) |
| Reading-position semantics | [`restorePosition()`](frontend/app.js#L587-L623), [`capturePosition()`](frontend/app.js#L631-L680), and the save queue |
| PDF.js viewer options and assets | [`frontend/app.js`](frontend/app.js#L1-L43), [`Dockerfile`](Dockerfile#L1-L25), and [`package.json`](package.json) |
| Library or reader markup | [`frontend/index.html`](frontend/index.html) plus the DOM lookup table at [`frontend/app.js`](frontend/app.js#L15-L64) |
| Responsive layout and PDF.js overrides | [`frontend/styles.css`](frontend/styles.css) |
| Public versus LAN access | [`../deploy.sh`](../deploy.sh), Compose, and the two Nginx configurations |

Any state-contract change needs coordinated backend validation, SQLite migration,
frontend serialization and restore logic, plus round-trip and restart tests.
