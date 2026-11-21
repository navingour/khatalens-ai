"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronRight,
  ChevronLeft,
  X,
  Clock,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { getCBICBannerUpdates } from "@/lib/api";

interface UpdateItem {
  id?: string;
  circular_no?: string;
  issue_date?: string;
  title?: string;
  category?: string;
  cbic_url?: string;
  plain_english_summary?: {
    what_happened?: string;
    who_is_affected?: string;
    action_step?: string;
    impact_level?: string;
  };
}

interface GstNewsBannerProps {
  onTabChange?: (tab: string) => void;
  className?: string;
}

export default function GstNewsBanner({ onTabChange, className = "" }: GstNewsBannerProps) {
  const router = useRouter();
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lastSynced, setLastSynced] = useState<string>("");
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadBanner() {
      try {
        const data = await getCBICBannerUpdates();
        if (isMounted && data?.updates && data.updates.length > 0) {
          setUpdates(data.updates);
          setLastSynced(data.last_synced || new Date().toISOString());
        }
      } catch (err) {
        // Fallback pre-seeded items if backend is unreachable
        if (isMounted) {
          setUpdates([
            {
              id: "cir-210-2024",
              circular_no: "Circular 210/22/2024",
              title: "Time limit extension for availing Input Tax Credit under Section 16(4)",
              category: "ITC Claim",
              plain_english_summary: {
                what_happened:
                  "Shopkeepers can claim missed Input Tax Credit if GSTR-3B was filed before 30th November of the following year.",
                action_step: "Review your purchase register to claim genuine unclaimed ITC.",
              },
            },
            {
              id: "notif-12-2024",
              circular_no: "Notification 12/2024",
              title: "Waiver of interest and penalty under Section 128A for Section 73 demands",
              category: "Penalty Waiver",
              plain_english_summary: {
                what_happened:
                  "100% waiver of penalty and interest for old GST demands (FY 2017-20) if basic tax is cleared before 31st March 2025.",
                action_step: "Pay principal tax only to get penalties and interest erased.",
              },
            },
          ]);
          setLastSynced(new Date().toISOString());
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadBanner();
    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-rotate every 7 seconds if multiple circulars exist
  useEffect(() => {
    if (updates.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % updates.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [updates.length]);

  if (dismissed || loading || updates.length === 0) {
    return null;
  }

  const currentUpdate = updates[currentIndex] || updates[0];
  const summary = currentUpdate.plain_english_summary;
  const impactText = summary?.what_happened || summary?.action_step || currentUpdate.title;

  // Format sync timestamp nicely
  const formattedSyncTime = (() => {
    if (!lastSynced) return "Every 6h sync";
    try {
      const d = new Date(lastSynced);
      return `Synced ${d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })}`;
    } catch {
      return "Last synced recently";
    }
  })();

  const handleBannerClick = () => {
    if (onTabChange) {
      onTabChange("radar");
    } else {
      router.push("/dashboard?tab=radar");
    }
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % updates.length);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + updates.length) % updates.length);
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label="CBIC GST Regulatory Updates"
      onClick={handleBannerClick}
      className={`group relative overflow-hidden bg-gradient-to-r from-teal-900 via-slate-900 to-teal-950 text-white rounded-xl border border-teal-500/30 p-2.5 sm:p-3 shadow-md transition-all hover:border-teal-400/60 cursor-pointer ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left Badge & Icon */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-500/20 border border-teal-400/30 text-[10px] sm:text-xs font-bold text-teal-300 uppercase tracking-wide">
            <Sparkles className="w-3 h-3 text-teal-300" />
            CBIC Radar
          </span>
          {currentUpdate.circular_no && (
            <span className="hidden md:inline-block text-[11px] font-semibold text-slate-300 max-w-[150px] truncate">
              {currentUpdate.circular_no}
            </span>
          )}
        </div>

        {/* Middle Content: Headline + Shopkeeper Impact */}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs sm:text-sm font-medium text-slate-100 truncate">
            <strong className="text-white font-semibold">
              {currentUpdate.category ? `[${currentUpdate.category}] ` : ""}
            </strong>
            <span>{impactText}</span>
          </p>
        </div>

        {/* Right Section: Sync Time + Controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden lg:flex items-center gap-1 text-[11px] text-teal-200/80 font-mono bg-teal-950/60 px-2 py-0.5 rounded border border-teal-800/50">
            <Clock className="w-3 h-3 text-teal-400" />
            {formattedSyncTime}
          </span>

          {/* Prev/Next arrows if multiple */}
          {updates.length > 1 && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous update"
                className="p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono text-slate-400 px-0.5">
                {currentIndex + 1}/{updates.length}
              </span>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next update"
                className="p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white transition"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Action Prompt */}
          <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-teal-300 group-hover:translate-x-0.5 transition-transform">
            <span>Read Details</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </span>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss banner"
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition ml-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
