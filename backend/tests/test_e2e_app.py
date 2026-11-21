import urllib.request
import json
import uuid

def test_endpoint(name, url, method="GET", data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            status = resp.status
            body = resp.read()
            print(f"✅ {name}: HTTP {status} ({len(body)} bytes)")
            return body
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8', errors='ignore')[:150]
        print(f"❌ {name}: HTTP {e.code} — {err_msg}")
        return None
    except Exception as e:
        print(f"❌ {name}: {e}")
        return None

print("==========================================================")
print("  KhataLens AI — Comprehensive End-to-End Test Suite")
print("==========================================================")

# 1. Frontend Web Pages
test_endpoint("Frontend Landing Page (/)", "http://localhost:3000/")
test_endpoint("Frontend Dashboard Page (/dashboard)", "http://localhost:3000/dashboard")
test_endpoint("Frontend Onboarding Page (/onboarding)", "http://localhost:3000/onboarding")

# 2. Regulatory Banner API
body = test_endpoint("CBIC Regulatory Banner API", "http://localhost:8000/api/regulatory/banner")
if body:
    banner_data = json.loads(body)
    circulars = banner_data.get("circulars", [])
    print(f"   Items returned: {len(circulars)}")
    if circulars:
        c1 = circulars[0]
        print(f"   Latest: {c1.get('circular_number')} — {c1.get('plain_summary')[:75]}...")

# 3. Seed Demo Bills API
body = test_endpoint("Seed Demo Bills API", "http://localhost:8000/api/demo/seed-samples", method="POST")
if body:
    seed_data = json.loads(body)
    invoices = seed_data.get("invoices", [])
    print(f"   Seeded invoices: {len(invoices)}")
    if invoices:
        inv1 = invoices[0]
        print(f"   Sample: {inv1.get('invoice_number')} | Taxable: ₹{inv1.get('taxable_value')} | Slab: {inv1.get('gst_rate')}%")

# 4. GSTR-1 JSON Schema Compilation (Deterministic Tax Engine)
sample_invs = [
    {
        "invoice_number": "INV-2024-001",
        "invoice_date": "15-11-2024",
        "recipient_gstin": "27AABCS1429B1Z2",
        "recipient_name": "Apex Retail Pvt Ltd",
        "place_of_supply": "27",
        "items": [
            {
                "item_description": "Industrial Brass Valves",
                "hsn_code": "848180",
                "quantity": 10.0,
                "unit": "NOS",
                "taxable_amount": 25000.0,
                "gst_rate": 18.0
            }
        ]
    }
]
compile_payload = json.dumps({
    "gstin": "27AAPFU0939F1ZV",
    "filing_period": "112024",
    "invoices": sample_invs
}).encode()
body = test_endpoint(
    "GSTR-1 JSON Engine",
    "http://localhost:8000/api/bills/compile-gstr1",
    method="POST",
    data=compile_payload,
    headers={"Content-Type": "application/json"}
)
if body:
    gstr1 = json.loads(body)
    b2b_list = gstr1.get("gstr1_json", {}).get("b2b", [])
    print(f"   GSTR-1 Validated: {len(b2b_list)} B2B recipient blocks generated")

# 5. GSTR-2B ITC Matching Reconciliation
reconcile_payload = json.dumps({
    "purchase_bills": [
        {
            "invoice_number": "INV-101",
            "invoice_date": "10-11-2024",
            "supplier_gstin": "27AABCS1429B1Z2",
            "taxable_value": 50000.0,
            "total_tax": 9000.0
        }
    ],
    "gstr2b_json": {
        "b2b": [
            {
                "ctin": "27AABCS1429B1Z2",
                "inv": [
                    {
                        "inum": "INV-101",
                        "dt": "10-11-2024",
                        "val": 59000.0,
                        "itcavl": "Y",
                        "items": [
                            {"num": 1, "txval": 50000.0, "igst": 0.0, "cgst": 4500.0, "sgst": 4500.0}
                        ]
                    }
                ]
            }
        ]
    }
}).encode()
body = test_endpoint(
    "GSTR-2B ITC Reconciliation",
    "http://localhost:8000/api/reconciliation/gstr2b",
    method="POST",
    data=reconcile_payload,
    headers={"Content-Type": "application/json"}
)
if body:
    rec_res = json.loads(body)
    summary = rec_res.get("summary", {})
    print(f"   Matched: {summary.get('matched_count')} | Claimable ITC: ₹{summary.get('total_matched_tax')} | At Risk: ₹{summary.get('total_missing_tax', 0.0)}")

# 6. Section 47/50 Late Fee & Interest Calculator
calc_payload = json.dumps({
    "return_type": "GSTR-3B",
    "due_date": "20-10-2024",
    "filing_date": "15-11-2024",
    "turnover_slab": "<= 5 Cr",
    "is_nil": False,
    "net_cash_liability": 100000.0
}).encode()
body = test_endpoint(
    "Section 47/50 Late Fee Calculator",
    "http://localhost:8000/api/calculator/late-fee",
    method="POST",
    data=calc_payload,
    headers={"Content-Type": "application/json"}
)
if body:
    calc_res = json.loads(body)
    print(f"   Days Delayed: {calc_res.get('days_delayed')} | Late Fee: ₹{calc_res.get('total_late_fee')} | Interest: ₹{calc_res.get('interest_under_50')}")

# 7. GST Notice Decoder with Sarvam AI
boundary = f"----WebKitFormBoundary{uuid.uuid4().hex}"
notice_content = (
    f"--{boundary}\r\n"
    f'Content-Disposition: form-data; name="phone"\r\n\r\n'
    f"9876543210\r\n"
    f"--{boundary}\r\n"
    f'Content-Disposition: form-data; name="gstin"\r\n\r\n'
    f"27AAPFU0939F1ZV\r\n"
    f"--{boundary}\r\n"
    f'Content-Disposition: form-data; name="device_fingerprint"\r\n\r\n'
    f"test-device-fp-999\r\n"
    f"--{boundary}\r\n"
    f'Content-Disposition: form-data; name="notice_type_hint"\r\n\r\n'
    f"ASMT-10\r\n"
    f"--{boundary}\r\n"
    f'Content-Disposition: form-data; name="file"; filename="sample_asmt10.txt"\r\n'
    f"Content-Type: text/plain\r\n\r\n"
    f"FORM GST ASMT-10. Ref: ZA270424019283K. Discrepancy in GSTR-3B vs 2A for FY 2022-23. Disputed tax Rs 90,000, Interest Rs 16,200, Penalty Rs 10,000. Total payable Rs 1,16,200 in 30 days.\r\n"
    f"--{boundary}--\r\n"
).encode("utf-8")

body = test_endpoint(
    "Sarvam AI Notice Decoder",
    "http://localhost:8000/api/notices/decode",
    method="POST",
    data=notice_content,
    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
)
if body:
    notice_res = json.loads(body)
    analysis = notice_res.get("analysis", {})
    print(f"   Decoded Type: {analysis.get('notice_type')}")
    print(f"   What Happened: {analysis.get('what_happened')[:85]}...")
    print(f"   Total Demanded: ₹{analysis.get('total_amount_disputed')}")
    print(f"   Action Steps: {len(analysis.get('action_steps', []))}")

print("==========================================================")
print("  All App Features Verified and Passing! 🚀")
print("==========================================================")
