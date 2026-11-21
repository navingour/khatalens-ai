/**
 * KhataLens AI — Typed API Client for FastAPI Backend
 * Automatically attaches:
 * 1. Bearer Token (Firebase Auth / Dev Token)
 * 2. X-Device-Fingerprint (Browser device fingerprint for 2-free-notice gate)
 */

import { getDeviceFingerprint } from "./device_fingerprint";
import { getCurrentUserToken } from "./firebase";

function getApiUrl(endpoint: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  const cleanEndpoint = endpoint.replace(/^\//, "");
  return base ? `${base.replace(/\/$/, "")}/${cleanEndpoint}` : `/${cleanEndpoint}`;
}

async function getHeaders(customHeaders: Record<string, string> = {}): Promise<HeadersInit> {
  const token = await getCurrentUserToken();
  const fingerprint = getDeviceFingerprint();

  return {
    "X-Device-Fingerprint": fingerprint,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...customHeaders,
  };
}

export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = getApiUrl(endpoint);
  const defaultHeaders = await getHeaders({
    "Content-Type": "application/json",
  });

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let errorDetail = "API request failed";
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || errJson.message || JSON.stringify(errJson);
    } catch {
      errorDetail = `HTTP ${response.status} ${response.statusText}`;
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

// =====================================================================
// Specific Service APIs
// =====================================================================

export async function lookupGSTIN(gstin: string) {
  return apiFetch("/api/gstin/lookup", {
    method: "POST",
    body: JSON.stringify({ gstin }),
  });
}

export async function fetchStatesRegistry() {
  return apiFetch<{ state_code: string; state_name: string }[]>("/api/gstin/states");
}

export async function extractBills(formData: FormData) {
  const url = getApiUrl("/api/bills/extract");
  const headers = await getHeaders();
  // Don't set Content-Type for FormData so boundary is added automatically

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Extraction failed" }));
    throw new Error(err.detail || "Failed to extract bills.");
  }

  return response.json();
}

export async function aiEnrichBill(payload: {
  file_id: string;
  shop_gstin: string;
  shop_category?: string;
}) {
  const url = getApiUrl("/api/bills/ai-enrich");
  const headers = await getHeaders();

  const formData = new FormData();
  formData.append("file_id", payload.file_id);
  formData.append("shop_gstin", payload.shop_gstin);
  if (payload.shop_category) {
    formData.append("shop_category", payload.shop_category);
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "AI Vision scan failed" }));
    throw new Error(err.detail || "Failed to run AI Vision scan.");
  }

  return response.json();
}

export async function compileGSTR1(payload: {
  gstin: string;
  filing_period: string;
  invoices: any[];
  gross_turnover?: number;
}) {
  return apiFetch("/api/bills/compile-gstr1", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function reconcileGSTR2B(payload: {
  purchase_bills: any[];
  gstr2b_json: any;
}) {
  return apiFetch("/api/reconciliation/gstr2b", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function calculateLateFee(payload: {
  return_type: string;
  due_date: string;
  filing_date: string;
  turnover_slab: string;
  is_nil?: boolean;
  net_cash_liability?: number;
}) {
  return apiFetch("/api/calculator/late-fee", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function decodeNotice(formData: FormData) {
  const url = getApiUrl("/api/notices/decode");
  const headers = await getHeaders();

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Notice decode failed" }));
    throw new Error(err.detail || "Failed to decode notice.");
  }

  return response.json();
}

export async function getNoticeQuota(phone: string, gstin: string) {
  const fp = getDeviceFingerprint();
  const query = new URLSearchParams({
    phone,
    gstin,
    device_fingerprint: fp,
  }).toString();
  return apiFetch(`/api/notices/quota?${query}`);
}

export async function getCBICBannerUpdates() {
  return apiFetch<{
    updates: any[];
    last_synced: string;
    count: number;
    source: string;
  }>("/api/regulatory/banner");
}

export async function getCBICCirculars() {
  return apiFetch("/api/regulatory/circulars");
}

export async function syncCBICCirculars() {
  return apiFetch("/api/regulatory/sync", { method: "POST" });
}

export async function getPractitioners(location?: string) {
  const query = location ? `?location=${encodeURIComponent(location)}` : "";
  return apiFetch(`/api/practitioners${query}`);
}

export async function seedDemoSamples() {
  return apiFetch("/api/demo/seed-samples", { method: "POST" });
}

export async function searchHSNCodes(query?: string, category?: string) {
  const params = new URLSearchParams();
  if (query) params.append("q", query);
  if (category) params.append("category", category);
  const qStr = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<{ results: any[]; total: number }>(`/api/hsn/search${qStr}`);
}

export async function listHSNCodes() {
  return apiFetch<{ codes: any[]; total: number }>("/api/hsn/list");
}
