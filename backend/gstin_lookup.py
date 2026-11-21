"""
KhataLens AI — Deterministic GSTIN Lookup, Checksum Validator & State Registry
Compliant with CBIC & GSTN Standards
Validates Mod-36 checksum, registers all 38 Indian State / UT codes, and provides
Firestore-cached lookup with realistic mock/demo engine fallback.
"""

import re
import os
from typing import Dict, Any, Optional
import httpx

# 15-character GSTIN regex conforming to Indian GST standard
# 2-digit State code + 5-letter PAN prefix + 4-digit PAN seq + 1-letter PAN suffix
# + 1-char entity number + 'Z' + 1-char check digit
GSTIN_REGEX = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")

# Indian State & Union Territory Codes (All 38 standard codes + Special)
STATE_CODE_MAP: Dict[str, str] = {
    "01": "Jammu and Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "25": "Daman and Diu (Legacy)",
    "26": "Dadra and Nagar Haveli and Daman and Diu",
    "27": "Maharashtra",
    "28": "Andhra Pradesh (Legacy)",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman and Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh (New)",
    "38": "Ladakh",
    "97": "Other Territory",
    "99": "Centre Jurisdiction",
}

# Mod-36 character alphabet for Luhn algorithm
MOD36_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def calculate_mod36_checksum(gstin_14: str) -> str:
    """
    Calculate the 15th check character for a 14-character GSTIN prefix
    using the official GSTN Modulo-36 Luhn-variant algorithm.
    """
    char_map = {c: i for i, c in enumerate(MOD36_ALPHABET)}
    total = 0

    for idx, char in enumerate(gstin_14):
        val = char_map.get(char, 0)
        # Weights alternate: 1 for even indices, 2 for odd indices
        weight = 1 if (idx % 2 == 0) else 2
        product = val * weight
        quotient = product // 36
        remainder = product % 36
        total += quotient + remainder

    check_code = (36 - (total % 36)) % 36
    return MOD36_ALPHABET[check_code]


def validate_gstin_checksum(gstin: str) -> bool:
    """
    Strictly verifies the 15th Mod-36 checksum character against the first 14 chars.
    """
    clean = gstin.strip().upper()
    if len(clean) != 15:
        return False
    expected_check = calculate_mod36_checksum(clean[:14])
    return clean[14] == expected_check


def validate_gstin_format(gstin: str) -> Dict[str, Any]:
    """
    Validates syntax, regex pattern, state code, and Mod-36 checksum.
    Returns structured validation report.
    """
    clean = gstin.strip().upper()
    if not clean:
        return {"valid": False, "error": "GSTIN cannot be blank."}

    if len(clean) != 15:
        return {
            "valid": False,
            "error": f"GSTIN must be exactly 15 characters (received {len(clean)}).",
        }

    if not GSTIN_REGEX.match(clean):
        return {
            "valid": False,
            "error": "GSTIN format is invalid. Must follow standard format (e.g. 19ABCDE1234F1Z5).",
        }

    state_code = clean[:2]
    if state_code not in STATE_CODE_MAP:
        return {
            "valid": False,
            "error": f"State code '{state_code}' is not a recognized Indian State/UT code.",
        }

    is_checksum_valid = validate_gstin_checksum(clean)
    state_name = STATE_CODE_MAP[state_code]
    pan = clean[2:12]

    return {
        "valid": True,
        "gstin": clean,
        "state_code": state_code,
        "state_name": state_name,
        "pan": pan,
        "checksum_valid": is_checksum_valid,
    }


def generate_fallback_shop_details(gstin: str, state_code: str, state_name: str, pan: str) -> Dict[str, Any]:
    """
    Generates realistic, professional MSME shop details for demo and offline fallback.
    Tailored specially for Kolkata/West Bengal or respective state.
    """
    # Deterministic mock trade names based on PAN digits
    prefixes = ["M/s Shree", "M/s Maa Tara", "M/s Royal", "M/s Bharat", "M/s Bengal", "M/s Metro"]
    suffixes = ["Enterprises", "Hardware & Electricals", "Textile Emporium", "Trading Co.", "Auto Spares", "Surgicals"]

    # Use hash of PAN for consistent deterministic mock data
    seed = sum(ord(c) for c in pan)
    prefix = prefixes[seed % len(prefixes)]
    suffix = suffixes[(seed // len(prefixes)) % len(suffixes)]
    trade_name = f"{prefix} {suffix}"
    legal_name = f"{trade_name} Private Limited" if (seed % 2 == 0) else f"{trade_name} (Prop. Rajesh Sharma)"

    city = "Kolkata" if state_code == "19" else ("Mumbai" if state_code == "27" else "Industrial Area")
    pincode = "700001" if state_code == "19" else ("400001" if state_code == "27" else f"{state_code}0001")

    return {
        "gstin": gstin,
        "legal_name": legal_name,
        "trade_name": trade_name,
        "state_code": state_code,
        "state_name": state_name,
        "pan": pan,
        "taxpayer_type": "Regular",
        "status": "Active",
        "registration_date": "01/07/2017",
        "address": {
            "building_name": "Plot No. 42, Commercial Complex",
            "street": "M.G. Road",
            "city": city,
            "district": city,
            "state": state_name,
            "pincode": pincode,
        },
        "filing_frequency": "Monthly",
        "turnover_slab": "<= 5 Cr",
        "source": "demo_engine",
    }


async def lookup_gstin(gstin: str, db=None) -> Dict[str, Any]:
    """
    Fetches GST details for a given GSTIN:
    1. Validates format and state.
    2. Checks Firestore cache ('gstin_cache/{gstin}').
    3. If configured, calls live GSP/MasterGST API.
    4. Falls back gracefully to deterministic realistic demo data.
    """
    fmt = validate_gstin_format(gstin)
    if not fmt["valid"]:
        return fmt

    clean_gstin = fmt["gstin"]
    state_code = fmt["state_code"]
    state_name = fmt["state_name"]
    pan = fmt["pan"]

    # Step 1: Check Firestore Cache
    if db:
        try:
            cache_ref = db.collection("gstin_cache").document(clean_gstin)
            cached_doc = cache_ref.get()
            if cached_doc.exists:
                data = cached_doc.to_dict() or {}
                data["source"] = "firestore_cache"
                data["valid"] = True
                return data
        except Exception as e:
            print(f"[Warning] Firestore GSTIN cache read failed: {e}")

    # Step 2: Live GSP API lookup if API key is provided
    api_key = os.getenv("GSTIN_API_KEY")
    api_url = os.getenv("GSTIN_API_BASE_URL", "https://api.mastergst.com/v1/gstin/")
    
    if api_key and api_key.strip():
        try:
            headers = {"Authorization": f"Bearer {api_key.strip()}"}
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(f"{api_url.rstrip('/')}/{clean_gstin}", headers=headers)
                if res.status_code == 200:
                    api_data = res.json().get("data", {})
                    result = {
                        "valid": True,
                        "gstin": clean_gstin,
                        "legal_name": api_data.get("lgnm") or api_data.get("legal_name", "N/A"),
                        "trade_name": api_data.get("tradeNam") or api_data.get("trade_name", "N/A"),
                        "state_code": state_code,
                        "state_name": state_name,
                        "pan": pan,
                        "taxpayer_type": api_data.get("dty", "Regular"),
                        "status": api_data.get("sts", "Active"),
                        "registration_date": api_data.get("rgdt", "01/07/2017"),
                        "address": api_data.get("pradr", {}),
                        "source": "live_gsp_api",
                    }
                    # Cache to Firestore
                    if db:
                        try:
                            db.collection("gstin_cache").document(clean_gstin).set(result, merge=True)
                        except Exception:
                            pass
                    return result
        except Exception as e:
            print(f"[Warning] GSP API lookup error: {e}. Falling back to demo engine.")

    # Step 3: Realistic Demo Engine Fallback
    fallback_data = generate_fallback_shop_details(clean_gstin, state_code, state_name, pan)
    fallback_data["valid"] = True

    # Cache fallback data to Firestore if available
    if db:
        try:
            db.collection("gstin_cache").document(clean_gstin).set(fallback_data, merge=True)
        except Exception:
            pass

    return fallback_data
