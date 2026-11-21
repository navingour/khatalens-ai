"""
KhataLens AI — Authentication, Multi-Tenant Guard & Notice Usage Gate
Target Region: asia-south1 (Mumbai)
Multi-Tenant Isolation: shops/{gstin} and users/{uid}
Notice Quota Gate: Max 2 free decodes per verified (phone + gstin + device_fingerprint)
"""

import os
import hashlib
from typing import Optional, Dict, Any
from pathlib import Path
from dotenv import load_dotenv
from fastapi import HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
try:
    import firebase_admin
    from firebase_admin import credentials, firestore, auth as firebase_auth
except ImportError:
    firebase_admin = None
    credentials = None
    firestore = None
    firebase_auth = None

from pathlib import Path
load_dotenv()
load_dotenv(Path(__file__).parent / ".env")

# Setup Security Scheme
security = HTTPBearer(auto_error=False)

# Global Firebase and Firestore singletons
_firebase_app: Optional[Any] = None
_firestore_db: Optional[Any] = None

# Free notice limit constant
MAX_FREE_NOTICES = 2


def get_firebase_app() -> Optional[Any]:
    """Initialize and return Firebase Admin App singleton safely."""
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app

    if firebase_admin is None:
        return None

    # Priority 1: Configured service account path
    sa_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "serviceAccountKey.json")
    backend_dir = Path(__file__).parent
    
    candidates = [
        Path(sa_path),
        backend_dir / sa_path,
        backend_dir / "serviceAccountKey.json",
        backend_dir.parent / "buildathon-20-11-26-firebase-adminsdk-fbsvc-9388199070.json",
    ]

    selected_cred = None
    for cand in candidates:
        if cand.exists() and cand.is_file():
            try:
                selected_cred = credentials.Certificate(str(cand))
                break
            except Exception:
                continue

    try:
        if selected_cred:
            _firebase_app = firebase_admin.initialize_app(selected_cred)
        elif os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
            _firebase_app = firebase_admin.initialize_app()
        else:
            # Fallback to default credentials or mock in dev
            try:
                _firebase_app = firebase_admin.initialize_app()
            except Exception:
                _firebase_app = None
    except Exception as e:
        print(f"[Warning] Firebase initialization notice: {e}")
        _firebase_app = None

    return _firebase_app


def get_db() -> Optional[Any]:
    """Retrieve Firestore client singleton."""
    global _firestore_db
    if _firestore_db is not None:
        return _firestore_db

    app = get_firebase_app()
    if app:
        try:
            _firestore_db = firestore.client(app=app)
        except Exception as e:
            print(f"[Warning] Firestore client error: {e}")
            _firestore_db = None
    return _firestore_db


async def verify_token(
    credentials_auth: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> Dict[str, Any]:
    """
    Verify Firebase Auth JWT Bearer Token.
    Returns decoded token dictionary with uid, email, etc.
    Supports graceful dev fallback if ALLOW_DEV_AUTH=True and no token provided.
    """
    allow_dev = os.getenv("ALLOW_DEV_AUTH", "False").lower() in ("true", "1")

    if not credentials_auth:
        if allow_dev:
            # Safe dev fallback mock user
            return {
                "uid": "dev_shopkeeper_kolkata",
                "email": "shopkeeper@khatalens.in",
                "phone_number": "+919830098300",
                "name": "Demo Shopkeeper",
                "is_dev": True,
            }
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization Header. Please sign in with Google.",
        )

    token = credentials_auth.credentials

    try:
        # Verify with Firebase Admin
        decoded = firebase_auth.verify_id_token(token)
        return decoded
    except Exception as e:
        if allow_dev and token.startswith("dev-token"):
            return {
                "uid": "dev_shopkeeper_kolkata",
                "email": "shopkeeper@khatalens.in",
                "phone_number": "+919830098300",
                "name": "Demo Shopkeeper",
                "is_dev": True,
            }
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired authentication token: {str(e)}",
        )


async def verify_gstin_access(
    gstin: str,
    user: Dict[str, Any] = Depends(verify_token),
) -> Dict[str, Any]:
    """
    Multi-tenant isolation guard.
    Ensures that authenticated user has read/write privileges for shops/{gstin}.
    """
    clean_gstin = gstin.strip().upper()
    uid = user.get("uid")

    if user.get("is_dev"):
        return {"gstin": clean_gstin, "uid": uid, "role": "owner"}

    db = get_db()
    if not db:
        # If Firestore is not reachable, allow user through with token identity
        return {"gstin": clean_gstin, "uid": uid, "role": "owner"}

    try:
        shop_ref = db.collection("shops").document(clean_gstin)
        doc = shop_ref.get()

        if not doc.exists:
            # First-time onboarding: any authenticated user can claim/create shop
            return {"gstin": clean_gstin, "uid": uid, "role": "creator"}

        data = doc.to_dict() or {}
        owner_uid = data.get("owner_uid")
        collaborators = data.get("collaborators", [])

        if owner_uid == uid or uid in collaborators:
            return {"gstin": clean_gstin, "uid": uid, "role": "member", "shop_data": data}

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: You do not have permissions for shop GSTIN {clean_gstin}.",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to verify shop ownership: {str(e)}",
        )


def generate_fingerprint_hash(phone: str, gstin: str, device_fingerprint: str) -> str:
    """Generate SHA256 key from phone, GSTIN, and device fingerprint."""
    raw = f"{phone.strip().lower()}:{gstin.strip().upper()}:{device_fingerprint.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def check_and_increment_notice_quota(
    phone: str,
    gstin: str,
    device_fingerprint: str,
    increment: bool = False,
) -> Dict[str, Any]:
    """
    Enforces the 2-free-notice usage gate per shop bound to:
    (Phone + GSTIN + Browser Device Fingerprint).
    Stores state in Firestore collection 'notice_usage_gates'.
    """
    clean_phone = phone.strip()
    clean_gstin = gstin.strip().upper()
    clean_fp = device_fingerprint.strip()

    if not clean_phone or not clean_gstin or not clean_fp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone number, GSTIN, and device fingerprint are required to verify free notice quota.",
        )

    gate_id = generate_fingerprint_hash(clean_phone, clean_gstin, clean_fp)
    db = get_db()

    # In-memory mock if Firestore is disabled
    if not db:
        return {
            "allowed": True,
            "used": 1 if increment else 0,
            "remaining": 1 if increment else 2,
            "max_free": MAX_FREE_NOTICES,
            "gate_id": gate_id,
        }

    try:
        gate_ref = db.collection("notice_usage_gates").document(gate_id)
        doc = gate_ref.get()

        if doc.exists:
            record = doc.to_dict() or {}
            used_count = record.get("used_count", 0)
        else:
            used_count = 0
            record = {
                "gate_id": gate_id,
                "phone": clean_phone,
                "gstin": clean_gstin,
                "device_fingerprint": clean_fp,
                "used_count": 0,
                "created_at": firestore.SERVER_TIMESTAMP,
            }

        if increment:
            if used_count >= MAX_FREE_NOTICES:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        f"You have used all {MAX_FREE_NOTICES} free GST notice decodes for GSTIN {clean_gstin}. "
                        "Please consult a Kolkata verified tax pro for additional notices."
                    ),
                )
            used_count += 1
            record["used_count"] = used_count
            record["updated_at"] = firestore.SERVER_TIMESTAMP
            gate_ref.set(record, merge=True)

        remaining = max(0, MAX_FREE_NOTICES - used_count)
        allowed = used_count < MAX_FREE_NOTICES if not increment else True

        return {
            "allowed": allowed,
            "used": used_count,
            "remaining": remaining,
            "max_free": MAX_FREE_NOTICES,
            "gate_id": gate_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Notice gate check failed: {str(e)}",
        )
