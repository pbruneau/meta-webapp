import tempfile
import unittest
from pathlib import Path

from backend.app import create_app


PDF_CONTENT = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


class PdfReaderApiTest(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        root = Path(self.temporary_directory.name)
        self.library = root / "library"
        self.library.mkdir()
        self.database = root / "data" / "reader.sqlite3"
        static_root = Path(__file__).resolve().parent.parent / "frontend"
        self.app = create_app(
            {
                "TESTING": True,
                "LIBRARY_ROOT": str(self.library),
                "DATABASE_PATH": str(self.database),
                "STATIC_ROOT": str(static_root),
            }
        )
        self.client = self.app.test_client()

    def tearDown(self):
        self.temporary_directory.cleanup()

    def create_document(self, relative_path="Issue 1.pdf"):
        path = self.library / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(PDF_CONTENT)
        response = self.client.get("/pdf-reader/api/library")
        self.assertEqual(response.status_code, 200)
        documents = response.get_json()["documents"]
        return documents[0]

    def test_library_and_reading_state_round_trip(self):
        document = self.create_document("Archive/Issue 1.pdf")
        self.assertEqual(document["folder"], "Archive")

        response = self.client.put(
            "/pdf-reader/api/current-document",
            json={"documentId": document["id"]},
        )
        self.assertEqual(response.status_code, 200)

        response = self.client.put(
            f"/pdf-reader/api/documents/{document['id']}/state",
            json={"pageNumber": 37, "anchorX": 0.5, "anchorY": 0.62},
        )
        self.assertEqual(response.status_code, 200)

        response = self.client.get("/pdf-reader/api/state")
        payload = response.get_json()
        self.assertEqual(payload["currentDocumentId"], document["id"])
        self.assertEqual(payload["readingState"]["pageNumber"], 37)
        self.assertEqual(payload["readingState"]["anchorY"], 0.62)

    def test_current_document_can_be_closed_without_losing_reading_state(self):
        document = self.create_document()
        response = self.client.put(
            "/pdf-reader/api/current-document",
            json={"documentId": document["id"]},
        )
        self.assertEqual(response.status_code, 200)
        response = self.client.put(
            f"/pdf-reader/api/documents/{document['id']}/state",
            json={"pageNumber": 19, "anchorX": 0.4, "anchorY": 0.7},
        )
        self.assertEqual(response.status_code, 200)

        response = self.client.put(
            "/pdf-reader/api/current-document", json={"documentId": None}
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.get_json()["currentDocumentId"])

        response = self.client.get("/pdf-reader/api/state")
        self.assertIsNone(response.get_json()["currentDocumentId"])

        response = self.client.put(
            f"/pdf-reader/api/documents/{document['id']}/state",
            json={"pageNumber": 20, "anchorX": 0.4, "anchorY": 0.72},
        )
        self.assertEqual(response.status_code, 200)
        response = self.client.get("/pdf-reader/api/state")
        self.assertIsNone(response.get_json()["currentDocumentId"])
        response = self.client.get(
            f"/pdf-reader/api/documents/{document['id']}/state"
        )
        self.assertEqual(response.get_json()["state"]["pageNumber"], 20)

    def test_application_startup_clears_only_the_current_document(self):
        document = self.create_document()
        response = self.client.put(
            "/pdf-reader/api/current-document",
            json={"documentId": document["id"]},
        )
        self.assertEqual(response.status_code, 200)
        response = self.client.put(
            f"/pdf-reader/api/documents/{document['id']}/state",
            json={"pageNumber": 23, "anchorX": 0.5, "anchorY": 0.3},
        )
        self.assertEqual(response.status_code, 200)

        restarted_app = create_app(
            {
                "TESTING": True,
                "LIBRARY_ROOT": str(self.library),
                "DATABASE_PATH": str(self.database),
                "STATIC_ROOT": str(
                    Path(__file__).resolve().parent.parent / "frontend"
                ),
            }
        )
        restarted_client = restarted_app.test_client()

        response = restarted_client.get("/pdf-reader/api/state")
        self.assertIsNone(response.get_json()["currentDocumentId"])
        response = restarted_client.get(
            f"/pdf-reader/api/documents/{document['id']}/state"
        )
        self.assertEqual(response.get_json()["state"]["pageNumber"], 23)

    def test_mobile_zoom_setting_is_global_and_survives_restart(self):
        response = self.client.get("/pdf-reader/api/library")
        self.assertEqual(response.get_json()["mobileZoomPercent"], 200)

        response = self.client.put(
            "/pdf-reader/api/settings/mobile-zoom", json={"percent": 275}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["mobileZoomPercent"], 275)

        response = self.client.get("/pdf-reader/api/state")
        self.assertEqual(response.get_json()["mobileZoomPercent"], 275)

        restarted_app = create_app(
            {
                "TESTING": True,
                "LIBRARY_ROOT": str(self.library),
                "DATABASE_PATH": str(self.database),
                "STATIC_ROOT": str(
                    Path(__file__).resolve().parent.parent / "frontend"
                ),
            }
        )
        response = restarted_app.test_client().get("/pdf-reader/api/library")
        self.assertEqual(response.get_json()["mobileZoomPercent"], 275)

    def test_mobile_zoom_validation(self):
        invalid_payloads = [
            None,
            {},
            {"percent": True},
            {"percent": 99},
            {"percent": 501},
            {"percent": 200.5},
            {"percent": "200"},
        ]
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                response = self.client.put(
                    "/pdf-reader/api/settings/mobile-zoom", json=payload
                )
                self.assertEqual(response.status_code, 400)

    def test_document_id_survives_a_rename(self):
        document = self.create_document("Issue 1.pdf")
        (self.library / "Issue 1.pdf").rename(self.library / "Renamed.pdf")

        response = self.client.get("/pdf-reader/api/library")
        renamed = response.get_json()["documents"][0]
        self.assertEqual(renamed["id"], document["id"])
        self.assertEqual(renamed["name"], "Renamed.pdf")

    def test_identical_files_remain_separate_documents(self):
        first = self.create_document("Issue 1.pdf")
        duplicate_path = self.library / "Archive" / "Issue 1.pdf"
        duplicate_path.parent.mkdir()
        duplicate_path.write_bytes(PDF_CONTENT)

        response = self.client.get("/pdf-reader/api/library")
        documents = response.get_json()["documents"]
        self.assertEqual(len(documents), 2)
        self.assertEqual(len({document["id"] for document in documents}), 2)
        self.assertIn(first["id"], {document["id"] for document in documents})

    def test_pdf_content_supports_range_requests(self):
        document = self.create_document()
        response = self.client.get(
            f"/pdf-reader/content/{document['id']}",
            headers={"Range": "bytes=0-3"},
        )
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.data, b"%PDF")
        self.assertEqual(response.headers["Accept-Ranges"], "bytes")
        response.close()

    def test_state_validation(self):
        document = self.create_document()
        response = self.client.put(
            f"/pdf-reader/api/documents/{document['id']}/state",
            json={"pageNumber": 0, "anchorX": 0.5, "anchorY": 1.2},
        )
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
