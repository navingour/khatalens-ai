/**
 * KhataLens AI — Persistent Browser Device Fingerprint Utility
 * Used for 2-Free-Notice Gate binding alongside verified Phone & GSTIN.
 */

export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") {
    return "server-fingerprint";
  }

  const STORAGE_KEY = "khatalens_device_fp";
  let existing = localStorage.getItem(STORAGE_KEY);
  if (existing) {
    return existing;
  }

  try {
    const nav = window.navigator;
    const screen = window.screen;
    const components = [
      nav.userAgent || "",
      nav.language || "",
      screen.colorDepth || "",
      screen.width + "x" + screen.height,
      new Date().getTimezoneOffset(),
      nav.hardwareConcurrency || 4,
    ];

    // Simple deterministic hash
    const raw = components.join("###");
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }

    const generated = "fp_" + Math.abs(hash).toString(36) + "_" + Math.random().toString(36).substring(2, 8);
    localStorage.setItem(STORAGE_KEY, generated);
    return generated;
  } catch {
    const fallback = "fp_fallback_" + Math.random().toString(36).substring(2, 10);
    try {
      localStorage.setItem(STORAGE_KEY, fallback);
    } catch {
      // ignore
    }
    return fallback;
  }
}
