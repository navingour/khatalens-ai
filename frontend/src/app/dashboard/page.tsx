"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  FileUp,
  ShieldAlert,
  Calculator,
  FileText,
  MapPin,
  Download,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Copy,
  RefreshCw,
  Phone,
  Mail,
  User,
  Building,
  Upload,
  Check,
  Zap,
  ChevronDown,
  Search,
} from "lucide-react";
import {
  compileGSTR1,
  reconcileGSTR2B,
  calculateLateFee,
  decodeNotice,
  getNoticeQuota,
  getCBICCirculars,
  syncCBICCirculars,
  getPractitioners,
  seedDemoSamples,
  searchHSNCodes,
  aiEnrichBill,
  extractBills,
} from "@/lib/api";
import GstNewsBanner from "@/components/GstNewsBanner";

type TabType = "bills" | "itc" | "calculator" | "notices" | "radar";

function DashboardContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabType) || "bills";
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // Shop Profile state
  const [shop, setShop] = useState({
    gstin: "19ABCDE1234F1ZX",
    trade_name: "Maa Tara Hardware",
    legal_name: "M/s Maa Tara Hardware & Electricals Pvt Ltd",
    state_code: "19",
    state_name: "West Bengal",
    category: "Hardware & Electricals",
    turnover_slab: "<= 5 Cr",
    phone: "9830098300",
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("khatalens_shop_profile");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.gstin) {
            setShop(parsed);
          }
        } catch {
          // ignore
        }
      }
    }
  }, []);

  // Update tab from query param if changed
  useEffect(() => {
    const t = searchParams.get("tab") as TabType;
    if (t && ["bills", "itc", "calculator", "notices", "radar"].includes(t)) {
      setActiveTab(t);
    }
  }, [searchParams]);

  // ===================================================================
  // TAB 1: Bills to GSTR-1 States
  // ===================================================================
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loadingCompile, setLoadingCompile] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [uploadingBill, setUploadingBill] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [masterHsnList, setMasterHsnList] = useState<any[]>([]);
  const [aiMode, setAiMode] = useState<"smart" | "manual">("smart");
  const [enrichingIndex, setEnrichingIndex] = useState<number | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; active: boolean }>({
    current: 0,
    total: 0,
    active: false,
  });
  const [batchSummary, setBatchSummary] = useState<{
    total: number;
    zeroCredit: number;
    geminiCredit: number;
    skippedDuplicates: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalCreditsUsed = invoices.reduce((acc, inv) => acc + (inv.credits_consumed || 0), 0);

  useEffect(() => {
    searchHSNCodes()
      .then((res) => {
        if (res && res.results) setMasterHsnList(res.results);
      })
      .catch(() => {});
  }, []);

  // Load 3 sample bills for 1-click test
  const handleLoadSampleBills = async () => {
    try {
      const demoData = await seedDemoSamples();
      setInvoices(demoData.sample_sales_invoices);
      setDownloadSuccess(false);
    } catch {
      // Local fallback samples
      setInvoices([
        {
          invoice_number: "INV-2026-001",
          invoice_date: "05-11-2026",
          recipient_gstin: "27AAACW1234F1Z8",
          recipient_name: "Mumbai Heavy Electricals Ltd.",
          pos: "27",
          items: [
            {
              hsn: "848180",
              description: "Industrial Brass Gate Valves",
              quantity: 10,
              uqc: "NOS",
              taxable_amount: 65000,
              gst_rate: 18,
            },
          ],
        },
        {
          invoice_number: "INV-2026-002",
          invoice_date: "08-11-2026",
          recipient_gstin: "",
          recipient_name: "Sunil Mehta (Unregistered)",
          pos: "24",
          items: [
            {
              hsn: "854411",
              description: "Copper Armoured Cables",
              quantity: 2,
              uqc: "NOS",
              taxable_amount: 120000,
              gst_rate: 18,
            },
          ],
        },
        {
          invoice_number: "INV-2026-003",
          invoice_date: "12-11-2026",
          recipient_gstin: "",
          recipient_name: "Local Retail Customer",
          pos: "19",
          items: [
            {
              hsn: "731815",
              description: "Galvanized Hex Bolts & Nuts",
              quantity: 50,
              uqc: "NOS",
              taxable_amount: 8400,
              gst_rate: 18,
            },
          ],
        },
      ]);
    }
  };

  // Multi-Bill Batch Upload with Bounded Concurrency (3 workers) & Deduplication
  const handleBatchFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;

    setUploadingBill(true);
    setUploadError("");
    setBatchSummary(null);
    setBatchProgress({ current: 0, total: files.length, active: true });

    const concurrency = 3;
    const results: any[] = [];
    let nextIdx = 0;
    let completedCount = 0;

    const worker = async () => {
      while (nextIdx < files.length) {
        const curIdx = nextIdx++;
        const file = files[curIdx];
        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("shop_gstin", shop.gstin);
          formData.append("shop_category", shop.category);
          formData.append("ai_mode", aiMode);

          const data = await extractBills(formData);
          results[curIdx] = { status: "fulfilled", value: data, fileName: file.name };
        } catch (err: any) {
          results[curIdx] = {
            status: "rejected",
            reason: err.message || "Failed to extract",
            fileName: file.name,
          };
        } finally {
          completedCount++;
          setBatchProgress({ current: completedCount, total: files.length, active: true });
        }
      }
    };

    const pool = Array.from({ length: Math.min(concurrency, files.length) }, () => worker());
    await Promise.allSettled(pool);

    // Session deduplication by SHA-256 or (invoice_number + customer_gstin)
    const existingKeys = new Set(
      invoices.map((inv) =>
        inv.sha256
          ? `sha_${inv.sha256}`
          : `${(inv.invoice_number || "").trim().toUpperCase()}__${(inv.recipient_gstin || inv.customer_gstin || "").trim().toUpperCase()}`
      )
    );

    const newInvoices: any[] = [];
    let zeroCreditCount = 0;
    let geminiCreditCount = 0;
    let duplicateCount = 0;
    const failedFiles: string[] = [];

    for (const res of results) {
      if (res && res.status === "fulfilled" && res.value?.invoices) {
        for (const inv of res.value.invoices) {
          const key = inv.sha256
            ? `sha_${inv.sha256}`
            : `${(inv.invoice_number || "").trim().toUpperCase()}__${(inv.recipient_gstin || inv.customer_gstin || "").trim().toUpperCase()}`;

          if (existingKeys.has(key)) {
            duplicateCount++;
          } else {
            existingKeys.add(key);
            newInvoices.push(inv);
            if (
              inv.credits_consumed === 0 ||
              inv.cached ||
              inv.extraction_source === "deterministic_python" ||
              inv.extraction_source === "manual_pending"
            ) {
              zeroCreditCount++;
            } else {
              geminiCreditCount++;
            }
          }
        }
      } else if (res && res.status === "rejected") {
        failedFiles.push(`${res.fileName}: ${res.reason}`);
      }
    }

    if (newInvoices.length > 0) {
      setInvoices((prev) => [...newInvoices, ...prev]);
    }

    if (failedFiles.length > 0) {
      setUploadError(`Some files could not be extracted: ${failedFiles.slice(0, 2).join("; ")}`);
    }

    setBatchSummary({
      total: newInvoices.length,
      zeroCredit: zeroCreditCount,
      geminiCredit: geminiCreditCount,
      skippedDuplicates: duplicateCount,
    });

    setBatchProgress({ current: files.length, total: files.length, active: false });
    setUploadingBill(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // On-demand AI Vision Scan for a specific bill row
  const handleEnrichBill = async (index: number, fileId?: string) => {
    const inv = invoices[index];
    const fid = fileId || inv.file_id;
    if (!fid) {
      alert("No stored document file reference found for this bill.");
      return;
    }

    setEnrichingIndex(index);
    try {
      const res = await aiEnrichBill({
        file_id: fid,
        shop_gstin: shop.gstin,
        shop_category: shop.category,
      });
      if (res.success && res.invoice) {
        setInvoices((prev) => {
          const copy = [...prev];
          copy[index] = {
            ...copy[index],
            ...res.invoice,
            needs_ai_scan: false,
          };
          return copy;
        });
      }
    } catch (err: any) {
      alert("AI Vision scan error: " + err.message);
    } finally {
      setEnrichingIndex(null);
    }
  };

  // Accept AI HSN suggestion for row
  const handleAcceptSuggestion = (index: number) => {
    setInvoices((prev) => {
      const copy = [...prev];
      const inv = { ...copy[index] };
      if (!inv.items || inv.items.length === 0) {
        inv.items = [{ hsn: "848180", taxable_amount: 10000, gst_rate: 18, description: "Hardware Supplies" }];
      } else {
        inv.items = inv.items.map((itm: any) => ({
          ...itm,
          hsn: itm.hsn && itm.hsn.length >= 4 ? itm.hsn : "848180",
        }));
      }
      copy[index] = inv;
      return copy;
    });
  };

  const handleInvoiceNumberChange = (index: number, val: string) => {
    setInvoices((prev) => {
      const copy = [...prev];
      const inv = { ...copy[index] };
      inv.invoice_number = val;
      const clean = val.trim();
      const isValid = clean.length <= 16 && clean.length > 0 && /^[A-Za-z0-9/-]+$/.test(clean);
      inv.invoice_number_valid = isValid;
      if (!isValid) {
        inv.invoice_number_error =
          clean.length > 16
            ? `Exceeds 16-char GST portal limit (${clean.length} chars)`
            : "Contains disallowed characters (only A-Z, 0-9, -, / permitted)";
      } else {
        inv.invoice_number_error = null;
      }
      copy[index] = inv;
      return copy;
    });
  };

  const handleUseSuggestedInvoiceNumber = (index: number, suggested: string) => {
    setInvoices((prev) => {
      const copy = [...prev];
      const inv = { ...copy[index] };
      inv.invoice_number = suggested;
      inv.invoice_number_valid = true;
      inv.invoice_number_error = null;
      copy[index] = inv;
      return copy;
    });
  };

  const handleHsnChange = (index: number, newHsn: string, newRate?: number) => {
    setInvoices((prev) => {
      const copy = [...prev];
      const inv = { ...copy[index] };
      const items = [...(inv.items || [])];
      if (items.length > 0) {
        items[0] = {
          ...items[0],
          hsn: newHsn,
          gst_rate: newRate !== undefined ? newRate : items[0].gst_rate || 18,
        };
      } else {
        items.push({
          hsn: newHsn,
          description: "Supplies",
          quantity: 1,
          taxable_amount: inv.taxable_value || 10000,
          gst_rate: newRate !== undefined ? newRate : 18,
        });
      }
      inv.items = items;
      copy[index] = inv;
      return copy;
    });
  };

  // Compile and Download GSTR-1 JSON
  const handleDownloadGSTR1 = async () => {
    if (invoices.length === 0) return;
    setLoadingCompile(true);
    try {
      const res = await compileGSTR1({
        gstin: shop.gstin,
        filing_period: "112026",
        invoices,
      });

      if (res.success && res.data) {
        // Trigger browser file download
        const blob = new Blob([JSON.stringify(res.data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename || `GSTR1_${shop.gstin}_112026.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setDownloadSuccess(true);
      }
    } catch (err: any) {
      alert("Error compiling GSTR-1: " + err.message);
    } finally {
      setLoadingCompile(false);
    }
  };

  // ===================================================================
  // TAB 2: GSTR-2B ITC Check States
  // ===================================================================
  const [reconciliationResult, setReconciliationResult] = useState<any>(null);
  const [copiedSupplier, setCopiedSupplier] = useState<string | null>(null);

  const handleLoadSampleGSTR2B = async () => {
    try {
      const demoData = await seedDemoSamples();
      const recon = await reconcileGSTR2B({
        purchase_bills: demoData.sample_purchase_bills,
        gstr2b_json: demoData.sample_gstr2b_json,
      });
      setReconciliationResult(recon);
    } catch (err: any) {
      alert("Reconciliation error: " + err.message);
    }
  };

  const handleCopyWhatsAppReminder = (item: any) => {
    const text = `Dear ${item.supplier_name}, Greetings from ${shop.trade_name}. Our monthly GST reconciliation shows that your invoice #${item.invoice_number} dated ${item.invoice_date} (Taxable: ₹${item.taxable_amount.toLocaleString("en-IN")}, ITC: ₹${item.itc_at_risk.toLocaleString("en-IN")}) is missing in our GSTR-2B statement. Under Section 16(2)(aa), our input tax credit is blocked. Kindly ensure this bill is included in your GSTR-1 filing immediately. Thank you!`;
    navigator.clipboard.writeText(text);
    setCopiedSupplier(item.invoice_number);
    setTimeout(() => setCopiedSupplier(null), 3000);
  };

  // ===================================================================
  // TAB 3: Late Fee & Interest Calculator States
  // ===================================================================
  const [calcReturnType, setCalcReturnType] = useState("GSTR-3B");
  const [calcDueDate, setCalcDueDate] = useState("2026-10-20");
  const [calcFilingDate, setCalcFilingDate] = useState("2026-11-20");
  const [calcTurnoverSlab, setCalcTurnoverSlab] = useState("<= 1.5 Cr");
  const [calcNetCashTax, setCalcNetCashTax] = useState(50000);
  const [calcResult, setCalcResult] = useState<any>(null);

  const handleCalculateLateFee = async () => {
    try {
      const res = await calculateLateFee({
        return_type: calcReturnType,
        due_date: calcDueDate,
        filing_date: calcFilingDate,
        turnover_slab: calcTurnoverSlab,
        is_nil: calcTurnoverSlab === "Nil",
        net_cash_liability: Number(calcNetCashTax),
      });
      setCalcResult(res);
    } catch (err: any) {
      alert("Calculation error: " + err.message);
    }
  };

  useEffect(() => {
    handleCalculateLateFee();
  }, [calcReturnType, calcDueDate, calcFilingDate, calcTurnoverSlab, calcNetCashTax]);

  // ===================================================================
  // TAB 4: Notice Decoder States (2 Free Quota)
  // ===================================================================
  const [noticeQuota, setNoticeQuota] = useState<any>({ remaining: 2, used: 0, max_free: 2 });
  const [noticeResult, setNoticeResult] = useState<any>(null);
  const [decodingNotice, setDecodingNotice] = useState(false);

  useEffect(() => {
    getNoticeQuota(shop.phone, shop.gstin)
      .then(setNoticeQuota)
      .catch(() => {});
  }, [shop.phone, shop.gstin]);

  const handleLoadSampleNotice = async () => {
    setDecodingNotice(true);
    try {
      const demoData = await seedDemoSamples();
      setNoticeResult(demoData.sample_asmt10_notice);
      setNoticeQuota((prev: any) => ({
        ...prev,
        used: Math.min(2, (prev?.used || 0) + 1),
        remaining: Math.max(0, (prev?.remaining || 2) - 1),
      }));
    } finally {
      setDecodingNotice(false);
    }
  };

  // ===================================================================
  // TAB 5: CBIC Radar & Kolkata Pros States
  // ===================================================================
  const [circulars, setCirculars] = useState<any[]>([]);
  const [practitioners, setPractitioners] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("All");
  const [syncingCirculars, setSyncingCirculars] = useState(false);
  const [consultationModal, setConsultationModal] = useState<any>(null);

  useEffect(() => {
    getCBICCirculars()
      .then((res) => setCirculars(res.circulars || []))
      .catch(() => {});
    getPractitioners()
      .then((res) => setPractitioners(res.practitioners || []))
      .catch(() => {});
  }, []);

  const handleSyncCirculars = async () => {
    setSyncingCirculars(true);
    try {
      const res = await syncCBICCirculars();
      setCirculars(res.circulars || []);
    } finally {
      setSyncingCirculars(false);
    }
  };

  const filteredPractitioners =
    selectedLocation === "All"
      ? practitioners
      : practitioners.filter((p) => p.location.toLowerCase().includes(selectedLocation.toLowerCase()));

  return (
    <div className="max-w-7xl mx-auto py-4 sm:py-6 px-4 sm:px-6 space-y-4">
      {/* 6-Hour CBIC Regulatory Alert Banner */}
      <GstNewsBanner onTabChange={(t) => setActiveTab(t as TabType)} />

      {/* Top Shop Context Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center font-bold text-lg border border-teal-200">
            {shop.trade_name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-slate-900 text-lg sm:text-xl">{shop.trade_name}</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                Active
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-medium pt-0.5">
              <span>GSTIN: <strong className="font-mono text-slate-800">{shop.gstin}</strong></span>
              <span>•</span>
              <span>State: <strong>{shop.state_name} ({shop.state_code})</strong></span>
              <span>•</span>
              <span>Category: <strong>{shop.category}</strong></span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
          {/* AI Credits Zero-Waste Control & Live Status */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold text-slate-500 uppercase px-1.5">AI Mode</span>
            <button
              type="button"
              onClick={() => setAiMode("smart")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                aiMode === "smart"
                  ? "bg-teal-700 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Smart Auto: 0 credits for digital PDFs & cache; auto-scans photos/scans"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Smart Auto</span>
            </button>
            <button
              type="button"
              onClick={() => setAiMode("manual")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                aiMode === "manual"
                  ? "bg-indigo-700 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="On-Demand: 0 credits used upfront; click ✨ AI Vision Scan per row"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>On-Demand</span>
            </button>
          </div>

          {/* Live Credit Meter */}
          <div className="text-xs px-2.5 py-1 rounded-xl font-bold border flex items-center gap-1.5 bg-white border-slate-200 text-slate-700 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>
              {totalCreditsUsed > 0 ? (
                <>Gemini: <strong className="text-teal-700">{totalCreditsUsed} credit{totalCreditsUsed > 1 ? "s" : ""}</strong></>
              ) : (
                <><strong>0 AI credits used</strong> <span className="text-emerald-700 font-semibold">(Python/Cache)</span></>
              )}
            </span>
          </div>

          <Link
            href="/onboarding"
            className="text-xs font-semibold text-slate-600 hover:text-teal-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition"
          >
            Edit Shop
          </Link>
          <div className="text-xs px-3 py-1.5 rounded-lg bg-teal-50 text-teal-800 font-semibold border border-teal-200">
            Filing: {shop.turnover_slab} (Monthly)
          </div>
        </div>
      </div>

      {/* 5-Tab Navigation Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-slate-200">
        <button
          onClick={() => setActiveTab("bills")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition ${
            activeTab === "bills"
              ? "bg-teal-700 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <FileUp className="w-4 h-4" />
          <span>1. Bills to GSTR-1</span>
        </button>

        <button
          onClick={() => setActiveTab("itc")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition ${
            activeTab === "itc"
              ? "bg-teal-700 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>2. GSTR-2B ITC Check</span>
        </button>

        <button
          onClick={() => setActiveTab("calculator")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition ${
            activeTab === "calculator"
              ? "bg-teal-700 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>3. Late Fee Calculator</span>
        </button>

        <button
          onClick={() => setActiveTab("notices")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition ${
            activeTab === "notices"
              ? "bg-teal-700 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>4. Notice Decoder</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black">
            2 Free
          </span>
        </button>

        <button
          onClick={() => setActiveTab("radar")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition ${
            activeTab === "radar"
              ? "bg-teal-700 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>5. CBIC Radar & Kolkata Pros</span>
        </button>
      </div>

      {/* ============================================================= */}
      {/* TAB 1: BILLS TO GSTR-1 */}
      {/* ============================================================= */}
      {activeTab === "bills" && (
        <div className="space-y-6">
          {/* Action Header & Drag-Drop Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const files = Array.from(e.dataTransfer.files);
              if (files.length) handleBatchFiles(files);
            }}
            className={`rounded-2xl border transition-all p-6 shadow-sm space-y-4 ${
              isDragging
                ? "border-teal-500 bg-teal-50/50 ring-2 ring-teal-300"
                : "bg-white border-slate-200"
            }`}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg flex items-center gap-2">
                  <span>Your Sales Bills to GSTR-1</span>
                  {isDragging && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-teal-600 text-white font-bold animate-bounce">
                      Drop files to upload
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-600">
                  Select or drag multiple bills (Photos, PDFs, Excel, CSV). Bounded parallel queue (3 concurrent) with automatic deduplication.
                </p>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  onClick={handleLoadSampleBills}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-600" />
                  <span>Load 3 Sample Bills</span>
                </button>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    if (files.length) handleBatchFiles(files);
                  }}
                  multiple
                  accept="image/png,image/jpeg,application/pdf,.csv,.xlsx,.xls"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingBill}
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>
                    {uploadingBill
                      ? `Processing ${batchProgress.current}/${batchProgress.total || 1}...`
                      : "Upload Multiple Bills"}
                  </span>
                </button>
              </div>
            </div>

            {/* Live Bounded Batch Progress Indicator */}
            {batchProgress.active && (
              <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-950 font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2.5">
                  <RefreshCw className="w-4 h-4 text-teal-700 animate-spin flex-shrink-0" />
                  <span>
                    Processing <strong>{batchProgress.current}</strong> of <strong>{batchProgress.total}</strong> bills (
                    {batchProgress.total > 0 ? Math.round((batchProgress.current / batchProgress.total) * 100) : 0}%)...
                  </span>
                </div>
                <div className="w-full sm:w-44 bg-teal-200 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-teal-700 h-full transition-all duration-300"
                    style={{
                      width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Batch Deduplication & Attribution Summary Badge */}
            {batchSummary && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 font-medium flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                  <span>
                    <strong>{batchSummary.total} bill{batchSummary.total !== 1 ? "s" : ""} processed:</strong>{" "}
                    <span className="text-emerald-800 font-bold">{batchSummary.zeroCredit} via Python/Cache [0 Cr]</span>
                    {batchSummary.geminiCredit > 0 && (
                      <span className="text-teal-900 font-bold">
                        , {batchSummary.geminiCredit} via Gemini Vision [{batchSummary.geminiCredit} Cr]
                      </span>
                    )}
                    {batchSummary.skippedDuplicates > 0 && (
                      <span className="text-slate-600 italic">
                        {" "}
                        ({batchSummary.skippedDuplicates} duplicate{batchSummary.skippedDuplicates > 1 ? "s" : ""} skipped)
                      </span>
                    )}
                  </span>
                </div>
                <button
                  onClick={() => setBatchSummary(null)}
                  className="text-slate-400 hover:text-slate-700 text-xs font-bold px-1.5 py-0.5 rounded"
                  title="Dismiss summary"
                >
                  ✕
                </button>
              </div>
            )}

            {uploadError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
                {uploadError}
              </div>
            )}
          </div>

          {/* Invoices Review Table */}
          {invoices.length > 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
              <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    Review Invoices Ready for Filing ({invoices.length} Bills)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Missing HSN codes or GSTINs are highlighted in amber. Tap &quot;Accept AI Suggestion&quot; to auto-fix.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setInvoices([]);
                      setBatchSummary(null);
                    }}
                    className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition"
                    title="Clear uploaded bills to start fresh"
                  >
                    Clear All
                  </button>
                  <button
                    onClick={handleDownloadGSTR1}
                    disabled={loadingCompile}
                    className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md transition flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>{loadingCompile ? "Compiling..." : "Download Official GSTR-1 JSON"}</span>
                  </button>
                </div>
              </div>

              {downloadSuccess && (
                <div className="mx-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>GSTR-1 JSON downloaded successfully! Complies with gst.gov.in Table 4, 5, 7, 12, and 13.</span>
                  </div>
                  <span className="font-bold text-emerald-700">Ready to upload on GST portal</span>
                </div>
              )}

              {invoices.some((i) => i.extraction_warning) && (
                <div className="mx-4 p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 font-medium flex items-start justify-between gap-2 shadow-xs">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong>AI Extraction Notice:</strong>{" "}
                      {invoices.find((i) => i.extraction_warning)?.extraction_warning}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setInvoices((prev) =>
                        prev.map((inv) => ({ ...inv, extraction_warning: undefined }))
                      );
                    }}
                    className="text-amber-800 hover:text-amber-950 p-1 text-xs font-bold leading-none"
                    title="Dismiss alert"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Invoice # (Rule 46b)</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Customer GSTIN</th>
                      <th className="px-4 py-3">Item Description</th>
                      <th className="px-4 py-3">HSN / SAC Code</th>
                      <th className="px-4 py-3">Taxable ₹</th>
                      <th className="px-4 py-3">GST Rate</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {invoices.map((inv, idx) => {
                      const item = inv.items?.[0] || {};
                      const hasMissingHsn = !item.hsn || String(item.hsn).length < 4;
                      const isUnregistered = !inv.recipient_gstin;
                      const hasInvalidInum =
                        inv.invoice_number_valid === false ||
                        (inv.invoice_number && inv.invoice_number.length > 16);

                      return (
                        <tr
                          key={idx}
                          className={`hover:bg-slate-50/70 transition ${
                            hasMissingHsn || hasInvalidInum ? "bg-amber-50/40" : ""
                          }`}
                        >
                          {/* Invoice Number with Rule 46(b) validation & 1-tap suggestion */}
                          <td className="px-4 py-3 align-top min-w-[170px]">
                            <div className="space-y-1">
                              <input
                                type="text"
                                value={inv.invoice_number || ""}
                                onChange={(e) => handleInvoiceNumberChange(idx, e.target.value)}
                                className={`font-mono text-xs px-2.5 py-1.5 rounded-lg border w-full ${
                                  hasInvalidInum
                                    ? "border-amber-500 bg-amber-50 text-amber-950 font-bold ring-2 ring-amber-200"
                                    : "border-slate-300 bg-white text-slate-900 font-bold"
                                } focus:outline-none focus:ring-2 focus:ring-teal-700`}
                                title="Rule 46(b): Maximum 16 characters [A-Za-z0-9/-]"
                              />
                              {hasInvalidInum && (
                                <div className="p-1.5 rounded bg-amber-100/80 border border-amber-300 text-[10px] space-y-1">
                                  <div className="text-amber-900 font-bold flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 text-amber-700 flex-shrink-0" />
                                    <span>{inv.invoice_number_error || "Exceeds 16-char GST limit"}</span>
                                  </div>
                                  {inv.suggested_invoice_number && inv.suggested_invoice_number !== inv.invoice_number && (
                                    <button
                                      type="button"
                                      onClick={() => handleUseSuggestedInvoiceNumber(idx, inv.suggested_invoice_number)}
                                      className="w-full text-left px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold transition flex items-center justify-between"
                                    >
                                      <span>Use &quot;{inv.suggested_invoice_number}&quot;</span>
                                      <span className="text-[9px] bg-amber-800 px-1 rounded">1-tap</span>
                                    </button>
                                  )}
                                  <p className="text-[9px] text-slate-600 italic">Ensure matches physical bill</p>
                                </div>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3 align-top text-slate-600 whitespace-nowrap">
                            {inv.invoice_date}
                          </td>

                          <td className="px-4 py-3 align-top">
                            {inv.recipient_gstin ? (
                              <span className="font-mono text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                                {inv.recipient_gstin}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">B2C (Unregistered)</span>
                            )}
                          </td>

                          <td className="px-4 py-3 align-top text-slate-800 max-w-xs truncate">
                            {item.description || "Supplies"}
                          </td>

                          {/* Searchable / Selectable HSN / SAC Code */}
                          <td className="px-4 py-3 align-top min-w-[170px]">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  maxLength={8}
                                  value={item.hsn || ""}
                                  onChange={(e) => handleHsnChange(idx, e.target.value)}
                                  placeholder="HSN/SAC"
                                  className="w-20 font-mono font-bold text-xs px-2 py-1 rounded border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                                />
                                <select
                                  value={item.hsn || ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const found = masterHsnList.find((h) => h.code === val);
                                    handleHsnChange(idx, val, found ? found.gst_rate : undefined);
                                  }}
                                  className="text-[11px] px-1 py-1 rounded border border-slate-300 bg-slate-50 text-slate-700 max-w-[110px] truncate"
                                  title="Pick verified HSN/SAC code"
                                >
                                  <option value="">Select Code</option>
                                  <optgroup label="Services (SAC)">
                                    <option value="998513">998513 - Placement & Recruitment (18%)</option>
                                    <option value="998311">998311 - Management Consulting (18%)</option>
                                    <option value="998313">998313 - IT Systems Consulting (18%)</option>
                                    <option value="998222">998222 - Accounting & Tax (18%)</option>
                                    <option value="9965">9965 - Goods Transport (5%)</option>
                                    <option value="9972">9972 - Real Estate Rental (18%)</option>
                                  </optgroup>
                                  <optgroup label="Goods (HSN)">
                                    <option value="848180">848180 - Valves & Cocks (18%)</option>
                                    <option value="854411">854411 - Copper Wire (18%)</option>
                                    <option value="731815">731815 - Screws & Bolts (18%)</option>
                                    <option value="853650">853650 - Electrical Switches (18%)</option>
                                    <option value="851713">851713 - Smartphones (18%)</option>
                                    <option value="520811">520811 - Cotton Fabrics (5%)</option>
                                    <option value="190531">190531 - Sweet Biscuits (18%)</option>
                                    <option value="300490">300490 - Medicaments (12%)</option>
                                  </optgroup>
                                  {masterHsnList.length > 0 && (
                                    <optgroup label="Master Catalog">
                                      {masterHsnList.map((h: any) => (
                                        <option key={h.code} value={h.code}>
                                          {h.code} - {h.description.substring(0, 28)} ({h.gst_rate}%)
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                </select>
                              </div>
                              {hasMissingHsn ? (
                                <div className="flex items-center gap-1 text-[10px] text-amber-700 font-semibold">
                                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                                  <span>Missing code</span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-500 truncate block max-w-[150px]">
                                  {item.description ? item.description.substring(0, 24) : ""}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3 align-top font-mono text-slate-900">
                            ₹{(item.taxable_amount || inv.taxable_value || 0).toLocaleString("en-IN")}
                          </td>

                          <td className="px-4 py-3 align-top font-semibold text-slate-700">
                            {item.gst_rate || 18}%
                          </td>

                          <td className="px-4 py-3 align-top text-right">
                            <div className="flex flex-col items-end gap-1.5">
                              {inv.needs_ai_scan ? (
                                <button
                                  type="button"
                                  onClick={() => handleEnrichBill(idx, inv.file_id)}
                                  disabled={enrichingIndex === idx}
                                  className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-[11px] font-extrabold rounded-lg shadow-sm transition flex items-center gap-1.5 animate-pulse"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>{enrichingIndex === idx ? "Scanning with Gemini..." : "✨ AI Vision Scan"}</span>
                                </button>
                              ) : hasMissingHsn ? (
                                <button
                                  type="button"
                                  onClick={() => handleAcceptSuggestion(idx)}
                                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-lg transition shadow-sm"
                                >
                                  Accept AI Suggestion
                                </button>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 text-emerald-700 text-[11px] font-semibold">
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Verified</span>
                                  </span>
                                  {inv.file_id && (
                                    <button
                                      type="button"
                                      onClick={() => handleEnrichBill(idx, inv.file_id)}
                                      disabled={enrichingIndex === idx}
                                      title="Re-scan document with Gemini Vision"
                                      className="text-[10px] text-slate-400 hover:text-indigo-600 px-1 py-0.5 rounded border border-transparent hover:border-slate-200"
                                    >
                                      {enrichingIndex === idx ? "..." : "Re-scan"}
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Zero-waste credit attribution badge */}
                              <span className="text-[9px] text-slate-400 font-mono">
                                {inv.cached
                                  ? "⚡ SHA-256 Cached (0 Cr)"
                                  : inv.extraction_source === "deterministic_python"
                                  ? "⚙️ Python Fast (0 Cr)"
                                  : inv.extraction_source === "manual_pending"
                                  ? "⏳ Pending Scan (0 Cr)"
                                  : inv.extraction_source === "api_key_missing"
                                  ? "Demo Fallback"
                                  : "✨ Gemini Flash (1 Cr)"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const files = Array.from(e.dataTransfer.files);
                if (files.length) handleBatchFiles(files);
              }}
              className={`rounded-2xl border-2 border-dashed p-12 text-center space-y-4 transition-all ${
                isDragging
                  ? "border-teal-500 bg-teal-50/50 ring-2 ring-teal-300"
                  : "bg-white border-slate-300"
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto">
                <FileUp className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-base">No bills added yet</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Drag & drop multiple bill photos/PDFs here, or click &quot;Upload Multiple Bills&quot; or &quot;Load 3 Sample Bills&quot;.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={handleLoadSampleBills}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition shadow-xs"
                >
                  Load 3 Sample Bills
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl shadow transition"
                >
                  Browse Files
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 2: GSTR-2B ITC CHECK */}
      {/* ============================================================= */}
      {activeTab === "itc" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-slate-900 text-lg">GSTR-2B Input Tax Credit (ITC) Leak Check</h3>
              <p className="text-xs text-slate-600">
                Matches your purchase bills against the government GSTR-2B portal file under Section 16(2)(aa).
              </p>
            </div>

            <button
              onClick={handleLoadSampleGSTR2B}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>1-Click Load Sample GSTR-2B & Bills</span>
            </button>
          </div>

          {reconciliationResult && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                  <span className="text-xs text-slate-500 font-semibold uppercase">Bills Checked</span>
                  <p className="text-2xl font-extrabold text-slate-900">
                    {reconciliationResult.summary.total_bills_checked}
                  </p>
                  <span className="text-[11px] text-slate-500">In your purchase register</span>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                  <span className="text-xs text-slate-500 font-semibold uppercase">Total ITC in Books</span>
                  <p className="text-2xl font-extrabold text-slate-900">
                    ₹{reconciliationResult.summary.total_books_itc.toLocaleString("en-IN")}
                  </p>
                  <span className="text-[11px] text-slate-500">Calculated from purchase invoices</span>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                  <span className="text-xs text-slate-500 font-semibold uppercase">Verified in Portal</span>
                  <p className="text-2xl font-extrabold text-emerald-700">
                    ₹{reconciliationResult.summary.verified_portal_itc.toLocaleString("en-IN")}
                  </p>
                  <span className="text-[11px] text-emerald-600 font-medium">100% safe to claim in GSTR-3B</span>
                </div>

                <div className="bg-rose-50 p-5 rounded-2xl border border-rose-200 shadow-sm space-y-1">
                  <span className="text-xs text-rose-700 font-bold uppercase">Total ITC at Risk</span>
                  <p className="text-2xl font-extrabold text-rose-700">
                    ₹{reconciliationResult.summary.total_itc_at_risk.toLocaleString("en-IN")}
                  </p>
                  <span className="text-[11px] text-rose-600 font-medium">Unfiled by suppliers</span>
                </div>
              </div>

              {/* Defaulting Suppliers Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-200 bg-rose-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <h4 className="font-bold text-slate-900 text-sm">
                      Defaulting Suppliers (Missing in GSTR-2B — {reconciliationResult.missing_in_gstr2b.length} Invoices)
                    </h4>
                  </div>
                  <span className="text-xs text-rose-700 font-bold">
                    Blocked under Section 16(2)(aa)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Supplier Name</th>
                        <th className="px-4 py-3">Supplier GSTIN</th>
                        <th className="px-4 py-3">Invoice #</th>
                        <th className="px-4 py-3">Invoice Date</th>
                        <th className="px-4 py-3">Taxable ₹</th>
                        <th className="px-4 py-3 font-bold text-rose-700">ITC at Risk</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {reconciliationResult.missing_in_gstr2b.map((m: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-3 font-bold text-slate-900">{m.supplier_name}</td>
                          <td className="px-4 py-3 font-mono text-slate-700">{m.supplier_gstin}</td>
                          <td className="px-4 py-3 font-mono text-slate-900">{m.invoice_number}</td>
                          <td className="px-4 py-3 text-slate-600">{m.invoice_date}</td>
                          <td className="px-4 py-3 font-mono text-slate-900">
                            ₹{m.taxable_amount.toLocaleString("en-IN")}
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-rose-700">
                            ₹{m.itc_at_risk.toLocaleString("en-IN")}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleCopyWhatsAppReminder(m)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition shadow-sm inline-flex items-center gap-1.5"
                            >
                              <Copy className="w-3 h-3" />
                              <span>{copiedSupplier === m.invoice_number ? "Copied!" : "WhatsApp Reminder"}</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 3: LATE FEE & INTEREST CALCULATOR */}
      {/* ============================================================= */}
      {activeTab === "calculator" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls */}
          <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-extrabold text-slate-900 text-base">Late Fee & Interest Parameters</h3>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Return Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCalcReturnType("GSTR-3B")}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition ${
                    calcReturnType === "GSTR-3B"
                      ? "bg-teal-50 border-teal-700 text-teal-800"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  GSTR-3B Return
                </button>
                <button
                  type="button"
                  onClick={() => setCalcReturnType("GSTR-1")}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition ${
                    calcReturnType === "GSTR-1"
                      ? "bg-teal-50 border-teal-700 text-teal-800"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  GSTR-1 Statement
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Turnover Slab (Statutory Cap)
              </label>
              <select
                value={calcTurnoverSlab}
                onChange={(e) => setCalcTurnoverSlab(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium bg-white"
              >
                <option value="Nil">Nil Return (₹500 max cap)</option>
                <option value="<= 1.5 Cr">Up to ₹1.5 Crore (₹2,000 max cap)</option>
                <option value="1.5 - 5 Cr">₹1.5 Crore - ₹5 Crore (₹5,000 max cap)</option>
                <option value="> 5 Cr">Above ₹5 Crore (₹10,000 max cap)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Due Date
                </label>
                <input
                  type="date"
                  value={calcDueDate}
                  onChange={(e) => setCalcDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Filing Date
                </label>
                <input
                  type="date"
                  value={calcFilingDate}
                  onChange={(e) => setCalcFilingDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium"
                />
              </div>
            </div>

            {calcReturnType === "GSTR-3B" && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Net Cash Tax Paid via Challan (₹)
                </label>
                <input
                  type="number"
                  value={calcNetCashTax}
                  onChange={(e) => setCalcNetCashTax(Number(e.target.value))}
                  placeholder="50000"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold"
                />
                <p className="text-[11px] text-slate-500 leading-tight">
                  Section 50 18% p.a. interest applies <strong>only to cash challan tax</strong>. Tax paid through ITC attracts 0% interest.
                </p>
              </div>
            )}
          </div>

          {/* Result Card */}
          <div className="lg:col-span-2 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div>
              <h3 className="font-extrabold text-slate-900 text-lg">Statutory Penalty Breakdown</h3>
              <p className="text-xs text-slate-600">Calculated strictly under Section 47 and Section 50 of the CGST Act.</p>
            </div>

            {calcResult && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <span className="text-xs text-slate-500 font-semibold uppercase">Days Late</span>
                    <p className="text-2xl font-black text-slate-900">{calcResult.days_late} Days</p>
                    <span className="text-[11px] text-slate-500">From {calcResult.due_date}</span>
                  </div>

                  <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 space-y-1">
                    <span className="text-xs text-teal-800 font-semibold uppercase">Section 47 Late Fee</span>
                    <p className="text-2xl font-black text-teal-800">
                      ₹{calcResult.late_fee_total.toLocaleString("en-IN")}
                    </p>
                    <span className="text-[11px] text-teal-700">{calcResult.cap_description}</span>
                  </div>

                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
                    <span className="text-xs text-amber-800 font-semibold uppercase">Section 50 Interest</span>
                    <p className="text-2xl font-black text-amber-800">
                      ₹{calcResult.interest_total.toLocaleString("en-IN")}
                    </p>
                    <span className="text-[11px] text-amber-700">
                      {calcResult.interest_applicable ? "18% p.a. on cash tax" : "₹0.00 on GSTR-1"}
                    </span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs text-slate-400 font-semibold uppercase">Total Penalty Payable</span>
                    <p className="text-3xl font-extrabold text-emerald-400">
                      ₹{calcResult.total_penalty_payable.toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div className="text-xs text-slate-300 max-w-sm sm:text-right">
                    {calcResult.explanation}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 4: NOTICE DECODER (2 FREE) */}
      {/* ============================================================= */}
      {activeTab === "notices" && (
        <div className="space-y-6">
          {/* Header Card with Quota Badge */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 text-lg">GST Scrutiny Notice Decoder</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-bold">
                  {noticeQuota?.remaining ?? 2} of 2 Free Decodes Remaining
                </span>
              </div>
              <p className="text-xs text-slate-600 pt-1">
                Upload Form ASMT-10 or DRC-01 PDF. Gemini 4 Hydrogen translates scary legalese into plain English.
              </p>
            </div>

            <button
              onClick={handleLoadSampleNotice}
              disabled={decodingNotice}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>{decodingNotice ? "Decoding Notice..." : "1-Click Load Sample ASMT-10"}</span>
            </button>
          </div>

          {/* Decoded Notice Presentation */}
          {noticeResult && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-6 p-6 sm:p-8">
              {/* Notice Metadata Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">
                    {noticeResult.notice_type}
                  </span>
                  <h4 className="text-lg font-bold text-slate-900">
                    Ref DIN: {noticeResult.notice_reference}
                  </h4>
                </div>
                <div className="text-right text-xs text-slate-500 font-medium">
                  <p>Authority: <strong>{noticeResult.issuing_authority}</strong></p>
                  <p>Period: <strong>{noticeResult.tax_period}</strong> | Date: <strong>{noticeResult.notice_date}</strong></p>
                </div>
              </div>

              {/* 3 Non-Negotiable Sections */}
              <div className="space-y-6">
                {/* 1. What Happened */}
                <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                  <h5 className="font-extrabold text-amber-950 text-sm flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center text-xs font-black">
                      1
                    </span>
                    <span>What Happened (Plain Business English)</span>
                  </h5>
                  <p className="text-xs sm:text-sm text-amber-900 leading-relaxed font-medium">
                    {noticeResult.what_happened}
                  </p>
                </div>

                {/* 2. Exact Disputed Amount in INR */}
                <div className="p-5 rounded-2xl bg-rose-50/70 border border-rose-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h5 className="font-extrabold text-rose-950 text-sm flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-rose-200 text-rose-900 flex items-center justify-center text-xs font-black">
                        2
                      </span>
                      <span>Exact Amount in Dispute</span>
                    </h5>
                    <span className="text-2xl font-black text-rose-700">
                      ₹{noticeResult.total_amount_disputed.toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 text-xs font-medium">
                    <div className="bg-white p-2.5 rounded-lg border border-rose-100">
                      <span className="text-slate-500">Tax Demanded</span>
                      <p className="font-bold text-slate-900">₹{noticeResult.tax_amount.toLocaleString("en-IN")}</p>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-rose-100">
                      <span className="text-slate-500">Interest Claimed</span>
                      <p className="font-bold text-slate-900">₹{noticeResult.interest_amount.toLocaleString("en-IN")}</p>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-rose-100">
                      <span className="text-slate-500">Penalty Proposed</span>
                      <p className="font-bold text-slate-900">₹{noticeResult.penalty_amount.toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                </div>

                {/* 3. Action Checklist */}
                <div className="p-5 rounded-2xl bg-teal-50/70 border border-teal-200 space-y-4">
                  <h5 className="font-extrabold text-teal-950 text-sm flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-teal-200 text-teal-900 flex items-center justify-center text-xs font-black">
                      3
                    </span>
                    <span>Next Action Step Checklist</span>
                  </h5>

                  <div className="space-y-2.5">
                    {noticeResult.action_steps.map((step: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3.5 bg-white rounded-xl border border-teal-100 flex items-start gap-3 shadow-xs"
                      >
                        <div className="w-5 h-5 rounded-full bg-teal-700 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                          {step.step_number}
                        </div>
                        <div className="flex-1 space-y-0.5">
                          <p className="text-xs sm:text-sm font-bold text-slate-900">{step.action}</p>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium">
                            <span>Deadline: <strong className="text-rose-700">{step.deadline}</strong></span>
                            <span>•</span>
                            <span>Form to file: <strong className="text-teal-800">{step.form_to_file}</strong></span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => setActiveTab("radar")}
                      className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
                    >
                      <span>Need Help? Consult a Verified Kolkata Tax Pro →</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 5: CBIC RADAR & KOLKATA PROS */}
      {/* ============================================================= */}
      {activeTab === "radar" && (
        <div className="space-y-8">
          {/* Sub-section 1: CBIC Regulatory Radar */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">Daily CBIC Regulatory Radar</h3>
                <p className="text-xs text-slate-600">
                  Public circulars scraped strictly from cbic.gov.in (never gst.gov.in) with plain shopkeeper impact summaries.
                </p>
              </div>

              <button
                onClick={handleSyncCirculars}
                disabled={syncingCirculars}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingCirculars ? "animate-spin" : ""}`} />
                <span>{syncingCirculars ? "Syncing CBIC..." : "Sync Now"}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {circulars.map((c: any) => (
                <div
                  key={c.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                        {c.circular_no}
                      </span>
                      <span className="text-slate-400 font-medium">{c.issue_date}</span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm leading-snug">{c.title}</h4>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      {c.plain_english_summary?.what_happened}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-emerald-700">
                      Impact: {c.plain_english_summary?.impact_level || "Standard"}
                    </span>
                    <a
                      href={c.cbic_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-teal-700 hover:underline font-bold"
                    >
                      View on cbic.gov.in →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sub-section 2: Kolkata Verified GST Practitioner Directory */}
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">Kolkata Verified GST Practitioner Directory</h3>
                <p className="text-xs text-slate-600">
                  Experienced local tax advocates & Chartered Accountants for ASMT-10 scrutiny defense and high-value ITC recovery.
                </p>
              </div>

              {/* Location filter pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                {["All", "Dalhousie", "Burrabazar", "Salt Lake", "Howrah", "Park Street"].map((loc) => (
                  <button
                    key={loc}
                    onClick={() => setSelectedLocation(loc)}
                    className={`px-3 py-1 rounded-full font-semibold transition ${
                      selectedLocation === loc
                        ? "bg-teal-700 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredPractitioners.map((p: any) => (
                <div
                  key={p.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{p.name}</h4>
                        <p className="text-xs text-slate-500 font-medium">{p.firm_name}</p>
                      </div>
                      <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        ★ {p.rating}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{p.location}</span>
                    </p>

                    <div className="flex flex-wrap gap-1 pt-1">
                      {p.specialization.map((sp: string) => (
                        <span
                          key={sp}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold"
                        >
                          {sp}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 font-medium">
                      {p.years_experience} yrs exp • {p.languages.join(", ")}
                    </span>
                    <button
                      onClick={() => setConsultationModal(p)}
                      className="px-3.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl shadow-xs transition"
                    >
                      Consult Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Consultation Modal */}
      {consultationModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-base">Request Consultation Handoff</h4>
                <p className="text-xs text-slate-500">{consultationModal.name} ({consultationModal.firm_name})</p>
              </div>
              <button
                onClick={() => setConsultationModal(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="p-3 rounded-xl bg-slate-50 space-y-1">
                <p><strong>Your Shop:</strong> {shop.trade_name} ({shop.gstin})</p>
                <p><strong>Contact Phone:</strong> +91 {shop.phone}</p>
                <p><strong>Location:</strong> {consultationModal.address}</p>
              </div>
              <p className="text-slate-500 leading-relaxed">
                Your pre-compiled GST dossier, missing ITC summary, and decoded notice summary will be packaged for instant review by {consultationModal.name}.
              </p>
            </div>

            <div className="pt-2 flex items-center gap-2 justify-end">
              <button
                onClick={() => setConsultationModal(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert(`Consultation request submitted! ${consultationModal.name}'s chamber will call you at +91 ${shop.phone} within 2 business hours.`);
                  setConsultationModal(null);
                }}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-xl shadow-sm"
              >
                Confirm Handoff
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto py-16 px-4 text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-teal-700 border-t-transparent animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Loading KhataLens Compliance Dashboard...</p>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
