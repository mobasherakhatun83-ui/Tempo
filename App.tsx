import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Hourglass, Moon, Sun } from "lucide-react";
import * as audio from "./lib/audio";
import type { SoundType } from "./lib/audio";
import { useStudyTimer, type Phase } from "./hooks/useStudyTimer";
import { useAlarmClock } from "./hooks/useAlarmClock";
import { clockParts, formatMs, timeStringFromNow } from "./lib/time";
import { Background } from "./components/Background";
import { ModeSwitch, type Mode } from "./components/ModeSwitch";
import { StudyTimer } from "./components/StudyTimer";
import { AlarmClockView } from "./components/AlarmClockView";
import { SoundPanel } from "./components/SoundPanel";
import { RingingOverlay, type RingInfo } from "./components/RingingOverlay";

const THEMES = {
  focus: { accent: "#22d3ee", soft: "#60a5fa" },
  rest: { accent: "#34d399", soft: "#2dd4bf" },
  alarm: { accent: "#a78bfa", soft: "#f472b6" },
} as const;

export default function App() {
  const [mode, setMode] = useState<Mode>("timer");
  const [sound, setSound] = useState<SoundType>("boom");
  const [volume, setVolume] = useState(0.85);
  const [customName, setCustomName] = useState<string | null>(null);
  const [ringing, setRinging] = useState<RingInfo | null>(null);

  /* refs so hook callbacks always read fresh values */
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    audio.setMasterVolume(volume);
  }, [volume]);

  /* ------------------------- hooks ------------------------- */

  const study = useStudyTimer({
    onPhaseComplete: useCallback((next: Phase) => {
      setRinging({
        source: "timer",
        nextPhase: next,
        nextMinutes: next === "break" ? studyRef.current.breakMin : studyRef.current.studyMin,
      });
      audio.startLoop(soundRef.current);
    }, []),
  });

  const alarm = useAlarmClock({
    onRing: useCallback(() => {
      setRinging({ source: "alarm" });
      audio.startLoop(soundRef.current);
    }, []),
  });

  /* latest-value refs for global handlers */
  const studyRef = useRef(study);
  studyRef.current = study;
  const alarmRef = useRef(alarm);
  alarmRef.current = alarm;
  const ringingRef = useRef(ringing);
  ringingRef.current = ringing;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  /* ---------------------- ring control ---------------------- */

  const stopRinging = useCallback(() => {
    audio.stopLoop();
    setRinging(null);
    if (alarmRef.current.ringing) alarmRef.current.acknowledge();
  }, []);

  const startNextBlock = useCallback(() => {
    stopRinging();
    studyRef.current.start();
  }, [stopRinging]);

  const snooze = useCallback(() => {
    stopRinging();
    alarmRef.current.snooze(5);
    setMode("alarm");
  }, [stopRinging]);

  const quickSet = useCallback((mins: number) => {
    const a = alarmRef.current;
    a.setTimeOnly(timeStringFromNow(mins));
    a.snooze(mins); // arms an exact timestamp "mins" from now
  }, []);

  /* --------------------- document title --------------------- */

  useEffect(() => {
    const base = "Tempo — Study Timer & Alarm";
    if (ringing) {
      document.title = "Ringing… — Tempo";
    } else if (mode === "timer" && study.status !== "idle") {
      document.title = `${formatMs(study.remainingMs)} · ${study.phase === "focus" ? "Focus" : "Break"} — Tempo`;
    } else if (alarm.enabled) {
      document.title = `Alarm set ${alarm.timeStr} — Tempo`;
    } else {
      document.title = base;
    }
    return () => {
      document.title = base;
    };
  }, [ringing, mode, study.status, study.phase, study.remainingMs, alarm.enabled, alarm.timeStr]);

  /* --------------------- keyboard control -------------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      if (e.code === "Space") {
        e.preventDefault();
        if (ringingRef.current) {
          if (ringingRef.current.source === "timer") startNextBlock();
          else stopRinging();
        } else if (modeRef.current === "timer") {
          studyRef.current.toggle();
        }
      }
      if (e.code === "KeyR" && !ringingRef.current && modeRef.current === "timer") {
        studyRef.current.reset();
      }
      if (e.code === "Escape" && ringingRef.current) stopRinging();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startNextBlock, stopRinging]);

  /* -------------------------- theme -------------------------- */

  const active =
    mode === "timer" ? (study.phase === "focus" ? THEMES.focus : THEMES.rest) : THEMES.alarm;
  const accent = ringing ? "#fb5e7a" : active.accent;
  const accentSoft = ringing ? "#fb923c" : active.soft;

  const themeVars = {
    "--accent": accent,
    "--accent-glow": `${accent}66`,
    "--accent-ring": `${accent}2e`,
  } as React.CSSProperties;

  const { h, m, s } = clockParts(alarm.now);
  const hour = new Date(alarm.now).getHours();
  const DayIcon = hour >= 6 && hour < 19 ? Sun : Moon;

  /* --------------------------- UI ---------------------------- */

  return (
    <div className="relative min-h-screen" style={themeVars}>
      <Background phase={study.phase} ringing={!!ringing} />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 pb-8 sm:px-8">
        {/* header */}
        <header className="flex items-center justify-between pt-6">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[#0a0a10] transition-colors duration-500"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accentSoft})`, boxShadow: `0 4px 22px -4px ${accent}88` }}
            >
              <Hourglass className="h-4.5 w-4.5" style={{ height: 18, width: 18 }} strokeWidth={2.4} />
            </div>
            <div className="leading-tight">
              <p className="text-[15px] font-bold tracking-[0.22em] text-white">TEMPO</p>
              <p className="text-[11px] font-medium tracking-wide text-zinc-500">study timer &amp; alarm</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 backdrop-blur-md">
            <DayIcon className="h-3.5 w-3.5" style={{ color: accent }} />
            <span className="tabular font-mono text-[13px] font-medium tracking-wider text-zinc-300">
              {h}:{m}
              <span className="text-zinc-600">:{s}</span>
            </span>
          </div>
        </header>

        {/* mode switch */}
        <div className="mt-7 flex justify-center">
          <ModeSwitch mode={mode} onChange={setMode} />
        </div>

        {/* main stage */}
        <main className="flex flex-1 flex-col items-center justify-center py-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -20, filter: "blur(8px)" }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex w-full flex-col items-center"
            >
              {mode === "timer" ? (
                <StudyTimer study={study} accent={accent} accentSoft={accentSoft} />
              ) : (
                <AlarmClockView alarm={alarm} accent={accent} accentSoft={accentSoft} onQuickSet={quickSet} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* sound */}
        <div className="flex justify-center">
          <SoundPanel
            sound={sound}
            onSelect={setSound}
            volume={volume}
            onVolume={setVolume}
            customName={customName}
            onUpload={(f) => {
              setCustomName(audio.loadCustomFile(f));
              setSound("custom");
            }}
            onTest={() => audio.playOnce(sound)}
            accent={accent}
          />
        </div>

        {/* footer */}
        <footer className="mt-8 hidden items-center justify-center gap-6 text-[11px] font-medium tracking-wide text-zinc-600 sm:flex">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">Space</kbd>
            start / pause
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">R</kbd>
            reset timer
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">Esc</kbd>
            stop alarm
          </span>
        </footer>
      </div>

      {/* ringing takeover */}
      <AnimatePresence>
        {ringing && (
          <RingingOverlay
            info={ringing}
            now={alarm.now}
            onStop={stopRinging}
            onSnooze={snooze}
            onStartNext={startNextBlock}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
