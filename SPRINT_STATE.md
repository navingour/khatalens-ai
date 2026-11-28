# KhataLens AI — Sprint State & Build Log

## Project Overview
- **Goal:** Working MVP for Startup Buildathon India 2026 (Kolkata Build Sprint — Nov 21, 2026).
- **Stack:** Next.js / React PWA (Tailwind + shadcn/ui) + Python FastAPI on Google Cloud Run (`asia-south1`) + Cloud Firestore (`asia-south1`) + Cloud Storage (`asia-south1`, 30-day auto-delete).

## MVP Scope (Must Work End-to-End)
1. Shop Onboarding (GSTIN, State, Business Category, Turnover Slab) + India Residency/30-Day Auto-Purge badge.
2. Snap-to-GSTR-1 Flow (Daily/weekend bill upload -> Gemini extraction -> 1-tap missing field & smart HSN review -> Deterministic `gst.gov.in` GSTR-1 JSON download).
3. GSTR-2B ITC Leak Detector (Upload GSTR-2B JSON vs. purchase bills -> exact ₹ mismatch alert).
4. Deterministic Section 47 & Section 50 Late Fee/Interest Calculator.
5. GST Notice Decoder (`ASMT-10`/`DRC-01` PDF -> `gemini-4-hydrogen` plain-English breakdown + 2-free-use gate via Phone + GSTIN + browser fingerprint).
6. Daily `cbic.gov.in` Regulatory Radar (pre-seeded + live sync) & Kolkata Verified Practitioner Directory.

## Out of Scope (Do Not Build During Sprint)
- Native Android/iOS apps, built-in GST Invoice Maker, Gemini Live voice assistant, Gemma on-device browser filter, hardcoded pricing/billing checkout flows.

## Completed & Locked
- [x] Architecture and model routing rules locked in `GEMINI.md` (pricing kept flexible/unassigned).
- [x] **Milestone 1 Completed:** Foundation, Auth, GSTIN Lookup & Master HSN dataset.
  - `.gitignore`: Configured to exclude `backend/serviceAccountKey.json`, `.env`, `.env.local`, and credential files.
  - `backend/requirements.txt`: Specified production dependencies (`fastapi`, `uvicorn[standard]`, `google-genai>=3.6.1`, `firebase-admin`, `google-cloud-storage`, `pydantic`, `openpyxl`, `pandas`, `httpx`, `beautifulsoup4`, `python-multipart`, `python-dotenv`).
  - `backend/.env.example`: Configured environment template with `asia-south1` cloud settings, Firebase credentials path, and Gemini API keys.
  - `backend/auth.py`: Firebase Admin initialization with service account fallback, `verify_token` Bearer auth middleware, `verify_gstin_access` multi-tenant isolation guard for `shops/{gstin}`, and Firestore-backed 2-free-notice usage gate bound to `phone + gstin + device_fingerprint`.
  - `backend/gstin_lookup.py`: 15-digit GSTIN regex, Mod-36 checksum validator, 38 Indian State/UT codes map, GSP API integration with Firestore caching, and realistic Kolkata MSME demo fallback.
  - `data/hsn_master.json`: 47 verified 4-digit and 6-digit CBIC HSN/SAC codes with tax slabs across 6 MSME verticals.
- [x] **Milestone 2 Completed:** Deterministic Tax Engine (`backend/tax_engine.py`).
  - `backend/tax_engine.py`: 100% deterministic Python engine:
    - Invoice number sanitization (max 16 chars, allowed `[A-Za-z0-9/-]`).
    - Date normalization to `DD-MM-YYYY`.
    - Intra-state (`CGST+SGST`) vs. inter-state (`IGST`) tax splitting with Decimal `ROUND_HALF_UP` precision.
    - Full `gst.gov.in` GSTR-1 JSON schema compilation: Table 4 `b2b`, Table 5 `b2cl` (> ₹1,00,000 threshold), Table 7 `b2cs` (aggregated by supply type, POS, and tax rate).
    - Table 12 HSN summary split into `hsn_b2b` and `hsn_b2c` lists per current GST portal rules, plus consolidated data.
    - Table 13 Documents issued (`doc_issue`) serial range tracking.
    - GSTR-2B Input Tax Credit (ITC) reconciliation engine: detects matched, missing in GSTR-2B (with exact ₹ ITC at risk), value/tax discrepancies, and Section 17(5) ineligible credit.
    - Section 47 Late Fee math enforcing exact turnover caps (Nil: ₹500; ≤ ₹1.5 Cr: ₹2,000; ₹1.5 Cr–₹5 Cr: ₹5,000; > ₹5 Cr: ₹10,000).
    - Section 50 18% p.a. interest applied strictly to late GSTR-3B net cash tax liabilities (strictly ₹0.00 for GSTR-1).
- [x] **Milestone 3 Completed:** Google AI Service (`backend/ai_service.py`).
  - `backend/ai_service.py`: Google GenAI integration (`google-genai>=3.6.1`):
    - Pydantic structured output models (`ExtractedBill`, `ExtractedBillItem`, `ColumnMappingResponse`, `NoticeAnalysis`, `NoticeActionItem`).
    - Multi-format bill vision extraction (`gemini-3.8-flash` with `gemini-3.5-flash-lite` fallback) grounded against `data/hsn_master.json`.
    - Tabular Excel/CSV safeguard: reads headers + first 2 sample rows in Python, queries Gemini only for column header mapping, and parses all rows deterministically in Python (saving tokens and eliminating hallucination).
    - Scrutiny notice decoder: primary `gemini-4-hydrogen` with automatic fallback to `gemini-3.8-flash` on rate-limit/availability errors.
    - Plain shopkeeper English output: (1) What happened, (2) Exact amount in ₹, (3) Next action step checklist.
    - Realistic offline/demo generators ensuring zero crashes during live presentations.
- [x] **Milestone 4 Completed:** Regulatory Scraper, Storage & Complete FastAPI Server.
  - `backend/regulatory_scraper.py`: Public scraper for `cbic.gov.in` (strictly never touching `gst.gov.in`) with 4 pre-seeded circulars + 5 verified Kolkata GST practitioners across Dalhousie, Burrabazar, Salt Lake, Howrah, and Park Street with direct consultation handoff.
  - `backend/storage.py`: Google Cloud Storage targeting `asia-south1` (Mumbai) with 30-day lifecycle metadata auto-purge and soft delete disabled, with clean fallback to `/tmp/khatalens_uploads` in local development.
  - `backend/main.py`: Full FastAPI REST API including `GET /health` Cloud Run readiness check, `POST /api/demo/seed-samples` 1-click test datasets, `POST /api/gstin/lookup`, `POST /api/bills/extract`, `POST /api/bills/compile-gstr1`, `POST /api/reconciliation/gstr2b`, `POST /api/calculator/late-fee`, `POST /api/notices/decode`, `GET /api/notices/quota`, `GET /api/regulatory/circulars`, `GET /api/practitioners`, and `GET /api/hsn/search`.
- [x] **Milestone 5 Completed:** Next.js PWA Setup, Firebase Auth & Landing Page `/`.
  - `frontend/next.config.mjs`: Configured `output: "standalone"` for fast Cloud Run containerization.
  - `frontend/src/lib/device_fingerprint.ts`: Persistent browser fingerprint generation bound for 2-free-notice gate.
  - `frontend/src/lib/firebase.ts`: Firebase client initialization with Google Sign-In and local demo login fallback.
  - `frontend/src/lib/api.ts`: Typed API client attaching Firebase Bearer token and `X-Device-Fingerprint` header on every request.
  - `frontend/src/app/layout.tsx`: PWA manifest, viewport configuration, and top India data residency trust bar (`asia-south1` Mumbai + 30-day auto-purge policy).
  - `frontend/src/app/page.tsx`: Shopkeeper landing page with plain English copy, trust indicators, 1-click demo launch, and notice decode hook.
  - Production build verified: `next build` compiled with 0 errors and 0 warnings.
- [x] **Milestone 6 Completed:** The Complete SaaS Interface (`/onboarding` & `/dashboard` 5-Tab Shell).
  - `frontend/src/app/onboarding/page.tsx`: 60-second shop setup with "Fetch GST Details", 1-click "Fill Demo Shop (Kolkata)", category selector, turnover slab, filing frequency, and mobile number bound for notice decodes.
  - `frontend/src/app/dashboard/page.tsx`: Full unified 5-tab application shell:
    1. **Bills to GSTR-1 (`bills`):** Multi-format dropzone, "Load 3 Sample Bills", missing HSN/GSTIN amber highlight with 1-tap "Accept AI Suggestion", and official `gst.gov.in` GSTR-1 JSON downloader.
    2. **GSTR-2B ITC Check (`itc`):** Section 16(2)(aa) matcher with "1-Click Load Sample GSTR-2B & Bills", verified vs. at-risk ITC KPI cards, and 1-tap WhatsApp reminder copy button.
    3. **Late Fee Calculator (`calculator`):** Real-time Section 47 statutory cap selector (Nil: ₹500, ≤₹1.5Cr: ₹2,000, ₹1.5-5Cr: ₹5,000, >₹5Cr: ₹10,000) and Section 50 18% p.a. interest applied strictly to GSTR-3B cash tax.
    4. **Notice Decoder (`notices`):** ASMT-10 / DRC-01 analyzer with live 2-free-use counter badge, plain English explanation, disputed ₹ amount, and step-by-step action checklist.
    5. **CBIC Radar & Local Pros (`radar`):** Daily circular feed with "Sync Now" button and Kolkata Verified GST Practitioner Directory with location filters and 1-click consultation handoff.
  - Production build verified: `next build` compiled all routes (`/`, `/onboarding`, `/dashboard`) with 0 errors and 0 warnings.
- [x] **Milestone 7 Completed:** 6-Hour CBIC GST News & Circular Banner (`/` & `/dashboard`).
  - `backend/regulatory_scraper.py`: Added `get_banner_circulars()` and `sync_and_store_cbic_circulars()` with Firestore persistence, `system_metadata/cbic_sync` tracking, and pre-seeded circular fallback.
  - `backend/main.py`: Added unauthenticated `GET /api/regulatory/banner` and Cloud Scheduler cron `POST /api/cron/sync-cbic` protected by `X-Cron-Secret` header (matching `CRON_SECRET`), strictly targeting `cbic.gov.in`.
  - `frontend/src/lib/api.ts`: Added `getCBICBannerUpdates()` client API method.
  - `frontend/src/components/GstNewsBanner.tsx`: Created compact, dismissible, clickable banner with live pulse indicator, circular category, shopkeeper impact text, last synced timestamp, and next/prev carousel.
  - `frontend/src/app/page.tsx`: Mounted `GstNewsBanner` at the top of the public landing page.
  - `frontend/src/app/dashboard/page.tsx`: Mounted `GstNewsBanner` at the top of the dashboard shell with direct tab routing to CBIC Radar.
  - Verification: FastAPI test client passed for both endpoints (including 401 on missing secret and 200 on authorized cron), and Next.js production build completed with 0 errors and 0 warnings.
- [x] **Milestone 8 Completed:** Real Multimodal Extraction, Rule 46(b) Validator & Searchable HSN/SAC Override.
  - `data/hsn_master.json`: Added verified Service SAC codes (`998513` Placement & Recruitment Services at 18%, `998313` IT Systems Consulting at 18%, `9985` Support Services at 18%).
  - `backend/tax_engine.py`: Implemented `validate_and_suggest_invoice_number(inum)` enforcing Rule 46(b) (max 16 chars `[A-Za-z0-9/-]`), month name abbreviation (`October` -> `OCT`), and safe character compaction.
  - `backend/ai_service.py`: Enriched `ExtractedBill` schema with customer GSTIN/name, taxable value, CGST/SGST/IGST, Rule 46(b) flags (`invoice_number_valid`, `invoice_number_error`, `suggested_invoice_number`), and explicit fallback warning flags (`extraction_source`, `extraction_warning`); broadened HSN prompt grounding to include service SACs alongside shop categories.
  - `backend/main.py`: Fixed MIME-type detection in `/api/bills/extract` for real `.pdf`, `.jpg`, `.png`, and `.webp` uploads; added `GET /api/hsn/list` and enhanced `GET /api/hsn/search`.
  - `frontend/src/lib/api.ts`: Added `searchHSNCodes` and `listHSNCodes` methods.
  - `frontend/src/app/dashboard/page.tsx`: Added AI extraction notice banner when API key is missing or calls fail; highlighted invalid Rule 46(b) invoice numbers with amber warning tooltip, inline editable input, and 1-tap **"Use `<suggested>`"** button; replaced static HSN badge with an interactive searchable HSN/SAC dropdown + custom code input.
  - Verification: All Python unit tests passed (Rule 46b month abbreviation, HSN search, fallback warning), and Next.js production build (`next build`) compiled with 0 errors and 0 warnings.
- [x] **Milestone 9 Completed:** On-Demand AI & Zero-Waste Credit Architecture.
  - `backend/requirements.txt`: Added `pypdf>=4.0.0` for selectable text PDF extraction and scanned PDF detection.
  - `backend/ai_service.py`:
    - SHA-256 document fingerprinting (`compute_sha256`) and multi-layer caching (`_AI_CACHE` + Firestore `ai_cache/{sha256}`) preventing repeat token consumption (`cached: True`, `credits_consumed: 0`).
    - PDF text inspection via `pypdf` (`inspect_pdf_text`): classifies documents with `< 80` chars as scanned / image-embedded (`is_image_pdf = True`).
    - Fast deterministic Python extraction (`extract_deterministic_from_text`) for true digital PDFs and CSV/Excel files (₹0 cost, 0 AI tokens).
    - Smart vs. Manual AI modes: in `ai_mode == "manual"`, images and scanned PDFs return an instant zero-credit placeholder flagged `needs_ai_scan = True`.
    - Dedicated `ai_enrich_bill()` method for on-demand Gemini Vision execution on specific bill files.
  - `backend/main.py`:
    - Updated `POST /api/bills/extract` to support `ai_mode` ("smart" | "manual"), compute SHA-256 cache hits, and link uploaded file storage records.
    - Added `POST /api/bills/ai-enrich` endpoint to run on-demand multimodal scans on specific bill rows.
  - `frontend/src/lib/api.ts`: Added `aiEnrichBill()` client method and updated `extractBills()` to support `ai_mode`.
  - `frontend/src/app/dashboard/page.tsx`:
    - Added "AI Mode: Smart Auto | On-Demand" toggle pill in the dashboard top bar with a real-time credit meter badge showing live savings (`0 AI credits used (Python/Cache)` vs. `Gemini credit` when invoked).
    - In Tab 1 (`Bills to GSTR-1`), added an interactive **"✨ AI Vision Scan"** gradient button on individual rows requiring visual analysis, with live loading states and attribution tags (`⚡ SHA-256 Cached (0 Cr)`, `⚙️ Python Fast (0 Cr)`, `✨ Gemini Flash (1 Cr)`).
  - Verification: Comprehensive integration tests passed (SHA-256 cache hits, deterministic extraction, manual mode placeholders, storage upload & retrieval, and `/api/bills/ai-enrich` endpoint), and Next.js production build (`next build`) compiled with 0 errors and 0 warnings.
- [x] **Milestone 10 Completed:** Vertex AI Mode & Multi-Bill Batch Queue with Deduplication.
  - `backend/.env` & `backend/.env.example`: Added `GOOGLE_GENAI_USE_VERTEXAI=true`, `VERTEX_LOCATION=us-central1`, and `CRON_SECRET=khatalens-cron-secret-2026`.
  - `backend/ai_service.py`:
    - Updated `get_genai_client()` to support Vertex AI (`genai.Client(vertexai=True, project=..., location=...)`) using `GOOGLE_APPLICATION_CREDENTIALS` (`backend/serviceAccountKey.json`), reading `project_id` from service account credentials if `GCP_PROJECT_ID` is unset, falling back to `GEMINI_API_KEY`.
    - Switched to Vertex-compatible Gemini models (`gemini-2.5-flash` primary for bill vision and tabular column mapping; `gemini-2.5-pro` for notice decoding with fallback hierarchy).
    - Trapped `402` (depleted prepayment), `403` (permission / disabled API), and `429` (rate limits) into friendly shopkeeper notices in `extraction_warning` instead of HTTP 500 crashes.
  - `frontend/src/app/dashboard/page.tsx`:
    - Enabled `multiple` file selection and interactive drag-and-drop dropzone (`onDragOver`, `onDragLeave`, `onDrop`) for photos, PDFs, and spreadsheets.
    - Implemented a 3-worker bounded parallel execution queue using `Promise.allSettled` with live progress indicator (`Processing X of Y bills (Z%)...`).
    - Added per-file error isolation so failures on individual files do not halt batch extraction.
    - Added session deduplication by `SHA-256` or `invoice_number + recipient_gstin` to avoid duplicate rows.
    - Added a compact batch summary badge (`Y bills processed: A via Python/Cache [0 Cr], B via Gemini Vision [B Cr], C duplicates skipped`).
  - Verification: Integration tests passed for Vertex client init, 403/402 error trapping, CBIC banner and Cloud Scheduler cron endpoints, and Next.js production build (`next build`) compiled with 0 errors and 0 warnings.
  - Next.js Dev Server Cache Cleanup: Cleared corrupted `.next` cache generated during concurrent production build, restarted `next dev -p 3000`, and confirmed Tailwind CSS stylesheet (`layout.css`, 41KB) returns 200 OK.
  - API Key & Error Handling: Improved diagnostic message in `backend/ai_service.py` to identify invalid API key prefixes (`AQ.` vs. Google AI Studio `AIzaSy...`) and pending Vertex AI Model Garden approvals without triggering misleading "missing key" notices.
  - Vertex AI Priority Initialization: `backend/ai_service.py` prioritizes `GOOGLE_GENAI_USE_VERTEXAI=true` before developer key check, resolving credentials and `project_id` from `VERTEX_SERVICE_ACCOUNT_PATH` (`backend/vertexAccountKey.json`), trapping 402/403/404/429 errors cleanly, and Next.js production build (`next build`) compiled with 0 errors and 0 warnings.
  - Active Model Pipeline Update: Configured `gemini-flash-lite-latest` and `gemini-3.8-flash` in `backend/ai_service.py` with automatic fallback to active developer `GEMINI_API_KEY` bound to GCP project `137062292179`, verified with 100% successful multimodal vision extraction.
- [x] **Milestone 11 Completed:** Permanent Fix for Stale Fallback Warnings & Cache Invalidation.
  - `backend/ai_service.py`:
    - Updated `get_cached_extraction` and `save_cached_extraction` to strictly never store or return error/fallback payloads (`api_key_missing`, `gemini_api_error`, `vertex_ai_error`, or any record with `extraction_warning`), eliminating sticky error loops.
    - Updated `get_genai_client()` and fallback attempts to explicitly pass `vertexai=False` when using `GEMINI_API_KEY`, preventing `google-genai` from auto-routing to blocked Vertex AI prediction endpoints.
  - `backend/.env` & `.env`: Configured `GOOGLE_GENAI_USE_VERTEXAI=false` and active working developer `GEMINI_API_KEY`.
  - Database Cache Purge: Wiped 5 stale fallback documents from Firestore `ai_cache` collection.
  - `frontend/src/app/dashboard/page.tsx`: Added an interactive dismiss `(✕)` button to the `AI Extraction Notice` amber alert and a `"Clear All"` button to reset in-browser table state.
  - Verification: Live multimodal extraction tested via `POST /api/bills/extract` returning `extraction_source: "gemini_ai"`, `extraction_warning: null`, and `next build` compiled with 0 errors and 0 warnings.
- [x] **Milestone 12 Completed:** Cloud Run Containerization & Automated Deployment Pipeline.
  - Installed Google Cloud CLI (`gcloud 594.0.0`) in `/Users/nabin/.local/bin/gcloud`.
  - Created `backend/Dockerfile` (Python 3.11-slim, dynamic `$PORT` handling for Cloud Run, bundled HSN master data).
  - Created `backend/.dockerignore`.
  - Created `frontend/Dockerfile` (Node 20-alpine multi-stage build leveraging Next.js standalone output).
  - Created `frontend/.dockerignore`.
  - Created automated deployment script `deploy-cloudrun.sh` enforcing `asia-south1` (Mumbai) residency for both backend and frontend services.
  - Public Test Deployment: Deployed global HTTPS Cloudflare tunnel proxy with Next.js API route rewrites, enabling live testing on mobile and external devices at `https://updating-factory-encoding-oaks.trycloudflare.com`.
- [x] **Milestone 13 Completed:** Git Initialized & Committed (Clean Secrets Exclusion).
  - Configured bulletproof `.gitignore` strictly excluding all environment files (`.env`, `.env.local`, `.env.*`), private keys, service account credentials (`*AccountKey.json`, `buildathon-*.json`), virtual environments (`.venv`), and dependencies.
  - Initialized git repository on branch `main` and pushed to remote `https://github.com/navingour/khatalens-ai`.
  - Committed MVP codebase cleanly under author `Nabin Gour <navingour@gmail.com>`.
- [x] **Milestone 14 Completed:** Indian Sovereign AI Integration via Sarvam AI (Indus Platform).
  - `backend/.env` & `backend/.env.example`: Added `AI_PROVIDER=sarvam` and `SARVAM_API_KEY`.
  - `backend/ai_service.py`:
    - Integrated Sarvam Document AI API (`POST /doc-ai/v1/job/parse`) for high-fidelity Indian bill/invoice OCR and layout parsing.
    - Integrated Sarvam 105B Reasoning (`sarvam-105b-conversations` via `POST /v1/chat/completions`) for structured JSON extraction with HSN/SAC grounding.
    - Wired Sarvam AI into multimodal bill extraction (`_call_gemini_multimodal_bill`), tabular column mapping (`_map_columns_with_gemini`), and GST scrutiny notice decoding (`decode_gst_notice`) with graceful Gemini/heuristic fallback.
    - Enforced zero hallucination: non-invoice imagery (playing cards, scenery) is accurately identified with `invoice_number = "NOT_FOUND"` and descriptive notes.
  - `frontend/src/app/dashboard/page.tsx`:
    - Updated credit attribution badges to render `🇮🇳 Sarvam AI (105B)` when `extraction_source === "sarvam_ai"`.
    - Updated live credit meter and batch summary banners to reflect sovereign AI usage.
  - Verification: Live integration tested across bill vision extraction and ASMT-10 notice scrutiny; Next.js production build (`next build`) compiled with 0 errors and 0 warnings.
  - End-to-End Test Suite: `backend/tests/test_e2e_app.py` executed successfully with 100% passing tests (HTTP 200 on landing page, dashboard, onboarding, CBIC regulatory news API, demo seeding, GSTR-1 JSON compilation, GSTR-2B ITC reconciliation, Section 47/50 late fee engine, and Sarvam AI notice decoder).
  - Live Public Deployment: Tested and verified reachable over HTTPS at `https://lighter-journey-law-roulette.trycloudflare.com`.
