import { useState, useEffect, useMemo, useRef } from "react";
import {
  PawPrint, ChevronLeft, ChevronRight, Pencil, Check, Sun, Moon,
  X, AlertCircle, Loader2, RefreshCw, FileText, Image as ImageIcon,
} from "lucide-react";

import { storageGet, storageSet, KEYS } from "./supabaseClient";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function todayKey() {
  const d = new Date();
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}
function fmtRange(a, b) {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  const opts = { month: "short", day: "numeric" };
  return a === b ? da.toLocaleDateString("en-US", opts) : `${da.toLocaleDateString("en-US", opts)} – ${db.toLocaleDateString("en-US", opts)}`;
}
function datesInRange(a, b) {
  const [start, end] = a <= b ? [a, b] : [b, a];
  const out = [];
  let cur = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (cur <= last) {
    const y = cur.getFullYear(), m = cur.getMonth(), d = cur.getDate();
    out.push(dateKey(y, m, d));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
function fmtDateShort(key) {
  return new Date(key + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const DEFAULT_MORNING = "Feed 1/2 cup dry food + one pouch wet food. Fresh water. Scoop litter box.";
const DEFAULT_NIGHT = "Feed one pouch wet food. Playtime with the wand toy for ~10 min. Scoop litter box before you leave.";

// Breaks a long string into lines that fit maxWidth for the canvas's current font.
function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const test = current ? current + " " + word : word;
    if (current && ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  });
  if (current) lines.push(current);
  return lines;
}

// Triggers a browser download for a Blob — works the same for text files and images.
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CalendarAndCare() {
  // calendar
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [bookings, setBookings] = useState({}); // { 'YYYY-MM-DD': {morning:{active,sitter}, night:{active,sitter}} }
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const [pendingRange, setPendingRange] = useState(null);
  const [pendingMorning, setPendingMorning] = useState(false);
  const [pendingNight, setPendingNight] = useState(false);
  const [pendingSitter, setPendingSitter] = useState("");
  const [conflictWarning, setConflictWarning] = useState(null);

  useEffect(() => {
    function onUp() {
      setDragging((wasDragging) => {
        if (wasDragging) {
          setDragStart((s) => {
            setDragCurrent((c) => {
              if (s && c) {
                setPendingRange({ start: s, end: c });
                const key = s <= c ? s : c;
                const existing = bookings[key];
                setPendingMorning(!!existing?.morning?.active);
                setPendingNight(!!existing?.night?.active);
                setPendingSitter(existing?.morning?.sitter || existing?.night?.sitter || "");
              }
              return c;
            });
            return s;
          });
        }
        return false;
      });
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [bookings]);

  const highlightSet = useMemo(() => {
    if (dragging && dragStart && dragCurrent) return new Set(datesInRange(dragStart, dragCurrent));
    if (pendingRange) return new Set(datesInRange(pendingRange.start, pendingRange.end));
    return new Set();
  }, [dragging, dragStart, dragCurrent, pendingRange]);

  // instructions
  const [morningInstr, setMorningInstr] = useState(DEFAULT_MORNING);
  const [nightInstr, setNightInstr] = useState(DEFAULT_NIGHT);
  const [editingMorning, setEditingMorning] = useState(false);
  const [editingNight, setEditingNight] = useState(false);

  // persistence
  const [loaded, setLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | saving | saved | error
  const pendingWrites = useRef(0);
  const savedFlashTimer = useRef(null);

  useEffect(() => {
    (async () => {
      const [b, instr] = await Promise.all([
        storageGet(KEYS.bookings),
        storageGet(KEYS.instructions),
      ]);
      if (b) setBookings(b);
      if (instr) {
        setMorningInstr(instr.morning ?? DEFAULT_MORNING);
        setNightInstr(instr.night ?? DEFAULT_NIGHT);
      }
      setLoaded(true);
    })();
  }, []);

  async function persist(key, value) {
    pendingWrites.current += 1;
    setSyncStatus("saving");
    const ok = await storageSet(key, value);
    pendingWrites.current -= 1;
    if (!ok) {
      setSyncStatus("error");
      return;
    }
    if (pendingWrites.current === 0) {
      setSyncStatus("saved");
      clearTimeout(savedFlashTimer.current);
      savedFlashTimer.current = setTimeout(() => setSyncStatus("idle"), 1500);
    }
  }

  useEffect(() => { if (loaded) persist(KEYS.bookings, bookings); }, [bookings, loaded]);
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => persist(KEYS.instructions, { morning: morningInstr, night: nightInstr }), 600);
    return () => clearTimeout(t);
  }, [morningInstr, nightInstr, loaded]);

  function cellMouseDown(key) {
    setDragging(true);
    setDragStart(key);
    setDragCurrent(key);
    setPendingRange(null);
    setConflictWarning(null);
  }
  function cellMouseEnter(key) {
    if (dragging) setDragCurrent(key);
  }
  function applyPending() {
    if (!pendingRange) return;
    const name = pendingSitter.trim();
    const keys = datesInRange(pendingRange.start, pendingRange.end);
    const next = { ...bookings };
    const conflicts = [];

    keys.forEach((k) => {
      const day = next[k] || { morning: { active: false, sitter: "" }, night: { active: false, sitter: "" } };
      const updated = { ...day };
      [["morning", pendingMorning], ["night", pendingNight]].forEach(([slot, wants]) => {
        if (!wants) return; // slot not part of this request — leave whatever is there alone
        const existing = day[slot];
        const ownedByOther = existing?.active && existing.sitter && existing.sitter.trim().toLowerCase() !== name.toLowerCase();
        if (ownedByOther) {
          conflicts.push({ date: k, slot, sitter: existing.sitter });
          return; // ownership lock — don't overwrite someone else's claim
        }
        updated[slot] = { active: true, sitter: name };
      });
      next[k] = updated;
    });

    setBookings(next);
    setConflictWarning(
      conflicts.length
        ? `Couldn't claim ${conflicts.length} visit${conflicts.length > 1 ? "s" : ""} already booked by someone else: ${conflicts
            .map((c) => `${fmtDateShort(c.date)} ${c.slot} (${c.sitter})`)
            .join(", ")}`
        : null
    );
    setPendingRange(null);
  }
  function clearPending() {
    if (!pendingRange) return;
    const name = pendingSitter.trim().toLowerCase();
    if (!name) {
      setConflictWarning("Enter the sitter's name so I know whose booking to clear.");
      return;
    }
    const keys = datesInRange(pendingRange.start, pendingRange.end);
    const next = { ...bookings };
    let removedAny = false;

    keys.forEach((k) => {
      const day = next[k];
      if (!day) return;
      const updated = { ...day };
      [["morning", pendingMorning], ["night", pendingNight]].forEach(([slot, wants]) => {
        if (!wants) return;
        const existing = day[slot];
        if (existing?.active && existing.sitter.trim().toLowerCase() === name) {
          updated[slot] = { active: false, sitter: "" };
          removedAny = true;
        }
      });
      if (!updated.morning?.active && !updated.night?.active) delete next[k];
      else next[k] = updated;
    });

    setBookings(next);
    setConflictWarning(removedAny ? null : "No bookings under that name in the selected slots to clear.");
    setPendingRange(null);
  }
  function unbookSlot(date, slot) {
    setBookings((prev) => {
      const day = prev[date];
      if (!day) return prev;
      const updated = { ...day, [slot]: { active: false, sitter: "" } };
      const next = { ...prev, [date]: updated };
      if (!updated.morning?.active && !updated.night?.active) delete next[date];
      return next;
    });
  }

  const upcomingBookings = useMemo(() => {
    const rows = [];
    Object.entries(bookings).forEach(([date, day]) => {
      if (date < todayKey()) return;
      if (day.morning?.active) rows.push({ date, slot: "morning", sitter: day.morning.sitter });
      if (day.night?.active) rows.push({ date, slot: "night", sitter: day.night.sitter });
    });
    rows.sort((a, b) => (a.date === b.date ? (a.slot === "morning" ? -1 : 1) : a.date < b.date ? -1 : 1));
    return rows;
  }, [bookings]);

  function exportText() {
    const lines = [];
    lines.push("PIPPER LOG");
    lines.push(`Snapshot generated ${new Date().toLocaleString()}`);
    lines.push("");
    lines.push("UPCOMING VISITS");
    if (upcomingBookings.length === 0) {
      lines.push("  No visits scheduled.");
    } else {
      upcomingBookings.forEach((row) => {
        lines.push(`  ${fmtDateShort(row.date)} — ${row.slot === "morning" ? "Morning" : "Night"} — ${row.sitter || "Unassigned"}`);
      });
    }
    lines.push("");
    lines.push("MORNING CARE");
    lines.push(`  ${morningInstr || "No instructions yet."}`);
    lines.push("");
    lines.push("NIGHT CARE");
    lines.push(`  ${nightInstr || "No instructions yet."}`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    downloadBlob(blob, "pipper-log-snapshot.txt");
  }

  function exportImage() {
    const width = 800;
    const paddingX = 48;
    const contentWidth = width - paddingX * 2;
    const lineHeight = 22;
    const sectionGap = 40;

    // measuring canvas, sized after we know the real height
    const measure = document.createElement("canvas").getContext("2d");
    measure.font = "14px Arial";
    const morningLines = wrapText(measure, morningInstr || "No instructions yet.", contentWidth);
    const nightLines = wrapText(measure, nightInstr || "No instructions yet.", contentWidth);
    const visitLineCount = upcomingBookings.length || 1;

    const height =
      60 + 24 + sectionGap +        // header + date line
      26 + visitLineCount * lineHeight + sectionGap +  // visits section
      26 + morningLines.length * lineHeight + sectionGap + // morning section
      26 + nightLines.length * lineHeight + 40;            // night section + bottom margin

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#EDE6D3";
    ctx.fillRect(0, 0, width, height);

    let y = 60;
    ctx.fillStyle = "#2B2A28";
    ctx.font = "bold 30px Georgia";
    ctx.fillText("Pipper Log", paddingX, y);

    y += 24;
    ctx.fillStyle = "#726A5C";
    ctx.font = "13px Arial";
    ctx.fillText(
      `Snapshot generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
      paddingX,
      y
    );

    y += sectionGap;
    ctx.fillStyle = "#2B2A28";
    ctx.font = "bold 18px Georgia";
    ctx.fillText("Upcoming visits", paddingX, y);
    y += 26;
    ctx.font = "14px Arial";
    if (upcomingBookings.length === 0) {
      ctx.fillStyle = "#726A5C";
      ctx.fillText("No visits scheduled.", paddingX, y);
      y += lineHeight;
    } else {
      upcomingBookings.forEach((row) => {
        ctx.fillStyle = row.slot === "morning" ? "#D9A93E" : "#3F6B64";
        ctx.beginPath();
        ctx.arc(paddingX + 4, y - 5, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2B2A28";
        ctx.fillText(
          `${fmtDateShort(row.date)} — ${row.slot === "morning" ? "Morning" : "Night"} — ${row.sitter || "Unassigned"}`,
          paddingX + 16,
          y
        );
        y += lineHeight;
      });
    }

    y += sectionGap - lineHeight;
    ctx.fillStyle = "#2B2A28";
    ctx.font = "bold 18px Georgia";
    ctx.fillText("Morning care", paddingX, y);
    y += 26;
    ctx.font = "14px Arial";
    morningLines.forEach((line) => {
      ctx.fillText(line, paddingX, y);
      y += lineHeight;
    });

    y += sectionGap - lineHeight;
    ctx.font = "bold 18px Georgia";
    ctx.fillText("Night care", paddingX, y);
    y += 26;
    ctx.font = "14px Arial";
    nightLines.forEach((line) => {
      ctx.fillText(line, paddingX, y);
      y += lineHeight;
    });

    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, "pipper-log-snapshot.png");
    }, "image/png");
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); } else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); } else setViewMonth((m) => m + 1);
  }

  return (
    <div className="pt-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

        .pt-root {
          --paper: #EDE6D3;
          --paper-alt: #F8F4E9;
          --ink: #2B2A28;
          --ink-soft: #726A5C;
          --teal: #3F6B64;
          --teal-deep: #2C4F49;
          --teal-tint: #DCE7E3;
          --gold: #D9A93E;
          --coral: #C9634A;
          --line: rgba(43,42,40,0.14);
          font-family: 'Inter', sans-serif;
          color: var(--ink);
          background: var(--paper);
          min-height: 100vh;
          padding: 32px 20px 80px;
          box-sizing: border-box;
          user-select: none;
        }
        .pt-root input, .pt-root textarea { user-select: text; }
        .pt-root * { box-sizing: border-box; }
        .pt-shell { max-width: 720px; margin: 0 auto; }

        .pt-header { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
        .pt-wordmark { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 600; letter-spacing: -0.01em; }
        .pt-header svg { color: var(--teal); }
        .pt-sync-badge { margin-left: auto; font-size: 12px; color: var(--ink-soft); display: inline-flex; align-items: center; gap: 5px; }
        .pt-sync-saved { color: var(--teal); }
        .pt-sync-retry { background: none; border: none; cursor: pointer; color: var(--coral); font-size: 12px; display: inline-flex; align-items: center; gap: 5px; padding: 0; }
        .pt-spin { animation: pt-spin 0.9s linear infinite; }
        @keyframes pt-spin { to { transform: rotate(360deg); } }
        .pt-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 80px 0; color: var(--ink-soft); font-size: 14px; }

        .pt-card { background: var(--paper-alt); border: 1px solid var(--line); border-radius: 18px; padding: 22px; }
        .pt-section-title { font-family: 'Fraunces', serif; font-size: 20px; margin: 0 0 14px; display: flex; align-items: center; gap: 8px; }
        .pt-section { margin-bottom: 24px; }

        .pt-btn {
          font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 500;
          border: none; border-radius: 999px; padding: 9px 18px;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          background: var(--teal); color: var(--paper-alt);
          transition: background 0.15s ease;
        }
        .pt-btn:hover { background: var(--teal-deep); }
        .pt-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .pt-btn-ghost { background: transparent; color: var(--teal); border: 1px solid var(--line); }
        .pt-btn-ghost:hover { background: var(--paper); }
        .pt-btn-sm { padding: 5px 12px; font-size: 12px; }
        .pt-icon-btn { background: none; border: none; cursor: pointer; color: var(--ink-soft); display: inline-flex; align-items: center; gap: 4px; font-size: 13px; }
        .pt-icon-btn:hover { color: var(--teal); }

        /* Calendar */
        .pt-cal-nav { display: flex; align-items: center; gap: 10px; margin-left: auto; }
        .pt-cal-nav button { background: none; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; color: var(--ink-soft); padding: 4px; display: flex; }
        .pt-cal-nav button:hover { color: var(--teal); border-color: var(--teal); }
        .pt-cal-nav span { font-family: 'IBM Plex Mono', monospace; font-size: 13px; min-width: 118px; text-align: center; }
        .pt-cal-header-row { display: flex; align-items: center; margin-bottom: 12px; }
        .pt-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
        .pt-cal-weekday { text-align: center; font-size: 11px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.04em; padding-bottom: 4px; }
        .pt-cal-cell { aspect-ratio: 1; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; cursor: pointer; border: 1px solid transparent; font-size: 13px; }
        .pt-cal-cell.pt-cal-empty { cursor: default; }
        .pt-cal-cell.pt-cal-real { background: var(--paper); }
        .pt-cal-cell.pt-cal-today { border-color: var(--teal); }
        .pt-cal-cell.pt-cal-highlight { background: var(--teal-tint); }
        .pt-cal-dots { display: flex; gap: 2px; height: 6px; }
        .pt-cal-dot { width: 5px; height: 5px; border-radius: 50%; }
        .pt-cal-dot-morning { background: var(--gold); }
        .pt-cal-dot-night { background: var(--teal); }
        .pt-cal-legend { display: flex; gap: 16px; margin-top: 12px; font-size: 12px; color: var(--ink-soft); }
        .pt-cal-legend span { display: inline-flex; align-items: center; gap: 5px; }
        .pt-cal-legend .pt-cal-dot { width: 7px; height: 7px; }

        .pt-toolbar { margin-top: 14px; background: var(--teal-tint); border-radius: 12px; padding: 12px 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
        .pt-toolbar-label { font-size: 13px; font-weight: 500; }
        .pt-toolbar-check { display: flex; align-items: center; gap: 5px; font-size: 13px; cursor: pointer; }
        .pt-toolbar-actions { display: flex; gap: 8px; margin-left: auto; }
        .pt-toolbar-name { font-family: 'Inter', sans-serif; font-size: 13px; border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; background: var(--paper-alt); min-width: 140px; }
        .pt-toolbar-name:focus { outline: 2px solid var(--teal); outline-offset: 1px; }

        .pt-conflict-warning { margin-top: 12px; background: #F5E1DA; border: 1px solid rgba(201,99,74,0.35); color: var(--coral); border-radius: 10px; padding: 10px 12px; font-size: 12.5px; display: flex; align-items: flex-start; gap: 8px; }
        .pt-conflict-warning button { margin-left: auto; background: none; border: none; cursor: pointer; color: var(--coral); flex-shrink: 0; display: flex; }

        .pt-upcoming { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
        .pt-upcoming-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-soft); margin-bottom: 8px; }
        .pt-upcoming-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 13px; }
        .pt-upcoming-date { font-family: 'IBM Plex Mono', monospace; color: var(--ink-soft); width: 54px; flex-shrink: 0; }
        .pt-upcoming-sitter { flex: 1; font-weight: 500; }
        .pt-upcoming-row .pt-entry-del { background: none; border: none; cursor: pointer; color: var(--ink-soft); opacity: 0; transition: opacity 0.15s ease; padding: 2px; display: flex; }
        .pt-upcoming-row:hover .pt-entry-del { opacity: 1; }
        .pt-upcoming-row .pt-entry-del:hover { color: var(--coral); }

        /* Instructions */
        .pt-instr-grid { display: flex; gap: 18px; flex-wrap: wrap; }
        .pt-instr-card { flex: 1 1 260px; }
        .pt-instr-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .pt-instr-head .pt-section-title { margin: 0; }
        .pt-instr-text { font-size: 14px; line-height: 1.55; color: var(--ink); white-space: pre-wrap; }
        .pt-instr-textarea { width: 100%; min-height: 90px; font-family: 'Inter', sans-serif; font-size: 14px; line-height: 1.55; border: 1px solid var(--line); border-radius: 10px; padding: 10px; background: var(--paper); resize: vertical; }

        .pt-export-row { display: flex; gap: 8px; margin-bottom: 20px; }

        @media (max-width: 560px) {
          .pt-cal-cell { font-size: 11px; }
        }
      `}</style>

      <div className="pt-shell">
        <div className="pt-header">
          <PawPrint size={26} strokeWidth={2.2} />
          <span className="pt-wordmark">Pipper Log</span>
          <span className={`pt-sync-badge pt-sync-${syncStatus}`}>
            {syncStatus === "saving" && <><Loader2 size={12} className="pt-spin" /> Saving…</>}
            {syncStatus === "saved" && <><Check size={12} /> Saved</>}
            {syncStatus === "error" && (
              <button className="pt-sync-retry" onClick={() => persist(KEYS.bookings, bookings)}>
                <AlertCircle size={12} /> Sync failed — retry <RefreshCw size={11} />
              </button>
            )}
          </span>
        </div>

        {!loaded ? (
          <div className="pt-loading">
            <Loader2 size={20} className="pt-spin" />
            <span>Loading shared data…</span>
          </div>
        ) : (
          <>
            {/* Export */}
            <div className="pt-export-row">
              <button className="pt-btn pt-btn-ghost pt-btn-sm" onClick={exportImage}>
                <ImageIcon size={13} /> Download as image
              </button>
              <button className="pt-btn pt-btn-ghost pt-btn-sm" onClick={exportText}>
                <FileText size={13} /> Download as text
              </button>
            </div>

            {/* Calendar */}
            <div className="pt-section pt-card">
              <div className="pt-cal-header-row">
                <h2 className="pt-section-title">Sitter calendar</h2>
                <div className="pt-cal-nav">
                  <button onClick={prevMonth} aria-label="Previous month"><ChevronLeft size={16} /></button>
                  <span>{monthLabel}</span>
                  <button onClick={nextMonth} aria-label="Next month"><ChevronRight size={16} /></button>
                </div>
              </div>

              <div className="pt-cal-grid">
                {WEEKDAYS.map((w, i) => <div className="pt-cal-weekday" key={i}>{w}</div>)}
                {Array.from({ length: firstWeekday }).map((_, i) => <div className="pt-cal-cell pt-cal-empty" key={"empty" + i} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const key = dateKey(viewYear, viewMonth, day);
                  const booking = bookings[key];
                  const isHighlighted = highlightSet.has(key);
                  const isToday = key === todayKey();
                  return (
                    <div
                      key={key}
                      className={`pt-cal-cell pt-cal-real ${isHighlighted ? "pt-cal-highlight" : ""} ${isToday ? "pt-cal-today" : ""}`}
                      onMouseDown={() => cellMouseDown(key)}
                      onMouseEnter={() => cellMouseEnter(key)}
                      title={
                        [booking?.morning?.active && `Morning: ${booking.morning.sitter || "unassigned"}`, booking?.night?.active && `Night: ${booking.night.sitter || "unassigned"}`]
                          .filter(Boolean)
                          .join(" · ") || undefined
                      }
                    >
                      <span>{day}</span>
                      <div className="pt-cal-dots">
                        {booking?.morning?.active && <span className="pt-cal-dot pt-cal-dot-morning" />}
                        {booking?.night?.active && <span className="pt-cal-dot pt-cal-dot-night" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-cal-legend">
                <span><span className="pt-cal-dot pt-cal-dot-morning" /> Morning visit</span>
                <span><span className="pt-cal-dot pt-cal-dot-night" /> Night visit</span>
              </div>

              {pendingRange && (
                <div className="pt-toolbar">
                  <span className="pt-toolbar-label">{fmtRange(pendingRange.start, pendingRange.end)}</span>
                  <input
                    className="pt-toolbar-name"
                    type="text"
                    placeholder="Sitter's name"
                    value={pendingSitter}
                    onChange={(e) => setPendingSitter(e.target.value)}
                  />
                  <label className="pt-toolbar-check">
                    <input type="checkbox" checked={pendingMorning} onChange={(e) => setPendingMorning(e.target.checked)} /> Morning
                  </label>
                  <label className="pt-toolbar-check">
                    <input type="checkbox" checked={pendingNight} onChange={(e) => setPendingNight(e.target.checked)} /> Night
                  </label>
                  <div className="pt-toolbar-actions">
                    <button className="pt-btn pt-btn-ghost pt-btn-sm" onClick={clearPending}>Clear</button>
                    <button
                      className="pt-btn pt-btn-sm"
                      onClick={applyPending}
                      disabled={(pendingMorning || pendingNight) && !pendingSitter.trim()}
                    >
                      <Check size={13} /> Save
                    </button>
                  </div>
                </div>
              )}

              {conflictWarning && (
                <div className="pt-conflict-warning">
                  <AlertCircle size={13} />
                  <span>{conflictWarning}</span>
                  <button onClick={() => setConflictWarning(null)} aria-label="Dismiss"><X size={13} /></button>
                </div>
              )}

              {upcomingBookings.length > 0 && (
                <div className="pt-upcoming">
                  <div className="pt-upcoming-title">Upcoming visits</div>
                  {upcomingBookings.map((row) => (
                    <div className="pt-upcoming-row" key={row.date + row.slot}>
                      {row.slot === "morning" ? <Sun size={13} color="var(--gold)" /> : <Moon size={13} color="var(--teal)" />}
                      <span className="pt-upcoming-date">{fmtDateShort(row.date)}</span>
                      <span className="pt-upcoming-sitter">{row.sitter || "Unassigned"}</span>
                      <button className="pt-entry-del" onClick={() => unbookSlot(row.date, row.slot)} aria-label="Remove visit">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="pt-section pt-instr-grid">
              <div className="pt-card pt-instr-card">
                <div className="pt-instr-head">
                  <h2 className="pt-section-title"><Sun size={17} color="var(--gold)" /> Morning care</h2>
                  <button className="pt-icon-btn" onClick={() => setEditingMorning((v) => !v)}>
                    {editingMorning ? <><Check size={13} /> Done</> : <><Pencil size={13} /> Edit</>}
                  </button>
                </div>
                {editingMorning ? (
                  <textarea className="pt-instr-textarea" value={morningInstr} onChange={(e) => setMorningInstr(e.target.value)} autoFocus />
                ) : (
                  <p className="pt-instr-text">{morningInstr || "No instructions yet."}</p>
                )}
              </div>
              <div className="pt-card pt-instr-card">
                <div className="pt-instr-head">
                  <h2 className="pt-section-title"><Moon size={17} color="var(--teal)" /> Night care</h2>
                  <button className="pt-icon-btn" onClick={() => setEditingNight((v) => !v)}>
                    {editingNight ? <><Check size={13} /> Done</> : <><Pencil size={13} /> Edit</>}
                  </button>
                </div>
                {editingNight ? (
                  <textarea className="pt-instr-textarea" value={nightInstr} onChange={(e) => setNightInstr(e.target.value)} autoFocus />
                ) : (
                  <p className="pt-instr-text">{nightInstr || "No instructions yet."}</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
