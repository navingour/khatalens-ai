import type { Metadata, Viewport } from "next";
import "./globals.css";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "KhataLens AI — Indian GST & MSME Compliance SaaS",
  description: "Turn sales bills into 100% valid GSTR-1, detect GSTR-2B ITC leaks, and decode GST scrutiny notices in plain English.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0F766E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        {/* Top Trust & Data Residency Bar */}
        <div className="bg-slate-900 text-slate-300 px-4 py-1.5 text-xs font-medium flex flex-wrap items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse-subtle" />
            <span>🇮🇳 Cloud Run & Firestore: <strong>asia-south1 (Mumbai)</strong></span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="flex items-center gap-1 text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Raw Bill Photos Auto-Purged in 30 Days (Soft Delete Disabled)
            </span>
            <span className="hidden sm:inline text-teal-400 font-semibold">
              Kolkata Buildathon 2026
            </span>
          </div>
        </div>

        {/* Global Navigation Header */}
        <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-teal-700 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                K
              </div>
              <div>
                <span className="font-extrabold text-lg tracking-tight text-slate-900">
                  KhataLens <span className="text-teal-700">AI</span>
                </span>
                <span className="hidden md:inline ml-2 text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 font-semibold border border-teal-200">
                  MSME GST Engine
                </span>
              </div>
            </Link>

            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="text-xs sm:text-sm font-semibold text-slate-700 hover:text-teal-700 px-3 py-1.5 rounded-md hover:bg-slate-100 transition"
              >
                Dashboard
              </Link>
              <Link
                href="/onboarding"
                className="text-xs sm:text-sm font-semibold bg-teal-700 hover:bg-teal-800 text-white px-4 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5"
              >
                <span>Setup Shop</span>
                <span className="hidden sm:inline text-teal-200 text-xs font-normal">(1-Min)</span>
              </Link>
            </div>
          </div>
        </header>

        {/* Main Body */}
        <main className="flex-1">{children}</main>

        {/* Footer */}
        <footer className="bg-white border-t border-slate-200 py-6 px-4 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <p>© 2026 KhataLens AI — Built for Indian Shopkeepers & MSMEs. Non-negotiable math vs. AI separation.</p>
            <div className="flex items-center gap-4 text-slate-600">
              <span>Cloud Run (asia-south1)</span>
              <span>•</span>
              <span>Firestore Multi-Tenant</span>
              <span>•</span>
              <span>Gemini 3.8 Flash & 4 Hydrogen</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
