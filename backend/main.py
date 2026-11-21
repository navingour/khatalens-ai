"""
KhataLens AI — FastAPI Backend Server
Target Region: asia-south1 (Mumbai)
Multi-Tenant Architecture: shops/{gstin} and users/{uid}
Google Cloud Run Native with Health Checks & Demo Seeders
"""

import os
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(override=True)
load_dotenv(Path(__file__).parent / ".env", override=True)
from typing import List, Dict, Any, Optional
from datetime import datetime
from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Form,
    HTTPException,
    status,
    Depends,
    Query,
    Header,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Internal Modules
from backend.auth import (
    verify_token,
    verify_gstin_access,
    check_and_increment_notice_quota,
    get_db,
)
from backend.gstin_lookup import (
    validate_gstin_format,
    lookup_gstin,
    STATE_CODE_MAP,
)
from backend.tax_engine import (
    compile_gstr1_json,
    reconcile_gstr2b,
    calculate_late_fees_and_interest,
    sanitize_invoice_number,
    normalize_date,
)
from backend.ai_service import (
    extract_bill_from_bytes,
    ai_enrich_bill,
    map_and_parse_tabular_data,
    decode_gst_notice,
    get_hsn_master_data,
    _generate_demo_bill_extraction,
    _generate_demo_notice_analysis,
)
from backend.regulatory_scraper import (
    fetch_live_cbic_circulars,
    PRESEEDED_CIRCULARS,
    KOLKATA_PRACTITIONERS,
    get_banner_circulars,
    sync_and_store_cbic_circulars,
)
from backend.storage import upload_file_bytes, read_file_bytes

# Initialize FastAPI App
app = FastAPI(
    title="KhataLens AI API",
    description="Multi-tenant Indian GST & MSME Compliance SaaS Backend for Startup Buildathon India 2026",
    version="1.0.0",
)

# CORS Middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows Next.js frontend on localhost:3000, 3001, etc.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================================
# Health Check & Cloud Run Readiness
# =====================================================================

@app.get("/health")
def health_check():
    """Cloud Run health check and region readiness."""
    return {
        "status": "healthy",
        "service": "khatalens-backend",
        "region": "asia-south1",
        "timestamp": datetime.utcnow().isoformat(),
        "database": "Cloud Firestore (asia-south1)",
        "storage_policy": "30-day auto-purge with soft delete disabled",
    }


# =====================================================================
# Demo One-Click Seeder
# =====================================================================

@app.post("/api/demo/seed-samples")
def seed_demo_samples():
    """
    Returns complete ready-to-test sample datasets for 1-click buildathon demos:
    1. Sample sales bills (B2B, B2CL, B2CS) ready for GSTR-1 generation
    2. Purchase bills & GSTR-2B JSON with simulated supplier default (₹1,800 ITC leak)
    3. Sample ASMT-10 scrutiny notice (₹42,800 tax discrepancy)
    """
    sample_sales_invoices = [
        {
            "invoice_number": "INV-2026-001",
            "invoice_date": "05-11-2026",
            "recipient_gstin": "27AAACW1234F1Z8",  # Maharashtra B2B
            "recipient_name": "Mumbai Heavy Electricals Ltd.",
            "pos": "27",
            "items": [
                {
                    "hsn": "848180",
                    "description": "High Pressure Industrial Gate Valves",
                    "quantity": 10.0,
                    "uqc": "NOS",
                    "taxable_amount": 65000.0,
                    "gst_rate": 18.0,
                }
            ],
        },
        {
            "invoice_number": "INV-2026-002",
            "invoice_date": "08-11-2026",
            "recipient_gstin": "",  # Unregistered buyer in Gujarat (> ₹1,00,000 -> B2CL)
            "recipient_name": "Sunil Mehta (Unregistered)",
            "pos": "24",
            "items": [
                {
                    "hsn": "854411",
                    "description": "Copper Armoured Power Cables",
                    "quantity": 2.0,
                    "uqc": "NOS",
                    "taxable_amount": 120000.0,
                    "gst_rate": 18.0,
                }
            ],
        },
        {
            "invoice_number": "INV-2026-003",
            "invoice_date": "12-11-2026",
            "recipient_gstin": "",  # Local unregistered buyer in West Bengal (B2CS)
            "recipient_name": "Local Cash Walk-in Customer",
            "pos": "19",
            "items": [
                {
                    "hsn": "731815",
                    "description": "Galvanized Hex Bolts & Nuts",
                    "quantity": 50.0,
                    "uqc": "NOS",
                    "taxable_amount": 8400.0,
                    "gst_rate": 18.0,
                }
            ],
        },
    ]

    sample_purchase_bills = [
        {
            "supplier_gstin": "19XYZAB1234F1Z1",
            "supplier_name": "Bengal Alloy & Steel Corp",
            "invoice_number": "PUR-901",
            "invoice_date": "02-11-2026",
            "taxable_amount": 25000.0,
            "total_tax": 4500.0,
        },
        {
            "supplier_gstin": "19DEFGH5678J1Z2",  # Defaulting supplier
            "supplier_name": "Howrah Fasteners Private Limited",
            "invoice_number": "PUR-902",
            "invoice_date": "10-11-2026",
            "taxable_amount": 10000.0,
            "total_tax": 1800.0,
        },
    ]

    sample_gstr2b_json = {
        "b2b": [
            {
                "ctin": "19XYZAB1234F1Z1",
                "trd_nm": "Bengal Alloy & Steel Corp",
                "inv": [
                    {
                        "inum": "PUR-901",
                        "idt": "02-11-2026",
                        "val": 29500.0,
                        "itms": [
                            {
                                "itm_det": {
                                    "txval": 25000.0,
                                    "camt": 2250.0,
                                    "samt": 2250.0,
                                    "iamt": 0.0,
                                },
                                "itc_avl": "Y",
                            }
                        ],
                    }
                ],
            }
            # Howrah Fasteners (PUR-902) omitted to simulate missing filing
        ]
    }

    sample_asmt10_notice = _generate_demo_notice_analysis("Form GST ASMT-10")

    return {
        "success": True,
        "sample_sales_invoices": sample_sales_invoices,
        "sample_purchase_bills": sample_purchase_bills,
        "sample_gstr2b_json": sample_gstr2b_json,
        "sample_asmt10_notice": sample_asmt10_notice,
    }


# =====================================================================
# Feature 1: GSTIN Verification & State Registry
# =====================================================================

class GSTINLookupRequest(BaseModel):
    gstin: str


@app.post("/api/gstin/lookup")
async def handle_gstin_lookup(payload: GSTINLookupRequest):
    """Verifies 15-char GSTIN regex, Mod-36 checksum, and retrieves shop details."""
    gstin = payload.gstin.strip().upper()
    validation = validate_gstin_format(gstin)

    if not validation["valid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=validation.get("error", "Invalid GSTIN format."),
        )

    db = get_db()
    result = await lookup_gstin(gstin, db=db)
    return result


@app.get("/api/gstin/states")
def get_state_codes():
    """Returns official registry of all 38 Indian State / UT codes."""
    return [{"state_code": k, "state_name": v} for k, v in sorted(STATE_CODE_MAP.items())]


# =====================================================================
# Feature 2: Multi-Format Bill Extraction
# =====================================================================

@app.post("/api/bills/extract")
async def extract_bill(
    file: UploadFile = File(...),
    shop_gstin: str = Form("general"),
    shop_category: str = Form(""),
    ai_mode: str = Form("smart"),
):
    """
    Accepts JPG, PNG, PDF, Excel (.xlsx/.xls), or CSV files.
    Applies Gemini vision for photo/PDF bills, and deterministic Python safeguard for spreadsheets.
    Uploads raw file with 30-day auto-purge policy.
    Supports Zero-Waste Credit Architecture:
    - ai_mode='smart': checks SHA-256 cache, auto-invokes Gemini for images/scans
    - ai_mode='manual': returns placeholder row for images/scans flagged needs_ai_scan=True
    """
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    filename = file.filename or "bill.bin"
    fn_lower = filename.lower()
    if fn_lower.endswith(".pdf"):
        mime_type = "application/pdf"
    elif fn_lower.endswith((".jpg", ".jpeg")):
        mime_type = "image/jpeg"
    elif fn_lower.endswith(".png"):
        mime_type = "image/png"
    elif fn_lower.endswith(".webp"):
        mime_type = "image/webp"
    else:
        mime_type = file.content_type or "application/octet-stream"

    # Upload to storage (GCS in asia-south1 or /tmp fallback)
    storage_record = upload_file_bytes(file_bytes, filename, mime_type, shop_gstin)
    file_id = storage_record.get("file_id", "")
    db = get_db()

    # Determine processing strategy
    is_tabular = filename.lower().endswith((".csv", ".xlsx", ".xls"))

    if is_tabular:
        invoices = map_and_parse_tabular_data(file_bytes, filename, shop_category)
        return {
            "source_type": "tabular",
            "file_name": filename,
            "storage": storage_record,
            "invoices": invoices,
            "count": len(invoices),
        }
    else:
        # Photo or PDF invoice with Smart/Manual Zero-Waste extraction
        extracted = extract_bill_from_bytes(
            file_bytes=file_bytes,
            mime_type=mime_type,
            shop_category=shop_category,
            ai_mode=ai_mode,
            file_id=file_id,
            db=db,
        )
        return {
            "source_type": "vision_document",
            "file_name": filename,
            "storage": storage_record,
            "invoices": [extracted],
            "count": 1,
        }


@app.post("/api/bills/ai-enrich")
async def enrich_bill_on_demand(
    file_id: str = Form(...),
    shop_gstin: str = Form("general"),
    shop_category: str = Form(""),
):
    """
    On-demand AI Vision Scan for a specific invoice row.
    Loads file from storage and invokes Gemini multimodal model (1 credit).
    """
    file_bytes = read_file_bytes(file_id, shop_gstin)
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Original document with file_id '{file_id}' not found in storage.",
        )

    fn_lower = file_id.lower()
    if fn_lower.endswith(".pdf"):
        mime_type = "application/pdf"
    elif fn_lower.endswith((".jpg", ".jpeg")):
        mime_type = "image/jpeg"
    elif fn_lower.endswith(".png"):
        mime_type = "image/png"
    elif fn_lower.endswith(".webp"):
        mime_type = "image/webp"
    else:
        mime_type = "image/jpeg"

    db = get_db()
    enriched = ai_enrich_bill(
        file_bytes=file_bytes,
        mime_type=mime_type,
        shop_category=shop_category,
        file_id=file_id,
        db=db,
    )
    return {
        "success": True,
        "invoice": enriched,
    }


# =====================================================================
# Feature 3: Deterministic GSTR-1 Compilation & JSON Download
# =====================================================================

class GSTR1CompileRequest(BaseModel):
    gstin: str
    filing_period: str = Field(default="112026", description="MMYYYY format")
    invoices: List[Dict[str, Any]]
    gross_turnover: float = 0.0
    cur_gross_turnover: float = 0.0


@app.post("/api/bills/compile-gstr1")
def compile_gstr1(payload: GSTR1CompileRequest):
    """
    Deterministic compilation of GSTR-1 JSON adhering to gst.gov.in schema.
    Includes: b2b, b2cl, b2cs, Table 12 HSN (split into hsn_b2b & hsn_b2c), and Table 13 doc_issue.
    """
    if not payload.invoices:
        raise HTTPException(
            status_code=400, detail="Cannot compile GSTR-1 without at least 1 invoice."
        )

    gstr1_payload = compile_gstr1_json(
        gstin=payload.gstin,
        filing_period=payload.filing_period,
        invoices=payload.invoices,
        gross_turnover=payload.gross_turnover,
        cur_gross_turnover=payload.cur_gross_turnover,
    )

    return {
        "success": True,
        "filename": f"GSTR1_{payload.gstin}_{payload.filing_period}.json",
        "data": gstr1_payload,
    }


# =====================================================================
# Feature 4: GSTR-2B Input Tax Credit Reconciliation
# =====================================================================

class ReconciliationRequest(BaseModel):
    purchase_bills: List[Dict[str, Any]]
    gstr2b_json: Dict[str, Any]


@app.post("/api/reconciliation/gstr2b")
def reconcile_itc(payload: ReconciliationRequest):
    """
    Reconciles purchase register against GSTR-2B JSON.
    Detects missing supplier filings and calculates exact ₹ ITC at risk under Section 16(2)(aa).
    """
    if not payload.purchase_bills:
        raise HTTPException(
            status_code=400, detail="Please upload or provide purchase register bills."
        )

    result = reconcile_gstr2b(payload.purchase_bills, payload.gstr2b_json)
    return result


# =====================================================================
# Feature 5: Deterministic Late Fee & Interest Calculator
# =====================================================================

class LateFeeCalcRequest(BaseModel):
    return_type: str = Field(default="GSTR-3B", description="'GSTR-1' or 'GSTR-3B'")
    due_date: str = Field(description="YYYY-MM-DD or DD-MM-YYYY")
    filing_date: str = Field(description="YYYY-MM-DD or DD-MM-YYYY")
    turnover_slab: str = Field(default="<= 5 Cr", description="'Nil', '<= 1.5 Cr', '1.5 - 5 Cr', '> 5 Cr'")
    is_nil: bool = False
    net_cash_liability: float = Field(default=0.0, description="Net tax paid via cash for GSTR-3B")


@app.post("/api/calculator/late-fee")
def calculate_penalties(payload: LateFeeCalcRequest):
    """
    Computes Section 47 Late Fee with exact turnover caps + Section 50 18% p.a. interest.
    Strict rule: Interest applies strictly to GSTR-3B net cash tax (0 on GSTR-1).
    """
    result = calculate_late_fees_and_interest(
        return_type=payload.return_type,
        due_date=payload.due_date,
        filing_date=payload.filing_date,
        turnover_slab=payload.turnover_slab,
        is_nil=payload.is_nil,
        net_cash_liability=payload.net_cash_liability,
    )
    return result


# =====================================================================
# Feature 6: GST Scrutiny Notice Decoder with 2-Free-Use Gate
# =====================================================================

@app.get("/api/notices/quota")
async def get_notice_quota(
    phone: str = Query(...),
    gstin: str = Query(...),
    device_fingerprint: str = Query(...),
):
    """Checks remaining free notice decodes bound to (Phone + GSTIN + Device Fingerprint)."""
    status_quota = await check_and_increment_notice_quota(
        phone=phone,
        gstin=gstin,
        device_fingerprint=device_fingerprint,
        increment=False,
    )
    return status_quota


@app.post("/api/notices/decode")
async def decode_notice(
    file: UploadFile = File(...),
    phone: str = Form(...),
    gstin: str = Form(...),
    device_fingerprint: str = Form(...),
    notice_type_hint: str = Form("ASMT-10"),
):
    """
    Enforces 2-free-use gate, uploads notice PDF with 30-day auto-purge policy,
    and runs Gemini 4 Hydrogen (with Gemini 3.8 Flash fallback) to decode notice
    into plain shopkeeper English.
    """
    # 1. Enforce usage gate
    gate_check = await check_and_increment_notice_quota(
        phone=phone,
        gstin=gstin,
        device_fingerprint=device_fingerprint,
        increment=True,
    )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded notice file is empty.")

    filename = file.filename or "notice.pdf"
    mime_type = file.content_type or "application/pdf"

    # 2. Upload notice document
    storage_record = upload_file_bytes(file_bytes, filename, mime_type, gstin)

    # 3. Decode notice with Gemini
    analysis = decode_gst_notice(file_bytes, mime_type, notice_type_hint)

    return {
        "quota": gate_check,
        "storage": storage_record,
        "analysis": analysis,
    }


# =====================================================================
# Feature 7: Regulatory Scraper & Kolkata Directory
# =====================================================================

@app.get("/api/regulatory/banner")
async def get_regulatory_banner():
    """
    Public (unauthenticated) endpoint returning the latest 3 plain-English CBIC GST updates
    from Firestore (falling back to pre-seeded circulars if Firestore is empty).
    """
    banner_data = await get_banner_circulars(limit=3)
    return banner_data


@app.post("/api/cron/sync-cbic")
async def cron_sync_cbic(
    x_cron_secret: Optional[str] = Header(None, alias="X-Cron-Secret"),
):
    """
    Cron endpoint designed to be triggered every 6 hours (0 */6 * * *) by Google Cloud Scheduler.
    Protected by X-Cron-Secret header matching CRON_SECRET in .env.
    Fetches public cbic.gov.in updates strictly (never touches gst.gov.in).
    """
    expected_secret = os.getenv("CRON_SECRET", "khatalens-cron-secret-2026")
    if not x_cron_secret or x_cron_secret != expected_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Invalid or missing X-Cron-Secret header.",
        )

    result = await sync_and_store_cbic_circulars()
    return {
        "success": True,
        "message": "6-hour CBIC circular sync completed successfully from cbic.gov.in",
        "synced": result["synced"],
        "count": result["count"],
        "last_synced": result["last_synced"],
        "persisted_to_firestore": result.get("persisted_to_firestore", False),
    }


@app.get("/api/regulatory/circulars")
async def get_cbic_circulars():
    """Returns latest public CBIC circulars with plain shopkeeper summaries."""
    circulars = await fetch_live_cbic_circulars()
    return {"circulars": circulars, "count": len(circulars)}


@app.post("/api/regulatory/sync")
async def sync_cbic_circulars():
    """Forces fresh live fetch from cbic.gov.in."""
    circulars = await fetch_live_cbic_circulars()
    return {"synced": True, "circulars": circulars, "count": len(circulars)}


@app.get("/api/practitioners")
def get_practitioners(location: Optional[str] = None):
    """Returns Kolkata Verified GST Practitioner Directory with 1-click consultation handoff."""
    if location:
        filtered = [
            p for p in KOLKATA_PRACTITIONERS
            if location.lower() in p["location"].lower()
        ]
        return {"practitioners": filtered, "count": len(filtered)}
    return {"practitioners": KOLKATA_PRACTITIONERS, "count": len(KOLKATA_PRACTITIONERS)}


# =====================================================================
# Feature 8: Master HSN Search
# =====================================================================

@app.get("/api/hsn/list")
def list_hsn():
    """Returns the full master catalog of verified CBIC HSN and SAC codes."""
    all_hsn = get_hsn_master_data()
    return {"codes": all_hsn, "total": len(all_hsn)}


@app.get("/api/hsn/search")
def search_hsn(
    q: Optional[str] = Query(None, description="Search term or code prefix"),
    category: Optional[str] = Query(None, description="MSME Category filter"),
):
    """Searches verified 4-digit and 6-digit CBIC HSN/SAC codes."""
    all_hsn = get_hsn_master_data()
    results = all_hsn

    if category:
        cat_lower = category.lower()
        results = [h for h in results if cat_lower in h.get("category", "").lower()]

    if q:
        query_lower = q.lower()
        results = [
            h for h in results
            if query_lower in h["code"].lower() or query_lower in h["description"].lower()
        ]

    return {"results": results[:50], "total": len(results)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
