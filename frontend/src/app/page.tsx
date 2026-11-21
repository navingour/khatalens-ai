"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileUp,
  ShieldAlert,
  Calculator,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Lock,
  Layers,
  MapPin,
  HelpCircle,
  FileText,
  UserCheck,
} from "lucide-react";
import { loginWithGoogle, loginAsDemoUser } from "@/lib/firebase";
import { seedDemoSamples } from "@/lib/api";
import GstNewsBanner from "@/components/GstNewsBanner";

export default function LandingPage() {
  const router = useRouter();
  const [loadingDemo, setLoadingDemo] = useState(false);

  const handleDemoSignIn = async () => {
    setLoadingDemo(true);
    try {
      await loginAsDemoUser();
      // Pre-seed demo samples in backend so everything works instantly
      try {
        await seedDemoSamples();
      } catch (e) {
        // non-blocking
      }
      router.push("/dashboard");
    } finally {
      setLoadingDemo(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await loginWithGoogle();
      router.push("/onboarding");
    } catch {
      router.push("/onboarding");
    }
  };

  return (
    <div className="space-y-10 sm:space-y-14 py-4 sm:py-6 px-4 sm:px-6 max-w-7xl mx-auto">
      {/* 6-Hour CBIC Regulatory Alert Banner */}
      <GstNewsBanner />

      {/* Hero Section */}
      <section className="text-center space-y-6 pt-4 sm:pt-8 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs sm:text-sm font-semibold">
          <Sparkles className="w-4 h-4 text-teal-600" />
          <span>Startup Buildathon India 2026 — Kolkata Edition</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
          Turn Daily Bills into 100% Valid{" "}
          <span className="text-teal-700 underline decoration-teal-300">GSTR-1 JSON</span> in Seconds
        </h1>

        <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
          The no-stress GST compliance PWA built for Indian shopkeepers & MSMEs. 
          Snap bill photos, catch missing supplier filings before paying, and decode scary GST notices with zero accounting jargon.
        </p>

        {/* Call to Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <button
            onClick={handleDemoSignIn}
            disabled={loadingDemo}
            className="w-full sm:w-auto px-6 py-3.5 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 group"
          >
            <span>{loadingDemo ? "Launching Demo..." : "1-Click Live Demo Experience"}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>

          <button
            onClick={handleGoogleSignIn}
            className="w-full sm:w-auto px-6 py-3.5 bg-white hover:bg-slate-50 text-slate-800 font-semibold rounded-xl border border-slate-300 shadow-sm transition flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Sign In with Google</span>
          </button>
        </div>

        {/* Free Notice Decoder Hook */}
        <div className="pt-2">
          <Link
            href="/dashboard?tab=notices"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3.5 py-1.5 rounded-full transition"
          >
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <span>Received an ASMT-10 or DRC-01 notice? Try 2 Free Notice Decodes →</span>
          </Link>
        </div>
      </section>

      {/* 3 Core Trust Pillars */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
            🇮🇳
          </div>
          <h3 className="text-lg font-bold text-slate-900">100% India Data Residency</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            All Cloud Run instances, Firestore records, and Storage buckets reside in <strong>asia-south1 (Mumbai)</strong>.
            Your shop ledger never leaves Indian borders.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <Lock className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">30-Day Auto-Purge Privacy</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Raw mobile photos and PDFs are purged automatically after 30 days using Google Cloud Lifecycle policies with Soft Delete disabled.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
            <Calculator className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Deterministic Math Engine</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            100% of GST tax rates, GSTR-1 JSON schema compilation, and Section 47/50 late fee math is calculated in strict Python. No AI hallucinated numbers.
          </p>
        </div>
      </section>

      {/* 5 Flagship Features in 1 App Shell */}
      <section className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Everything Your Shop Needs Every Month</h2>
          <p className="text-sm text-slate-600">5 essential compliance tools unified in one fast dashboard</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-2.5">
            <div className="text-teal-700 font-bold text-sm flex items-center gap-1.5">
              <FileUp className="w-4 h-4" />
              <span>1. Bills to GSTR-1</span>
            </div>
            <h4 className="font-bold text-slate-900">Snap Photo, Get Portal JSON</h4>
            <p className="text-xs text-slate-600">
              Upload photos, PDFs, or Excel sheets. Gemini extracts line items & suggests 4/6-digit HSN codes, then generates official portal-ready GSTR-1 JSON.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-2.5">
            <div className="text-amber-700 font-bold text-sm flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" />
              <span>2. GSTR-2B ITC Leak Check</span>
            </div>
            <h4 className="font-bold text-slate-900">Catch Defaulting Suppliers</h4>
            <p className="text-xs text-slate-600">
              Match your purchase bills against the government GSTR-2B file. Instantly see unfiled invoices and exact ₹ ITC you are at risk of losing.
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-2.5">
            <div className="text-indigo-700 font-bold text-sm flex items-center gap-1.5">
              <Calculator className="w-4 h-4" />
              <span>3. Late Fee & Interest Math</span>
            </div>
            <h4 className="font-bold text-slate-900">Never Overpay Penalties</h4>
            <p className="text-xs text-slate-600">
              Calculates Section 47 daily late fees with exact turnover caps (≤₹1.5Cr, ₹1.5-5Cr, &gt;₹5Cr) and 18% interest strictly on GSTR-3B cash tax.
            </p>
          </div>

          {/* Card 4 */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-2.5">
            <div className="text-rose-700 font-bold text-sm flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              <span>4. Notice Decoder (2 Free)</span>
            </div>
            <h4 className="font-bold text-slate-900">ASMT-10 & DRC-01 in Plain English</h4>
            <p className="text-xs text-slate-600">
              Upload scrutiny notice PDFs to see: (1) What happened, (2) Exact amount in ₹, and (3) Step-by-step response action items with deadlines.
            </p>
          </div>

          {/* Card 5 */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-2.5 sm:col-span-2 lg:col-span-2">
            <div className="text-emerald-700 font-bold text-sm flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              <span>5. CBIC Radar & Kolkata Verified Pros</span>
            </div>
            <h4 className="font-bold text-slate-900">Daily Public Circulars + 1-Click CA Consultation</h4>
            <p className="text-xs text-slate-600">
              Live updates scraped strictly from cbic.gov.in (never gst.gov.in) with plain shopkeeper impact summaries, plus direct handoff to verified Kolkata GST practitioners across Dalhousie, Burrabazar, and Salt Lake.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="bg-teal-800 text-white p-8 rounded-3xl text-center space-y-4 shadow-lg">
        <h2 className="text-2xl sm:text-3xl font-extrabold">Ready to file stress-free this month?</h2>
        <p className="text-teal-100 text-sm max-w-xl mx-auto">
          Takes under 60 seconds to set up your shop with automatic GSTIN details lookup.
        </p>
        <div className="pt-2 flex justify-center">
          <Link
            href="/onboarding"
            className="px-8 py-3 bg-white text-teal-900 font-bold rounded-xl shadow-md hover:bg-teal-50 transition"
          >
            Start 1-Minute Shop Setup →
          </Link>
        </div>
      </section>
    </div>
  );
}
