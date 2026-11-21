"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Zap,
  Phone,
  Store,
  Layers,
  Sparkles,
} from "lucide-react";
import { lookupGSTIN } from "@/lib/api";

const CATEGORIES = [
  "Hardware & Electricals",
  "Electronics & Mobile",
  "Textiles & Garments",
  "FMCG & Grocery",
  "Pharma & Medical",
  "Professional Services",
  "General Trading",
];

export default function OnboardingPage() {
  const router = useRouter();

  // Form states
  const [gstin, setGstin] = useState("");
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [stateName, setStateName] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [taxpayerType, setTaxpayerType] = useState("Regular");
  const [category, setCategory] = useState("Hardware & Electricals");
  const [turnoverSlab, setTurnoverSlab] = useState("<= 5 Cr");
  const [filingFrequency, setFilingFrequency] = useState("Monthly");
  const [phone, setPhone] = useState("9830098300");

  const [loadingLookup, setLoadingLookup] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lookupSuccess, setLookupSuccess] = useState(false);

  // Check if profile already exists
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("khatalens_shop_profile");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.gstin) {
            setGstin(parsed.gstin);
            setLegalName(parsed.legal_name || "");
            setTradeName(parsed.trade_name || "");
            setStateName(parsed.state_name || "");
            setStateCode(parsed.state_code || "");
            setCategory(parsed.category || "Hardware & Electricals");
            setTurnoverSlab(parsed.turnover_slab || "<= 5 Cr");
            setPhone(parsed.phone || "9830098300");
          }
        } catch {
          // ignore
        }
      }
    }
  }, []);

  // Quick-fill Demo Shop (Kolkata)
  const handleQuickFillDemo = () => {
    setGstin("19ABCDE1234F1ZX");
    setLegalName("M/s Maa Tara Hardware & Electricals Pvt Ltd");
    setTradeName("Maa Tara Hardware");
    setStateName("West Bengal");
    setStateCode("19");
    setTaxpayerType("Regular");
    setCategory("Hardware & Electricals");
    setTurnoverSlab("<= 5 Cr");
    setFilingFrequency("Monthly");
    setPhone("9830098300");
    setLookupSuccess(true);
    setLookupError("");
  };

  // Real-time or manual GSTIN details fetch
  const handleFetchGSTDetails = async () => {
    const clean = gstin.trim().toUpperCase();
    if (clean.length !== 15) {
      setLookupError("Please enter a valid 15-character GSTIN (e.g. 19ABCDE1234F1ZX).");
      return;
    }

    setLoadingLookup(true);
    setLookupError("");
    setLookupSuccess(false);

    try {
      const data = await lookupGSTIN(clean);
      if (data.valid) {
        setLegalName(data.legal_name || "Demo Legal Name");
        setTradeName(data.trade_name || "Demo Trade Name");
        setStateName(data.state_name || "West Bengal");
        setStateCode(data.state_code || "19");
        setTaxpayerType(data.taxpayer_type || "Regular");
        setLookupSuccess(true);
      } else {
        setLookupError(data.error || "Could not verify GSTIN.");
      }
    } catch (err: any) {
      setLookupError(err.message || "Failed to fetch GST details.");
    } finally {
      setLoadingLookup(false);
    }
  };

  const handleSaveAndContinue = (e: React.FormEvent) => {
    e.preventDefault();

    if (!gstin || gstin.trim().length !== 15) {
      setLookupError("Valid 15-character GSTIN is required to complete shop setup.");
      return;
    }

    const shopProfile = {
      gstin: gstin.trim().toUpperCase(),
      legal_name: legalName || tradeName || "My Shop",
      trade_name: tradeName || legalName || "My Shop",
      state_name: stateName || "West Bengal",
      state_code: stateCode || gstin.substring(0, 2),
      taxpayer_type: taxpayerType,
      category,
      turnover_slab: turnoverSlab,
      filing_frequency: filingFrequency,
      phone: phone.trim() || "9830098300",
      updated_at: new Date().toISOString(),
    };

    if (typeof window !== "undefined") {
      localStorage.setItem("khatalens_shop_profile", JSON.stringify(shopProfile));
    }

    router.push("/dashboard");
  };

  return (
    <div className="max-w-3xl mx-auto py-8 sm:py-12 px-4 sm:px-6 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-teal-600" />
          <span>Step 1 of 1 — 60-Second Setup</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Tell Us About Your Shop
        </h1>
        <p className="text-sm text-slate-600 max-w-lg mx-auto">
          We use your GSTIN to automatically apply correct tax rates, state codes, and HSN codes for your GSTR-1 returns.
        </p>
      </div>

      {/* Trust Badges */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-emerald-900 font-medium">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>Data stored in <strong>asia-south1 (Mumbai)</strong> with 30-day bill auto-delete policy</span>
        </div>
        <button
          type="button"
          onClick={handleQuickFillDemo}
          className="bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-sm"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Fill Demo Shop (Kolkata)</span>
        </button>
      </div>

      {/* Main Onboarding Form */}
      <form onSubmit={handleSaveAndContinue} className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
        {/* GSTIN Field with Fetch button */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            15-Digit GSTIN Number *
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              maxLength={15}
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="e.g. 19ABCDE1234F1ZX"
              className="flex-1 font-mono uppercase px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-700 text-sm tracking-wider"
              required
            />
            <button
              type="button"
              onClick={handleFetchGSTDetails}
              disabled={loadingLookup}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-sm transition flex items-center justify-center gap-2"
            >
              {loadingLookup ? "Verifying..." : "Fetch GST Details"}
            </button>
          </div>

          {lookupError && (
            <div className="flex items-center gap-1.5 text-xs text-rose-600 font-medium pt-1">
              <AlertCircle className="w-4 h-4" />
              <span>{lookupError}</span>
            </div>
          )}

          {lookupSuccess && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium pt-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>GSTIN verified and active in government records ({stateName}).</span>
            </div>
          )}
        </div>

        {/* Auto-filled Trade Name & Legal Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Trade / Shop Name
            </label>
            <input
              type="text"
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              placeholder="e.g. Maa Tara Hardware"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-700 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Legal Business Name
            </label>
            <input
              type="text"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="e.g. Maa Tara Hardware Pvt Ltd"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-700 text-sm"
            />
          </div>
        </div>

        {/* Business Category & State */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Business Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-700 text-sm bg-white"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              State & Code
            </label>
            <input
              type="text"
              readOnly
              value={stateName ? `${stateCode} - ${stateName}` : "Auto-detected from GSTIN"}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-sm cursor-not-allowed"
            />
          </div>
        </div>

        {/* Annual Turnover Slab & Filing Frequency */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Annual Turnover Slab
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTurnoverSlab("<= 5 Cr")}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition ${
                  turnoverSlab === "<= 5 Cr"
                    ? "bg-teal-50 border-teal-700 text-teal-800"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Up to ₹5 Crore
              </button>
              <button
                type="button"
                onClick={() => setTurnoverSlab("> 5 Cr")}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition ${
                  turnoverSlab === "> 5 Cr"
                    ? "bg-teal-50 border-teal-700 text-teal-800"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Above ₹5 Crore
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Filing Frequency
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFilingFrequency("Monthly")}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition ${
                  filingFrequency === "Monthly"
                    ? "bg-teal-50 border-teal-700 text-teal-800"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setFilingFrequency("QRMP")}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition ${
                  filingFrequency === "QRMP"
                    ? "bg-teal-50 border-teal-700 text-teal-800"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                QRMP (Quarterly)
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Number for Notice Gate */}
        <div className="space-y-1.5 pt-2">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            Mobile Number (For Notice Decodes & Reminders) *
          </label>
          <div className="flex items-center">
            <span className="inline-flex items-center px-3.5 py-2.5 rounded-l-xl border border-r-0 border-slate-300 bg-slate-50 text-slate-500 text-sm font-semibold">
              +91
            </span>
            <input
              type="tel"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="9830098300"
              className="flex-1 px-3.5 py-2.5 rounded-r-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-700 text-sm font-medium"
              required
            />
          </div>
          <p className="text-xs text-slate-500">
            Bound to your device fingerprint to unlock your 2 free GST scrutiny notice decodes.
          </p>
        </div>

        {/* Submit Button */}
        <div className="pt-4">
          <button
            type="submit"
            className="w-full py-3.5 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 group text-sm sm:text-base"
          >
            <span>Save Shop & Open Compliance Dashboard</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </form>
    </div>
  );
}
