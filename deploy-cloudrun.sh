#!/usr/bin/env bash
set -eo pipefail

# KhataLens AI — Google Cloud Run Automated Deployment
# Target Region: asia-south1 (Mumbai, India) strictly per GEMINI.md

PROJECT_ID="${1:-buildathon-20-11-26}"
REGION="asia-south1"

echo "=========================================================="
echo "KhataLens AI — Deploying to Google Cloud Run (asia-south1)"
echo "=========================================================="
echo "Project ID : ${PROJECT_ID}"
echo "Region     : ${REGION} (Mumbai)"
echo "=========================================================="

# 1. Verify gcloud CLI is available
GCLOUD_BIN=$(which gcloud 2>/dev/null || echo "/Users/nabin/.local/bin/gcloud")
if [ ! -x "${GCLOUD_BIN}" ]; then
  echo "Error: gcloud CLI not found."
  exit 1
fi

echo "Using gcloud: $(${GCLOUD_BIN} version | head -n 1)"

# 2. Check active auth
ACTIVE_ACCOUNT=$(${GCLOUD_BIN} auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || true)
if [ -z "${ACTIVE_ACCOUNT}" ]; then
  echo ""
  echo "No active Google Cloud account found in gcloud."
  echo "Please run: gcloud auth login"
  echo ""
  exit 1
fi
echo "Authenticated as: ${ACTIVE_ACCOUNT}"

# 3. Set project
${GCLOUD_BIN} config set project "${PROJECT_ID}"
${GCLOUD_BIN} config set run/region "${REGION}"

# 4. Enable required GCP services
echo "Enabling Cloud Run & Cloud Build APIs..."
${GCLOUD_BIN} services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project "${PROJECT_ID}" || true

# 5. Extract API keys from backend/.env or environment variable
SARVAM_KEY="${SARVAM_API_KEY:-$(grep "^SARVAM_API_KEY=" backend/.env 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)}"
GEMINI_KEY="${GEMINI_API_KEY:-$(grep "^GEMINI_API_KEY=" backend/.env 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)}"

if [ -z "${SARVAM_KEY}" ] && [ -z "${GEMINI_KEY}" ]; then
  echo "Error: Neither SARVAM_API_KEY nor GEMINI_API_KEY is set in backend/.env or environment."
  exit 1
fi

# 6. Deploy Backend Service to Cloud Run
echo ""
echo ">>> [1/2] Deploying khatalens-backend to Cloud Run (${REGION})..."
${GCLOUD_BIN} run deploy khatalens-backend \
  --source ./backend \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --set-env-vars "GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION},ENVIRONMENT=production,AI_PROVIDER=sarvam,SARVAM_API_KEY=${SARVAM_KEY},GEMINI_API_KEY=${GEMINI_KEY},CRON_SECRET=khatalens-cron-secret-2026,ALLOW_DEV_AUTH=True" \
  --project "${PROJECT_ID}"

BACKEND_URL=$(${GCLOUD_BIN} run services describe khatalens-backend --region "${REGION}" --project "${PROJECT_ID}" --format='value(status.url)')
echo "✓ Backend live at: ${BACKEND_URL}"

# 7. Deploy Frontend Service to Cloud Run
echo ""
echo ">>> [2/2] Deploying khatalens-frontend to Cloud Run (${REGION})..."
${GCLOUD_BIN} run deploy khatalens-frontend \
  --source ./frontend \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --set-env-vars "NEXT_PUBLIC_API_URL=${BACKEND_URL},NEXT_PUBLIC_FIREBASE_PROJECT_ID=${PROJECT_ID}" \
  --project "${PROJECT_ID}"

FRONTEND_URL=$(${GCLOUD_BIN} run services describe khatalens-frontend --region "${REGION}" --project "${PROJECT_ID}" --format='value(status.url)')
echo "✓ Frontend live at: ${FRONTEND_URL}"

echo ""
echo "=========================================================="
echo "🚀 KhataLens AI Successfully Deployed to Google Cloud Run!"
echo "=========================================================="
echo "Backend URL  : ${BACKEND_URL}"
echo "Frontend URL : ${FRONTEND_URL}"
echo "Region       : ${REGION} (Mumbai, India)"
echo "Health Check : curl ${BACKEND_URL}/health"
echo "=========================================================="
