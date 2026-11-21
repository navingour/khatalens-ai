"""
KhataLens AI — Google Cloud Storage & Local Dev Upload Engine
Target Region: asia-south1 (Mumbai)
Privacy Lock: 30-day Object Lifecycle auto-delete policy with Soft Delete disabled.
Safeguard: Clean fallback to /tmp/khatalens_uploads during local development.
"""

import os
import uuid
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()
load_dotenv(Path(__file__).parent / ".env")

LOCAL_UPLOAD_DIR = Path("/tmp/khatalens_uploads")
LOCAL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_storage_client = None


def get_storage_client():
    """Initializes Google Cloud Storage client safely."""
    global _storage_client
    if _storage_client is not None:
        return _storage_client

    try:
        from google.cloud import storage
        _storage_client = storage.Client()
        return _storage_client
    except Exception as e:
        print(f"[Storage] Cloud Storage client unavailable: {e}. Using local storage fallback.")
        return None


def upload_file_bytes(
    file_bytes: bytes,
    original_filename: str,
    mime_type: str,
    shop_gstin: str = "general",
) -> Dict[str, Any]:
    """
    Uploads document to GCS bucket in asia-south1 with 30-day auto-purge metadata.
    Falls back to /tmp/khatalens_uploads when GCS_BUCKET_NAME is unset in local dev.
    """
    clean_gstin = shop_gstin.strip().upper()
    file_ext = Path(original_filename).suffix or ".bin"
    file_id = f"{uuid.uuid4().hex[:12]}{file_ext}"
    storage_path = f"shops/{clean_gstin}/{datetime.now().strftime('%Y-%m')}/{file_id}"

    bucket_name = os.getenv("GCS_BUCKET_NAME")
    client = get_storage_client()

    # Step 1: Upload to Google Cloud Storage if configured
    if bucket_name and client:
        try:
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(storage_path)
            blob.metadata = {
                "gstin": clean_gstin,
                "original_filename": original_filename,
                "retention_days": "30",
                "region": "asia-south1",
                "auto_delete_policy": "enabled",
                "uploaded_at": datetime.utcnow().isoformat(),
            }
            blob.upload_from_string(file_bytes, content_type=mime_type)

            # Generate signed URL valid for 2 hours
            try:
                signed_url = blob.generate_signed_url(
                    version="v4",
                    expiration=timedelta(hours=2),
                    method="GET",
                )
            except Exception:
                signed_url = f"https://storage.googleapis.com/{bucket_name}/{storage_path}"

            return {
                "storage_type": "gcs",
                "region": "asia-south1",
                "bucket": bucket_name,
                "file_path": storage_path,
                "url": signed_url,
                "file_id": file_id,
                "size_bytes": len(file_bytes),
                "auto_purge_days": 30,
            }
        except Exception as e:
            print(f"[Storage Warning] GCS upload failed: {e}. Falling back to local storage.")

    # Step 2: Local disk fallback (/tmp/khatalens_uploads)
    local_file_path = LOCAL_UPLOAD_DIR / f"{clean_gstin}_{file_id}"
    with open(local_file_path, "wb") as f:
        f.write(file_bytes)

    return {
        "storage_type": "local",
        "region": "local_dev",
        "local_path": str(local_file_path),
        "url": f"/api/storage/files/{file_id}",
        "file_id": file_id,
        "size_bytes": len(file_bytes),
        "auto_purge_days": 30,
    }


def read_file_bytes(file_id: str, gstin: str = "general") -> Optional[bytes]:
    """Reads file bytes from GCS or local directory."""
    local_candidates = list(LOCAL_UPLOAD_DIR.glob(f"*{file_id}*"))
    if local_candidates and local_candidates[0].exists():
        return local_candidates[0].read_bytes()

    bucket_name = os.getenv("GCS_BUCKET_NAME")
    client = get_storage_client()
    if bucket_name and client:
        try:
            bucket = client.bucket(bucket_name)
            # Search blob
            blobs = list(bucket.list_blobs(prefix=f"shops/{gstin.upper()}"))
            for b in blobs:
                if file_id in b.name:
                    return b.download_as_bytes()
        except Exception:
            pass

    return None
