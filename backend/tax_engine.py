"""
KhataLens AI — Deterministic Indian GST Tax Engine
Target Region: asia-south1 (Mumbai)
Strict Separation: 100% Deterministic Python Math & Schema Generation. No LLM Hallucinations.

Capabilities:
1. GSTR-1 Schema Compilation (gst.gov.in specification):
   - Invoice number sanitization (max 16 chars, [A-Za-z0-9/-])
   - Date normalization (DD-MM-YYYY)
   - Intra-state (CGST+SGST) vs Inter-state (IGST) splitting
   - B2B, B2CL (> ₹1,00,000 inter-state unregistered), and B2CS aggregation
   - Table 12 HSN summary (split into hsn_b2b & hsn_b2c per portal mandate)
   - Table 13 Documents issued summary (doc_issue)
2. GSTR-2B ITC Mismatch Reconciliation (Section 16(2)(aa) compliance & ₹ ITC at risk)
3. Section 47 Late Fee & Section 50 Interest Math:
   - Exact turnover-based statutory caps:
     * Nil return: ₹500 max
     * <= ₹1.5 Cr: ₹2,000 max
     * ₹1.5 Cr - ₹5 Cr: ₹5,000 max
     * > ₹5 Cr: ₹10,000 max
   - Section 50 18% p.a. interest strictly on late GSTR-3B net cash tax (0 for GSTR-1)
"""

import re
from datetime import datetime, date
from typing import List, Dict, Any, Optional, Tuple
from decimal import Decimal, ROUND_HALF_UP


def round_cur(val: float) -> float:
    """Rounds currency to 2 decimal places using deterministic ROUND_HALF_UP."""
    d = Decimal(str(val))
    return float(d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


MONTH_ABBREVIATIONS = {
    r"(?i)\bjanuary\b": "JAN",
    r"(?i)\bfebruary\b": "FEB",
    r"(?i)\bmarch\b": "MAR",
    r"(?i)\bapril\b": "APR",
    r"(?i)\bmay\b": "MAY",
    r"(?i)\bjune\b": "JUN",
    r"(?i)\bjuly\b": "JUL",
    r"(?i)\baugust\b": "AUG",
    r"(?i)\bseptember\b": "SEP",
    r"(?i)\boctober\b": "OCT",
    r"(?i)\bnovember\b": "NOV",
    r"(?i)\bdecember\b": "DEC",
}


def validate_and_suggest_invoice_number(inum: str) -> Dict[str, Any]:
    """
    Validates invoice number against GST Rule 46(b):
    - Maximum 16 characters
    - Allowed characters: alphanumeric, hyphen (-), and slash (/) only.
    
    If invalid, returns clean reason and an intelligent suggestion:
    e.g. '19/October/2026-27' (20 chars) -> '19/OCT/2026-27' (14 chars)
    """
    raw = str(inum or "").strip()
    if not raw:
        return {
            "invoice_number": "",
            "invoice_number_valid": False,
            "invoice_number_error": "Invoice number cannot be blank",
            "suggested_invoice_number": "INV-001",
        }

    # Check for invalid characters
    disallowed_chars = set(re.findall(r"[^A-Za-z0-9/-]", raw))
    length = len(raw)
    is_valid = (length <= 16) and (len(disallowed_chars) == 0)

    if is_valid:
        return {
            "invoice_number": raw,
            "invoice_number_valid": True,
            "invoice_number_error": None,
            "suggested_invoice_number": raw,
        }

    errors = []
    if length > 16:
        errors.append(f"Exceeds 16-char GST portal limit ({length} chars)")
    if disallowed_chars:
        errors.append(f"Contains invalid characters: {' '.join(repr(c) for c in sorted(disallowed_chars))}")

    suggested = raw
    # 1. Abbreviate full month names
    for pattern, abbr in MONTH_ABBREVIATIONS.items():
        suggested = re.sub(pattern, abbr, suggested)

    # 2. Replace spaces and common delimiters with '-' or remove
    suggested = re.sub(r"[\s_]+", "-", suggested)
    suggested = re.sub(r"[^A-Za-z0-9/-]", "", suggested)

    # 3. Collapse multiple consecutive slashes or hyphens
    suggested = re.sub(r"/+", "/", suggested)
    suggested = re.sub(r"-+", "-", suggested)

    # 4. Trim if still over 16 characters
    if len(suggested) > 16:
        suggested = suggested[:16]

    return {
        "invoice_number": raw,
        "invoice_number_valid": False,
        "invoice_number_error": "; ".join(errors),
        "suggested_invoice_number": suggested or "INV-001",
    }


def sanitize_invoice_number(inum: str) -> str:
    """
    Sanitize invoice number per GST rules:
    - Maximum 16 characters
    - Allowed characters: alphanumeric, hyphen (-), and slash (/)
    """
    val = validate_and_suggest_invoice_number(inum)
    return val.get("suggested_invoice_number") or "INV-001"


def normalize_date(dt_input: Any) -> str:
    """
    Normalizes any date object or string into GST portal format 'DD-MM-YYYY'.
    """
    if isinstance(dt_input, (datetime, date)):
        return dt_input.strftime("%d-%m-%Y")

    s = str(dt_input).strip()
    patterns = [
        ("%d-%m-%Y", r"^\d{2}-\d{2}-\d{4}$"),
        ("%d/%m/%Y", r"^\d{2}/\d{2}/\d{4}$"),
        ("%Y-%m-%d", r"^\d{4}-\d{2}-\d{2}$"),
        ("%d.%m.%Y", r"^\d{2}\.\d{2}\.\d{4}$"),
        ("%Y/%m/%d", r"^\d{4}/\d{2}/\d{2}$"),
    ]

    for fmt, regex in patterns:
        if re.match(regex, s):
            try:
                return datetime.strptime(s, fmt).strftime("%d-%m-%Y")
            except ValueError:
                continue

    # Fallback to current date formatted
    return datetime.now().strftime("%d-%m-%Y")


def determine_supply_type(supplier_state: str, recipient_state: str) -> str:
    """
    Determines whether a supply is INTRA-state or INTER-state.
    Supplier state code vs Place of Supply (POS) state code.
    """
    supp = str(supplier_state).zfill(2)
    pos = str(recipient_state).zfill(2)
    return "INTRA" if supp == pos else "INTER"


def split_tax(
    taxable_value: float,
    gst_rate: float,
    supply_type: str,
) -> Dict[str, float]:
    """
    Deterministically computes tax split based on supply type:
    - INTRA: CGST (rate/2) + SGST (rate/2), IGST = 0
    - INTER: IGST (rate), CGST = 0, SGST = 0
    """
    txval = round_cur(taxable_value)
    rate = float(gst_rate)

    if supply_type == "INTRA":
        half_rate = rate / 2.0
        cgst = round_cur(txval * (half_rate / 100.0))
        sgst = round_cur(txval * (half_rate / 100.0))
        return {
            "txval": txval,
            "rt": rate,
            "iamt": 0.0,
            "camt": cgst,
            "samt": sgst,
            "csamt": 0.0,
            "total_tax": round_cur(cgst + sgst),
            "total_inv": round_cur(txval + cgst + sgst),
        }
    else:
        igst = round_cur(txval * (rate / 100.0))
        return {
            "txval": txval,
            "rt": rate,
            "iamt": igst,
            "camt": 0.0,
            "samt": 0.0,
            "csamt": 0.0,
            "total_tax": igst,
            "total_inv": round_cur(txval + igst),
        }


def compile_gstr1_json(
    gstin: str,
    filing_period: str,  # MMYYYY e.g. "112026"
    invoices: List[Dict[str, Any]],
    gross_turnover: float = 0.0,
    cur_gross_turnover: float = 0.0,
) -> Dict[str, Any]:
    """
    Compiles normalized invoice list into official gst.gov.in GSTR-1 JSON schema.
    
    Includes:
    - b2b: Invoices to registered taxpayers (has recipient ctin)
    - b2cl: Large B2C invoices (inter-state, unregistered, taxable value > ₹1,00,000)
    - b2cs: Small B2C supplies (aggregated by sply_ty, pos, and tax rate)
    - hsn: Table 12 HSN summary split into hsn_b2b and hsn_b2c lists per GST portal rules
    - doc_issue: Table 13 serial range and document count summary
    """
    supplier_gstin = gstin.strip().upper()
    supplier_state = supplier_gstin[:2] if len(supplier_gstin) >= 2 else "19"

    b2b_dict: Dict[str, List[Dict[str, Any]]] = {}
    b2cl_dict: Dict[str, List[Dict[str, Any]]] = {}
    b2cs_agg: Dict[Tuple[str, str, float], Dict[str, float]] = {}

    hsn_b2b_agg: Dict[Tuple[str, str, float], Dict[str, Any]] = {}
    hsn_b2c_agg: Dict[Tuple[str, str, float], Dict[str, Any]] = {}

    all_inums: List[str] = []

    for inv in invoices:
        raw_inum = inv.get("invoice_number") or inv.get("inum") or "INV-001"
        inum = sanitize_invoice_number(raw_inum)
        all_inums.append(inum)

        idt = normalize_date(inv.get("invoice_date") or inv.get("idt"))
        recipient_gstin = (inv.get("recipient_gstin") or inv.get("ctin") or "").strip().upper()
        
        # Determine Place of Supply (POS)
        raw_pos = inv.get("pos") or inv.get("place_of_supply")
        if raw_pos:
            pos = str(raw_pos)[:2].zfill(2)
        elif recipient_gstin and len(recipient_gstin) >= 2:
            pos = recipient_gstin[:2]
        else:
            pos = supplier_state

        supply_type = determine_supply_type(supplier_state, pos)
        is_registered = bool(recipient_gstin and len(recipient_gstin) == 15)

        # Process invoice line items
        items = inv.get("items", [])
        if not items:
            # Fallback if invoice passed with top-level taxable_amount & rate
            items = [{
                "hsn": inv.get("hsn", "8481"),
                "description": inv.get("description", "Supplies"),
                "uqc": inv.get("uqc", "NOS"),
                "quantity": float(inv.get("quantity", 1)),
                "taxable_amount": float(inv.get("taxable_amount", 0.0)),
                "gst_rate": float(inv.get("gst_rate", 18.0)),
            }]

        inv_txval_total = 0.0
        inv_tax_total = 0.0
        itm_dets = []

        for idx, itm in enumerate(items, start=1):
            txval = round_cur(float(itm.get("taxable_amount", 0.0)))
            rate = float(itm.get("gst_rate", 18.0))
            tax_split = split_tax(txval, rate, supply_type)

            inv_txval_total += txval
            inv_tax_total += tax_split["total_tax"]

            itm_dets.append({
                "num": idx,
                "itm_det": {
                    "txval": txval,
                    "rt": rate,
                    "iamt": tax_split["iamt"],
                    "camt": tax_split["camt"],
                    "samt": tax_split["samt"],
                    "csamt": 0.0,
                }
            })

            # Aggregate Table 12 HSN summary
            hsn_code = str(itm.get("hsn") or "8481").strip()[:6]
            hsn_desc = str(itm.get("description") or "Goods / Supplies")[:30]
            uqc = str(itm.get("uqc") or "NOS").upper()[:3]
            qty = round_cur(float(itm.get("quantity", 1.0)))

            target_agg = hsn_b2b_agg if is_registered else hsn_b2c_agg
            agg_key = (hsn_code, uqc, rate)

            if agg_key not in target_agg:
                target_agg[agg_key] = {
                    "hsn_sc": hsn_code,
                    "desc": hsn_desc,
                    "uqc": uqc,
                    "qty": 0.0,
                    "txval": 0.0,
                    "iamt": 0.0,
                    "camt": 0.0,
                    "samt": 0.0,
                    "csamt": 0.0,
                    "rt": rate,
                }

            target_agg[agg_key]["qty"] = round_cur(target_agg[agg_key]["qty"] + qty)
            target_agg[agg_key]["txval"] = round_cur(target_agg[agg_key]["txval"] + txval)
            target_agg[agg_key]["iamt"] = round_cur(target_agg[agg_key]["iamt"] + tax_split["iamt"])
            target_agg[agg_key]["camt"] = round_cur(target_agg[agg_key]["camt"] + tax_split["camt"])
            target_agg[agg_key]["samt"] = round_cur(target_agg[agg_key]["samt"] + tax_split["samt"])

        inv_total_val = round_cur(inv_txval_total + inv_tax_total)

        # Classification into B2B / B2CL / B2CS
        if is_registered:
            # Table 4: B2B
            inv_entry = {
                "inum": inum,
                "idt": idt,
                "val": inv_total_val,
                "pos": pos,
                "rchrg": "N",
                "inv_typ": "R",
                "itms": itm_dets,
            }
            b2b_dict.setdefault(recipient_gstin, []).append(inv_entry)

        elif supply_type == "INTER" and inv_txval_total > 100000.0:
            # Table 5: B2CL (Inter-State unregistered > ₹1,00,000 threshold)
            b2cl_entry = {
                "inum": inum,
                "idt": idt,
                "val": inv_total_val,
                "inv_typ": "R",
                "itms": itm_dets,
            }
            b2cl_dict.setdefault(pos, []).append(b2cl_entry)

        else:
            # Table 7: B2CS (All other supplies to unregistered buyers)
            for itm in itm_dets:
                d = itm["itm_det"]
                rate = d["rt"]
                key = (supply_type, pos, rate)
                if key not in b2cs_agg:
                    b2cs_agg[key] = {
                        "sply_ty": supply_type,
                        "pos": pos,
                        "rt": rate,
                        "txval": 0.0,
                        "iamt": 0.0,
                        "camt": 0.0,
                        "samt": 0.0,
                        "csamt": 0.0,
                    }
                b2cs_agg[key]["txval"] = round_cur(b2cs_agg[key]["txval"] + d["txval"])
                b2cs_agg[key]["iamt"] = round_cur(b2cs_agg[key]["iamt"] + d["iamt"])
                b2cs_agg[key]["camt"] = round_cur(b2cs_agg[key]["camt"] + d["camt"])
                b2cs_agg[key]["samt"] = round_cur(b2cs_agg[key]["samt"] + d["samt"])

    # Format b2b output
    b2b_list = [
        {"ctin": ctin, "inv": inv_list}
        for ctin, inv_list in b2b_dict.items()
    ]

    # Format b2cl output
    b2cl_list = [
        {"pos": pos, "inv": inv_list}
        for pos, inv_list in b2cl_dict.items()
    ]

    # Format b2cs output
    b2cs_list = list(b2cs_agg.values())

    # Format Table 12 HSN: split into hsn_b2b and hsn_b2c per GST portal rules
    hsn_b2b_list = [
        {"num": idx, **entry}
        for idx, entry in enumerate(hsn_b2b_agg.values(), start=1)
    ]
    hsn_b2c_list = [
        {"num": idx, **entry}
        for idx, entry in enumerate(hsn_b2c_agg.values(), start=1)
    ]
    consolidated_hsn_data = hsn_b2b_list + hsn_b2c_list

    # Format Table 13 Documents Issued
    all_inums.sort()
    from_serial = all_inums[0] if all_inums else "INV-001"
    to_serial = all_inums[-1] if all_inums else "INV-001"
    tot_num = len(all_inums)

    doc_issue = {
        "doc_det": [
            {
                "doc_num": 1,
                "doc_typ": "Invoices for outward supply",
                "docs": [
                    {
                        "num": 1,
                        "from": from_serial,
                        "to": to_serial,
                        "totnum": tot_num,
                        "canc": 0,
                        "net_issue": tot_num,
                    }
                ],
            }
        ]
    }

    return {
        "gstin": supplier_gstin,
        "fp": filing_period,
        "gt": round_cur(gross_turnover),
        "cur_gt": round_cur(cur_gross_turnover),
        "b2b": b2b_list,
        "b2cl": b2cl_list,
        "b2cs": b2cs_list,
        "hsn": {
            "data": consolidated_hsn_data,
            "hsn_b2b": hsn_b2b_list,
            "hsn_b2c": hsn_b2c_list,
        },
        "doc_issue": doc_issue,
    }


def reconcile_gstr2b(
    purchase_bills: List[Dict[str, Any]],
    gstr2b_data: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Deterministic GSTR-2B Input Tax Credit (ITC) reconciliation engine.
    Matches books of accounts against supplier filings in GSTR-2B per Section 16(2)(aa).
    
    Detects:
    1. Matched invoices (Eligible ITC verified)
    2. Missing in GSTR-2B (Supplier defaulted/unfiled -> exact ₹ ITC at risk)
    3. Amount discrepancies (Value mismatch between bill and portal)
    4. Ineligible ITC flagged by portal (Section 17(5) blocked credit)
    """
    # Index GSTR-2B invoices by (Supplier GSTIN, Normalized Inum)
    b2b_portal = gstr2b_data.get("b2b", [])
    portal_inv_map: Dict[Tuple[str, str], Dict[str, Any]] = {}

    for supplier_entry in b2b_portal:
        ctin = (supplier_entry.get("ctin") or "").strip().upper()
        trade_name = supplier_entry.get("trd_nm") or supplier_entry.get("trade_name") or "Supplier"
        for inv in supplier_entry.get("inv", []):
            raw_num = inv.get("inum", "")
            inum = sanitize_invoice_number(raw_num)
            
            # Sum tax amounts from items
            txval = 0.0
            itc_avail = 0.0
            itc_flag = "Y"
            for itm in inv.get("itms", []):
                idet = itm.get("itm_det", {})
                txval += float(idet.get("txval", 0.0))
                # ITC Available
                iavail = itm.get("itc_avl", "Y")
                if iavail == "N":
                    itc_flag = "N"
                itc_avail += float(idet.get("iamt", 0.0)) + float(idet.get("camt", 0.0)) + float(idet.get("samt", 0.0))

            key = (ctin, inum)
            portal_inv_map[key] = {
                "ctin": ctin,
                "trade_name": trade_name,
                "inum": inum,
                "idt": inv.get("idt", ""),
                "val": float(inv.get("val", 0.0)),
                "txval": round_cur(txval),
                "itc_avail": round_cur(itc_avail),
                "itc_eligible": itc_flag == "Y",
                "matched": False,
            }

    matched_list: List[Dict[str, Any]] = []
    missing_in_gstr2b: List[Dict[str, Any]] = []
    amount_mismatch_list: List[Dict[str, Any]] = []
    ineligible_list: List[Dict[str, Any]] = []

    total_books_itc = 0.0
    verified_portal_itc = 0.0
    itc_at_risk = 0.0

    for bill in purchase_bills:
        supp_gstin = (bill.get("supplier_gstin") or bill.get("ctin") or "").strip().upper()
        raw_num = bill.get("invoice_number") or bill.get("inum") or ""
        inum = sanitize_invoice_number(raw_num)
        bill_txval = round_cur(float(bill.get("taxable_amount") or bill.get("txval") or 0.0))
        bill_itc = round_cur(float(bill.get("total_tax") or bill.get("itc_amount") or 0.0))
        supplier_name = bill.get("supplier_name") or bill.get("trade_name") or "Supplier"

        total_books_itc += bill_itc
        key = (supp_gstin, inum)

        if key in portal_inv_map:
            portal_rec = portal_inv_map[key]
            portal_rec["matched"] = True
            portal_txval = portal_rec["txval"]
            portal_itc = portal_rec["itc_avail"]

            if not portal_rec["itc_eligible"]:
                ineligible_list.append({
                    "supplier_gstin": supp_gstin,
                    "supplier_name": supplier_name,
                    "invoice_number": inum,
                    "bill_itc": bill_itc,
                    "reason": "Flagged ineligible in GSTR-2B by supplier under Section 17(5)",
                })
                itc_at_risk += bill_itc
            elif abs(bill_txval - portal_txval) > 1.0 or abs(bill_itc - portal_itc) > 1.0:
                diff_itc = round_cur(abs(bill_itc - portal_itc))
                amount_mismatch_list.append({
                    "supplier_gstin": supp_gstin,
                    "supplier_name": supplier_name,
                    "invoice_number": inum,
                    "books_txval": bill_txval,
                    "portal_txval": portal_txval,
                    "books_itc": bill_itc,
                    "portal_itc": portal_itc,
                    "itc_discrepancy": diff_itc,
                })
                verified_portal_itc += min(bill_itc, portal_itc)
                itc_at_risk += diff_itc
            else:
                matched_list.append({
                    "supplier_gstin": supp_gstin,
                    "supplier_name": supplier_name,
                    "invoice_number": inum,
                    "taxable_amount": bill_txval,
                    "verified_itc": bill_itc,
                    "status": "Verified & Claimable",
                })
                verified_portal_itc += bill_itc
        else:
            # Completely missing in GSTR-2B -> high risk!
            missing_in_gstr2b.append({
                "supplier_gstin": supp_gstin,
                "supplier_name": supplier_name,
                "invoice_number": inum,
                "invoice_date": normalize_date(bill.get("invoice_date") or bill.get("idt")),
                "taxable_amount": bill_txval,
                "itc_at_risk": bill_itc,
                "action": "Hold payment or remind supplier to file GSTR-1 immediately.",
            })
            itc_at_risk += bill_itc

    return {
        "summary": {
            "total_bills_checked": len(purchase_bills),
            "matched_bills_count": len(matched_list),
            "missing_bills_count": len(missing_in_gstr2b),
            "mismatch_bills_count": len(amount_mismatch_list),
            "ineligible_bills_count": len(ineligible_list),
            "total_books_itc": round_cur(total_books_itc),
            "verified_portal_itc": round_cur(verified_portal_itc),
            "total_itc_at_risk": round_cur(itc_at_risk),
            "compliance_score_pct": (
                round_cur((verified_portal_itc / total_books_itc) * 100.0)
                if total_books_itc > 0
                else 100.0
            ),
        },
        "matched_invoices": matched_list,
        "missing_in_gstr2b": missing_in_gstr2b,
        "amount_mismatches": amount_mismatch_list,
        "ineligible_invoices": ineligible_list,
    }


def calculate_late_fees_and_interest(
    return_type: str,  # "GSTR-1" or "GSTR-3B"
    due_date: Any,
    filing_date: Any,
    turnover_slab: str = "<= 5 Cr",  # "Nil", "<= 1.5 Cr", "1.5 - 5 Cr", "> 5 Cr"
    is_nil: bool = False,
    net_cash_liability: float = 0.0,
) -> Dict[str, Any]:
    """
    Deterministic calculation of:
    1. Section 47 Late Fee (applies to GSTR-1 & GSTR-3B) with exact statutory turnover caps:
       - Nil return: ₹20/day (₹10 CGST + ₹10 SGST), Max Cap = ₹500 (₹250 + ₹250)
       - Regular <= ₹1.5 Cr: ₹50/day (₹25 + ₹25), Max Cap = ₹2,000 (₹1,000 + ₹1,000)
       - Regular ₹1.5 Cr - ₹5 Cr: ₹50/day (₹25 + ₹25), Max Cap = ₹5,000 (₹2,500 + ₹2,500)
       - Regular > ₹5 Cr: ₹50/day (₹25 + ₹25), Max Cap = ₹10,000 (₹5,000 + ₹5,000)
    2. Section 50 Interest:
       - 18% p.a. calculated strictly per day on net cash tax liability.
       - STRICT RULE: Applies ONLY to GSTR-3B late filings. Never on GSTR-1!
    """
    # Parse dates
    def to_date(d: Any) -> date:
        if isinstance(d, datetime):
            return d.date()
        if isinstance(d, date):
            return d
        s = str(d).strip()
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
            try:
                return datetime.strptime(s, fmt).date()
            except ValueError:
                pass
        return date.today()

    d_due = to_date(due_date)
    d_file = to_date(filing_date)

    days_late = max(0, (d_file - d_due).days)

    # 1. Section 47 Late Fee
    if is_nil or turnover_slab.lower() == "nil":
        daily_cgst = 10.0
        daily_sgst = 10.0
        max_cap_cgst = 250.0
        max_cap_sgst = 250.0
        cap_desc = "Nil Return Cap: ₹500 (₹250 CGST + ₹250 SGST)"
    elif turnover_slab in ("<= 1.5 Cr", "< 1.5 Cr", "under 1.5 cr"):
        daily_cgst = 25.0
        daily_sgst = 25.0
        max_cap_cgst = 1000.0
        max_cap_sgst = 1000.0
        cap_desc = "Turnover <= ₹1.5 Cr Cap: ₹2,000 (₹1,000 CGST + ₹1,000 SGST)"
    elif turnover_slab in ("1.5 - 5 Cr", "1.5 to 5 cr", "<= 5 Cr", "< 5 Cr"):
        daily_cgst = 25.0
        daily_sgst = 25.0
        max_cap_cgst = 2500.0
        max_cap_sgst = 2500.0
        cap_desc = "Turnover ₹1.5 Cr - ₹5 Cr Cap: ₹5,000 (₹2,500 CGST + ₹2,500 SGST)"
    else:  # > 5 Cr
        daily_cgst = 25.0
        daily_sgst = 25.0
        max_cap_cgst = 5000.0
        max_cap_sgst = 5000.0
        cap_desc = "Turnover > ₹5 Cr Cap: ₹10,000 (₹5,000 CGST + ₹5,000 SGST)"

    raw_cgst = days_late * daily_cgst
    raw_sgst = days_late * daily_sgst

    fee_cgst = round_cur(min(raw_cgst, max_cap_cgst))
    fee_sgst = round_cur(min(raw_sgst, max_cap_sgst))
    total_late_fee = round_cur(fee_cgst + fee_sgst)

    # 2. Section 50 Interest (18% p.a.)
    # STRICT RULE: Applied ONLY to GSTR-3B late net cash tax. GSTR-1 carries 0 interest.
    is_gstr3b = "3B" in return_type.upper()
    cash_liability = max(0.0, float(net_cash_liability))

    if is_gstr3b and days_late > 0 and cash_liability > 0.0:
        annual_rate = 0.18
        # Interest = P * r * (days / 365)
        interest_calc = cash_liability * annual_rate * (days_late / 365.0)
        interest_total = round_cur(interest_calc)
        interest_applicable = True
    else:
        interest_total = 0.0
        interest_applicable = False

    total_statutory_payable = round_cur(total_late_fee + interest_total)

    explanation = (
        f"Return {return_type} filed {days_late} days past due date ({d_due.strftime('%d-%b-%Y')}). "
        f"Section 47 Late Fee: ₹{total_late_fee:,.2f} ({cap_desc}). "
    )
    if is_gstr3b and interest_total > 0:
        explanation += (
            f"Section 50 Interest: ₹{interest_total:,.2f} (18% p.a. on ₹{cash_liability:,.2f} net cash tax)."
        )
    elif not is_gstr3b:
        explanation += "Section 50 Interest: ₹0.00 (Not applicable to GSTR-1 statements)."

    return {
        "return_type": return_type,
        "due_date": d_due.strftime("%d-%m-%Y"),
        "filing_date": d_file.strftime("%d-%m-%Y"),
        "days_late": days_late,
        "is_nil": is_nil,
        "turnover_slab": turnover_slab,
        "late_fee_cgst": fee_cgst,
        "late_fee_sgst": fee_sgst,
        "late_fee_total": total_late_fee,
        "max_cap_applied": round_cur(max_cap_cgst + max_cap_sgst),
        "cap_description": cap_desc,
        "net_cash_liability": round_cur(cash_liability),
        "interest_rate_pct": 18.0 if interest_applicable else 0.0,
        "interest_total": interest_total,
        "interest_applicable": interest_applicable,
        "total_penalty_payable": total_statutory_payable,
        "explanation": explanation,
    }
