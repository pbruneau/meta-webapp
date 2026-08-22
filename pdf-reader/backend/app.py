from __future__ import annotations

import hashlib
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import Flask, abort, jsonify, request, send_file, send_from_directory
from werkzeug.exceptions import HTTPException


SAMPLE_SIZE = 1024 * 1024


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


class LibraryStore:
    def __init__(self, library_root: Path, database_path: Path) -> None:
        self.library_root = library_root.resolve()
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._scan_lock = threading.Lock()
        self._initialize_database()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 30000")
        return connection

    def _initialize_database(self) -> None:
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    fingerprint TEXT NOT NULL,
                    relative_path TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    modified_ns INTEGER NOT NULL,
                    modified_at TEXT NOT NULL,
                    discovered_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS reading_states (
                    document_id TEXT PRIMARY KEY,
                    page_number INTEGER NOT NULL,
                    anchor_x REAL NOT NULL,
                    anchor_y REAL NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                );
                """
            )
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(documents)").fetchall()
            }
            if "fingerprint" not in columns:
                connection.execute("ALTER TABLE documents ADD COLUMN fingerprint TEXT")
                connection.execute(
                    "UPDATE documents SET fingerprint = id WHERE fingerprint IS NULL"
                )

    def _document_fingerprint(self, path: Path, size: int) -> str:
        digest = hashlib.sha256()
        digest.update(str(size).encode("ascii"))
        digest.update(b"\0")

        with path.open("rb") as source:
            if size <= SAMPLE_SIZE * 3:
                for chunk in iter(lambda: source.read(SAMPLE_SIZE), b""):
                    digest.update(chunk)
            else:
                offsets = (0, max(0, (size - SAMPLE_SIZE) // 2), size - SAMPLE_SIZE)
                for offset in offsets:
                    source.seek(offset)
                    digest.update(source.read(SAMPLE_SIZE))
                    digest.update(b"\0")

        return digest.hexdigest()

    def scan_library(self) -> None:
        with self._scan_lock:
            self.library_root.mkdir(parents=True, exist_ok=True)
            paths = sorted(
                path
                for path in self.library_root.rglob("*")
                if path.is_file()
                and not path.is_symlink()
                and path.suffix.lower() == ".pdf"
            )

            with self._connect() as connection:
                cached_rows = connection.execute(
                    """
                    SELECT id, fingerprint, relative_path, size, modified_ns
                    FROM documents
                    """
                ).fetchall()
                cached_by_path = {row["relative_path"]: row for row in cached_rows}
                current_paths = {
                    path.relative_to(self.library_root).as_posix() for path in paths
                }
                rename_candidates: dict[str, list[sqlite3.Row]] = {}
                for row in cached_rows:
                    if row["relative_path"] not in current_paths:
                        rename_candidates.setdefault(row["fingerprint"], []).append(row)
                discovered_ids: set[str] = set()

                for path in paths:
                    relative_path = path.relative_to(self.library_root).as_posix()
                    stat = path.stat()
                    cached = cached_by_path.get(relative_path)

                    if (
                        cached is not None
                        and cached["size"] == stat.st_size
                        and cached["modified_ns"] == stat.st_mtime_ns
                    ):
                        fingerprint = cached["fingerprint"]
                        document_id = cached["id"]
                    else:
                        fingerprint = self._document_fingerprint(path, stat.st_size)
                        if cached is not None and cached["fingerprint"] == fingerprint:
                            document_id = cached["id"]
                        else:
                            candidates = rename_candidates.get(fingerprint, [])
                            candidate = next(
                                (
                                    row
                                    for row in candidates
                                    if row["id"] not in discovered_ids
                                ),
                                None,
                            )
                            if candidate is not None:
                                document_id = candidate["id"]
                            else:
                                identity = f"{fingerprint}\0{relative_path}".encode("utf-8")
                                document_id = hashlib.sha256(identity).hexdigest()

                    connection.execute(
                        "DELETE FROM documents WHERE relative_path = ? AND id <> ?",
                        (relative_path, document_id),
                    )
                    connection.execute(
                        """
                        INSERT INTO documents (
                            id, fingerprint, relative_path, name, size, modified_ns,
                            modified_at, discovered_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            fingerprint = excluded.fingerprint,
                            relative_path = excluded.relative_path,
                            name = excluded.name,
                            size = excluded.size,
                            modified_ns = excluded.modified_ns,
                            modified_at = excluded.modified_at
                        """,
                        (
                            document_id,
                            fingerprint,
                            relative_path,
                            path.name,
                            stat.st_size,
                            stat.st_mtime_ns,
                            datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
                            utc_timestamp(),
                        ),
                    )
                    discovered_ids.add(document_id)

                stored_ids = {
                    row["id"]
                    for row in connection.execute("SELECT id FROM documents").fetchall()
                }
                for missing_id in stored_ids - discovered_ids:
                    connection.execute("DELETE FROM documents WHERE id = ?", (missing_id,))

                current = connection.execute(
                    "SELECT value FROM settings WHERE key = 'current_document_id'"
                ).fetchone()
                if current is not None and current["value"] not in discovered_ids:
                    connection.execute(
                        "DELETE FROM settings WHERE key = 'current_document_id'"
                    )

    def list_documents(self) -> list[dict[str, Any]]:
        self.scan_library()
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    d.id, d.relative_path, d.name, d.size, d.modified_at,
                    r.page_number, r.updated_at
                FROM documents d
                LEFT JOIN reading_states r ON r.document_id = d.id
                ORDER BY d.relative_path COLLATE NOCASE
                """
            ).fetchall()

        return [
            {
                "id": row["id"],
                "path": row["relative_path"],
                "name": row["name"],
                "folder": str(Path(row["relative_path"]).parent.as_posix())
                if "/" in row["relative_path"]
                else "",
                "size": row["size"],
                "modifiedAt": row["modified_at"],
                "lastPage": row["page_number"],
                "lastReadAt": row["updated_at"],
            }
            for row in rows
        ]

    def get_document(self, document_id: str) -> sqlite3.Row | None:
        with self._connect() as connection:
            return connection.execute(
                "SELECT * FROM documents WHERE id = ?", (document_id,)
            ).fetchone()

    def require_document(self, document_id: str) -> sqlite3.Row:
        document = self.get_document(document_id)
        if document is None:
            self.scan_library()
            document = self.get_document(document_id)
        if document is None:
            abort(404, description="Document not found")
        return document

    def document_path(self, document: sqlite3.Row) -> Path:
        path = (self.library_root / document["relative_path"]).resolve()
        try:
            path.relative_to(self.library_root)
        except ValueError:
            abort(404, description="Document not found")
        if not path.is_file() or path.suffix.lower() != ".pdf":
            abort(404, description="Document not found")
        return path

    def get_reading_state(self, document_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT page_number, anchor_x, anchor_y, updated_at
                FROM reading_states WHERE document_id = ?
                """,
                (document_id,),
            ).fetchone()
        if row is None:
            return None
        return {
            "pageNumber": row["page_number"],
            "anchorX": row["anchor_x"],
            "anchorY": row["anchor_y"],
            "updatedAt": row["updated_at"],
        }

    def save_reading_state(
        self, document_id: str, page_number: int, anchor_x: float, anchor_y: float
    ) -> dict[str, Any]:
        self.require_document(document_id)
        updated_at = utc_timestamp()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO reading_states (
                    document_id, page_number, anchor_x, anchor_y, updated_at
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(document_id) DO UPDATE SET
                    page_number = excluded.page_number,
                    anchor_x = excluded.anchor_x,
                    anchor_y = excluded.anchor_y,
                    updated_at = excluded.updated_at
                """,
                (document_id, page_number, anchor_x, anchor_y, updated_at),
            )
        return {
            "pageNumber": page_number,
            "anchorX": anchor_x,
            "anchorY": anchor_y,
            "updatedAt": updated_at,
        }

    def set_current_document(self, document_id: str | None) -> None:
        if document_id is not None:
            self.require_document(document_id)
        with self._connect() as connection:
            if document_id is None:
                connection.execute(
                    "DELETE FROM settings WHERE key = 'current_document_id'"
                )
            else:
                connection.execute(
                    """
                    INSERT INTO settings (key, value)
                    VALUES ('current_document_id', ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value
                    """,
                    (document_id,),
                )

    def get_application_state(self) -> dict[str, Any]:
        self.scan_library()
        with self._connect() as connection:
            current = connection.execute(
                "SELECT value FROM settings WHERE key = 'current_document_id'"
            ).fetchone()
        current_document_id = current["value"] if current is not None else None
        return {
            "currentDocumentId": current_document_id,
            "readingState": self.get_reading_state(current_document_id)
            if current_document_id
            else None,
        }


def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config.from_mapping(
        LIBRARY_ROOT=os.environ.get("LIBRARY_ROOT", "/library"),
        DATABASE_PATH=os.environ.get("DATABASE_PATH", "/data/pdf-reader.sqlite3"),
        STATIC_ROOT=os.environ.get(
            "STATIC_ROOT", str(Path(__file__).resolve().parent.parent / "static")
        ),
    )
    if test_config:
        app.config.update(test_config)

    static_root = Path(app.config["STATIC_ROOT"])
    store = LibraryStore(
        Path(app.config["LIBRARY_ROOT"]), Path(app.config["DATABASE_PATH"])
    )
    store.set_current_document(None)
    app.extensions["library_store"] = store

    @app.after_request
    def add_response_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        if request.path.startswith("/pdf-reader/api/"):
            response.headers["Cache-Control"] = "no-store"
        elif request.path.startswith("/pdf-reader/content/"):
            response.headers["Cache-Control"] = "private, max-age=3600"
        elif request.path == "/pdf-reader/":
            response.headers["Cache-Control"] = "no-cache"
        return response

    @app.errorhandler(HTTPException)
    def handle_http_error(error: HTTPException):
        if request.path.startswith("/pdf-reader/api/"):
            return jsonify({"error": error.description}), error.code
        return error

    @app.get("/pdf-reader/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.get("/pdf-reader/api/library")
    def library():
        documents = store.list_documents()
        application_state = store.get_application_state()
        return jsonify({"documents": documents, **application_state})

    @app.get("/pdf-reader/api/state")
    def application_state():
        return jsonify(store.get_application_state())

    @app.put("/pdf-reader/api/current-document")
    def update_current_document():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            abort(400, description="A JSON object is required")
        document_id = payload.get("documentId")
        if document_id is not None and not isinstance(document_id, str):
            abort(400, description="documentId must be a string or null")
        store.set_current_document(document_id)
        return jsonify({"currentDocumentId": document_id})

    @app.get("/pdf-reader/api/documents/<document_id>/state")
    def document_state(document_id: str):
        store.require_document(document_id)
        return jsonify({"state": store.get_reading_state(document_id)})

    @app.put("/pdf-reader/api/documents/<document_id>/state")
    def update_document_state(document_id: str):
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            abort(400, description="A JSON object is required")

        page_number = payload.get("pageNumber")
        anchor_x = payload.get("anchorX")
        anchor_y = payload.get("anchorY")
        if isinstance(page_number, bool) or not isinstance(page_number, int):
            abort(400, description="pageNumber must be an integer")
        if page_number < 1:
            abort(400, description="pageNumber must be at least 1")
        if isinstance(anchor_x, bool) or not isinstance(anchor_x, (int, float)):
            abort(400, description="anchorX must be a number")
        if isinstance(anchor_y, bool) or not isinstance(anchor_y, (int, float)):
            abort(400, description="anchorY must be a number")
        if not 0 <= float(anchor_x) <= 1 or not 0 <= float(anchor_y) <= 1:
            abort(400, description="Reading anchors must be between 0 and 1")

        state = store.save_reading_state(
            document_id, page_number, float(anchor_x), float(anchor_y)
        )
        return jsonify({"state": state})

    @app.get("/pdf-reader/content/<document_id>")
    def document_content(document_id: str):
        document = store.require_document(document_id)
        path = store.document_path(document)
        return send_file(
            path,
            mimetype="application/pdf",
            as_attachment=False,
            download_name=document["name"],
            conditional=True,
            etag=document["id"],
            last_modified=path.stat().st_mtime,
        )

    @app.get("/pdf-reader/")
    def index():
        return send_from_directory(static_root, "index.html")

    @app.get("/pdf-reader/<path:asset_path>")
    def static_asset(asset_path: str):
        return send_from_directory(static_root, asset_path)

    return app


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=8000)
