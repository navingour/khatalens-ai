cat << 'EOF' > GEMINI.md
# KhataLens AI — Master Agent Rules & Auto-Skill Router

## 1. Mandatory Session Protocol
1. **Read State First:** Before writing or modifying any code, always read `SPRINT_STATE.md` in the workspace root so you never break completed features or forget locked decisions.
2. **Update State After Every Task:** After completing any feature or bug fix, append a short bullet under `## Completed & Locked` in `SPRINT_STATE.md` listing the exact files created or modified.
3. **Plan Before Editing:** For any multi-file change or new module, output a brief 3-to-5 line execution plan showing which exact files and functions will be touched before modifying code.

## 2. Automatic Skill Routing (Do Not Wait for Manual Invocation)
Automatically activate the matching skill below based on the user's request—never load conflicting UI skills together:
- **Any Code Edit, Bug Fix, or Backend Feature:** Always enforce `karpathy-guidelines` (modify ONLY the requested function/component, never rewrite entire files, never rename working variables, never add unrequested abstractions).
- **Python Environment or Packages:** Automatically use `managing-python-dependencies` when creating or updating `requirements.txt` or virtual environments.
- **Creating or Styling Frontend UI Screens:** Automatically use `ui-ux-pro-max` paired with `ui-styling` (Tailwind CSS + shadcn/ui). Do NOT invoke `design-taste-frontend`, `frontend-design`, `design-system`, or `brand` unless explicitly asked.
- **UI Review & Mobile Audit:** Automatically use `web-design-guidelines` when asked to review, audit, or check responsiveness/accessibility.
- **Google Cloud / Deployment / Bucket Commands:** Automatically enforce `accidental-data-loss-prevention` before running any `gcloud`, Firebase, or storage lifecycle commands.

## 3. Non-Negotiable Architecture & Product Locks
- **Data Residency & Privacy:** All Google Cloud resources (Cloud Run, Firestore, Cloud Storage) must target `asia-south1` (Mumbai). Raw bill photos and notice PDFs must use a 30-day Object Lifecycle auto-delete policy with Soft Delete disabled.
- **Strict Math vs. AI Separation:**
  - **Deterministic Python (`backend/tax_engine.py`):** Must handle 100% of GSTR-1 JSON schema generation, tax slab arithmetic, GSTR-2B ITC matching, and Section 47/50 late fee and interest math. Never let an LLM calculate tax or penalty numbers.
  - **Google AI (`backend/ai_service.py`):** Use `gemini-3.5-flash-lite` or `gemini-3.8-flash` for daily/weekend bill vision extraction and profile-based 4/6-digit HSN suggestion. Use `gemini-4-hydrogen` strictly for GST notice decoding (`ASMT-10` / `DRC-01`) and daily `cbic.gov.in` circular summaries.
- **Compliant Scraping Only:** The daily regulatory scraper must fetch public circulars only from `cbic.gov.in` (never scrape `gst.gov.in`), with pre-seeded fallback circulars in Firestore so demos never stall.
- **Notice Usage Gate:** Track up to 2 free GST notice decodes per shop bound to verified phone number + GSTIN + browser device fingerprint. Do not hardcode subscription pricing plans or payment amounts in the UI unless explicitly instructed later.

## 4. Human Copy & Communication Rules
- **App UI & AI Output for Shopkeepers:** Write in plain, everyday Indian business English. Replace accounting jargon with simple terms (e.g., use "Your Sales Bills" instead of "Outward Taxable Supplies"). Every notice explanation or alert must state: (1) What happened, (2) Exact amount in ₹, and (3) Next action step. Avoid em-dashes and unnecessary hyphens.
- **Replies to Founder:** Be concise, direct, and practical. Skip robotic greetings or filler summaries.
EOF