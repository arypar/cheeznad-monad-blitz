"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { ZONE_LIST } from "@/lib/zones";
import { Zone } from "@/types";
import { useSynthBeats } from "@/hooks/useSynthBeats";
import type { SynthEngine } from "@/lib/synthBeats";

// ─── Scene definitions ──────────────────────────────────────────────────────────
type Scene =
  | "titleDrop"
  | "theHook"
  | "zonesReveal"
  | "pizzaPicker"
  | "howItWorks"
  | "connectWallet"
  | "launchCta";

const SCENES: Scene[] = [
  "titleDrop",
  "theHook",
  "zonesReveal",
  "pizzaPicker",
  "howItWorks",
  "connectWallet",
  "launchCta",
];

const SCENE_DURATIONS: Record<Scene, number | null> = {
  titleDrop: 4000,
  theHook: 8500,
  zonesReveal: 13000,
  pizzaPicker: null,
  howItWorks: 5000,
  connectWallet: null,
  launchCta: null,
};

// ─── Shared transition ──────────────────────────────────────────────────────────
const pageTransition = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.25 } },
};

// ─── Protocol data ──────────────────────────────────────────────────────────────
const ZONE_PROTOCOLS: Record<string, string[]> = {
  pepperoni: ["Kuru", "Bean", "Ambient"],
  mushroom: ["aPriori", "Curvance", "Shmonad"],
  pineapple: ["nad.fun", "LFJ", "PinkSale"],
  olive: ["Monorail", "Pyth", "LayerZero"],
  anchovy: ["aPuff", "Castora", "Yap"],
};

// ─── Pizza geometry ─────────────────────────────────────────────────────────────
const VB = 560;
const PCX = VB / 2;
const PCY = VB / 2;
const CRUST_R = 158;
const CHEESE_R = 146;
const PIZZA_R = 143;
const SLICE_ANG = (2 * Math.PI) / 5;
const ANG_START = -Math.PI / 2;
const ARC_GAP = 0.025;

function polar(a: number, r: number) {
  return { x: PCX + r * Math.cos(a), y: PCY + r * Math.sin(a) };
}

function makeSlicePath(i: number) {
  const a1 = ANG_START + i * SLICE_ANG + ARC_GAP;
  const a2 = ANG_START + (i + 1) * SLICE_ANG - ARC_GAP;
  const p1 = polar(a1, PIZZA_R);
  const p2 = polar(a2, PIZZA_R);
  return `M${PCX},${PCY} L${p1.x},${p1.y} A${PIZZA_R},${PIZZA_R} 0 0,1 ${p2.x},${p2.y} Z`;
}

function sliceCenter(i: number, frac: number) {
  const a = ANG_START + (i + 0.5) * SLICE_ANG;
  return polar(a, PIZZA_R * frac);
}

function slicePull(i: number, dist: number) {
  const a = ANG_START + (i + 0.5) * SLICE_ANG;
  return { x: Math.cos(a) * dist, y: Math.sin(a) * dist };
}

function getAnchor(i: number): "start" | "middle" | "end" {
  const a = ANG_START + (i + 0.5) * SLICE_ANG;
  const c = Math.cos(a);
  return c > 0.3 ? "start" : c < -0.3 ? "end" : "middle";
}

// ─── Seeded random for SSR-safe positions ───────────────────────────────────────
function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

// ─── Floating Slice Background (every scene) ───────────────────────────────────
function FloatingPizzas({ count = 10, seed = 0 }: { count?: number; seed?: number }) {
  const pizzas = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        x: Math.round(seededRandom(seed + i * 7) * 100),
        y: Math.round(seededRandom(seed + i * 13) * 100),
        size: Math.round(seededRandom(seed + i * 19) * 30 + 24),
        delay: Math.round(seededRandom(seed + i * 23) * 60) / 10,
        duration: Math.round(seededRandom(seed + i * 29) * 80 + 100) / 10,
        rotate: Math.round(seededRandom(seed + i * 31) * 360),
        drift: Math.round((seededRandom(seed + i * 37) - 0.5) * 60),
        imageIdx: Math.floor(seededRandom(seed + i * 43) * ZONE_LIST.length),
      })),
    [count, seed]
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {pizzas.map((p, i) => (
        <motion.div
          key={i}
          className="absolute select-none"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
          }}
          initial={{ opacity: 0, rotate: p.rotate }}
          animate={{
            opacity: [0, 0.15, 0.1, 0.15, 0],
            y: [0, p.drift, -p.drift, 0],
            x: [0, p.drift * 0.5, -p.drift * 0.3, 0],
            rotate: [p.rotate, p.rotate + 30, p.rotate - 20, p.rotate + 10],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ZONE_LIST[p.imageIdx].sliceImage}
            alt=""
            style={{ width: p.size, height: p.size }}
            draggable={false}
          />
        </motion.div>
      ))}
    </div>
  );
}

// ─── Slice Rain (title + CTA screens) ────────────────────────────────────────────
function PizzaRain({ count = 30 }: { count?: number }) {
  const slices = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        x: Math.round(seededRandom(i * 43 + 7) * 100),
        delay: Math.round(seededRandom(i * 17 + 3) * 40) / 10,
        duration: Math.round(seededRandom(i * 11 + 5) * 30 + 30) / 10,
        size: Math.round(seededRandom(i * 23 + 9) * 24 + 20),
        rotate: Math.round(seededRandom(i * 31 + 2) * 720 - 360),
        wobble: Math.round((seededRandom(i * 41 + 1) - 0.5) * 80),
        imageIdx: Math.floor(seededRandom(i * 53 + 8) * ZONE_LIST.length),
      })),
    [count]
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {slices.map((s, i) => (
        <motion.div
          key={i}
          className="absolute select-none"
          style={{ left: `${s.x}%`, top: -40 }}
          animate={{
            y: [0, 1000],
            x: [0, s.wobble],
            rotate: [0, s.rotate],
            opacity: [0.6, 0.4, 0],
          }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ZONE_LIST[s.imageIdx].sliceImage}
            alt=""
            style={{ width: s.size, height: s.size }}
            draggable={false}
          />
        </motion.div>
      ))}
    </div>
  );
}

// ─── Progress Bar ───────────────────────────────────────────────────────────────
function ProgressBar({
  sceneIndex,
  total,
}: {
  sceneIndex: number;
  total: number;
}) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => {
        const isActive = sceneIndex === i;
        const isDone = sceneIndex > i;
        return (
          <motion.div
            key={i}
            className="rounded-full"
            style={{
              background: isActive
                ? "#111"
                : isDone
                  ? "rgba(0,0,0,0.3)"
                  : "rgba(0,0,0,0.1)",
            }}
            initial={false}
            animate={{
              width: isActive ? 28 : 8,
              height: 8,
            }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          />
        );
      })}
    </div>
  );
}

// ─── Navigation Hint ────────────────────────────────────────────────────────────
function NavHint({ canGoBack, canGoForward }: { canGoBack: boolean; canGoForward: boolean }) {
  return (
    <motion.div
      className="fixed bottom-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.5 }}
    >
      <span
        className="text-[10px] tracking-[0.2em] uppercase"
        style={{ color: "rgba(0,0,0,0.2)" }}
      >
        use arrow keys
      </span>
    </motion.div>
  );
}

// ─── Scene 1: Title Drop ────────────────────────────────────────────────────────
function TitleDropScene({ engine }: { engine: SynthEngine }) {
  const [phase, setPhase] = useState<"pre" | "slam" | "shake" | "settled">("pre");

  useEffect(() => {
    engine.whoosh();
    const t0 = requestAnimationFrame(() => {
      setPhase("slam");
      engine.kick();
    });
    const t1 = setTimeout(() => {
      setPhase("shake");
      engine.hihat();
    }, 600);
    const t2 = setTimeout(() => setPhase("settled"), 1100);
    return () => {
      cancelAnimationFrame(t0);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const orbitSlices = useMemo(
    () =>
      ZONE_LIST.map((z, i) => ({
        angle: Math.round((i / 5) * 360),
        sliceImage: z.sliceImage,
        delay: i * 0.12,
      })),
    []
  );

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={
        phase === "shake"
          ? { x: [0, -12, 14, -10, 8, -4, 2, 0], y: [0, 8, -6, 10, -8, 4, -2, 0] }
          : { x: 0, y: 0 }
      }
      transition={phase === "shake" ? { duration: 0.5, ease: "easeOut" } : {}}
      className="flex flex-col items-center justify-center h-full relative"
    >
      <PizzaRain count={35} />
      <FloatingPizzas count={12} seed={42} />

      {/* Impact flash */}
      <AnimatePresence>
        {phase === "shake" && (
          <motion.div
            className="absolute inset-0 z-30 pointer-events-none"
            style={{ background: "white" }}
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          />
        )}
      </AnimatePresence>

      {/* Impact ring */}
      <AnimatePresence>
        {(phase === "shake" || phase === "settled") && (
          <motion.div
            className="absolute rounded-full z-10 pointer-events-none"
            style={{ border: "3px solid rgba(230,57,70,0.3)" }}
            initial={{ width: 0, height: 0, opacity: 0.8 }}
            animate={{ width: 1200, height: 1200, opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* Cycling glow */}
      {phase === "settled" && (
        <motion.div
          className="absolute w-72 h-72 rounded-full"
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            background: [
              "radial-gradient(circle, rgba(230,57,70,0.12) 0%, transparent 70%)",
              "radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)",
              "radial-gradient(circle, rgba(212,160,23,0.12) 0%, transparent 70%)",
              "radial-gradient(circle, rgba(8,145,178,0.12) 0%, transparent 70%)",
              "radial-gradient(circle, rgba(234,88,12,0.12) 0%, transparent 70%)",
            ],
            scale: [2, 2.8, 2.4, 2.6, 2],
          }}
          transition={{
            opacity: { duration: 0.5 },
            background: { duration: 8, repeat: Infinity, ease: "linear" },
            scale: { duration: 8, repeat: Infinity, ease: "linear" },
          }}
        />
      )}

      {/* Orbiting slice images */}
      {orbitSlices.map((e, i) => (
        <motion.div
          key={i}
          className="absolute z-10"
          initial={{ opacity: 0, scale: 0 }}
          animate={
            phase === "settled"
              ? {
                  opacity: 0.6,
                  scale: 1,
                  rotate: [e.angle, e.angle + 360],
                  x: [
                    Math.round(Math.cos((e.angle * Math.PI) / 180) * 220),
                    Math.round(Math.cos(((e.angle + 360) * Math.PI) / 180) * 220),
                  ],
                  y: [
                    Math.round(Math.sin((e.angle * Math.PI) / 180) * 140),
                    Math.round(Math.sin(((e.angle + 360) * Math.PI) / 180) * 140),
                  ],
                }
              : { opacity: 0, scale: 0 }
          }
          transition={{
            opacity: { delay: e.delay, duration: 0.4 },
            scale: { delay: e.delay, duration: 0.4, type: "spring", stiffness: 300, damping: 15 },
            rotate: { duration: 20, repeat: Infinity, ease: "linear" },
            x: { duration: 20, repeat: Infinity, ease: "linear" },
            y: { duration: 20, repeat: Infinity, ease: "linear" },
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={e.sliceImage} alt="" style={{ width: 52, height: 52 }} draggable={false} />
        </motion.div>
      ))}

      {/* Logo -- slams in huge */}
      <motion.div
        className="relative z-20"
        initial={{ y: -800, scale: 5, opacity: 0 }}
        animate={
          phase === "pre"
            ? { y: -800, scale: 5, opacity: 0 }
            : { y: 0, scale: 1, opacity: 1 }
        }
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/cheeznad.png"
          alt="Cheeznad"
          className="w-[80vw] h-[80vw] sm:w-[600px] sm:h-[600px] max-w-none"
          style={{ objectFit: "contain" }}
          draggable={false}
        />
      </motion.div>

      {/* Subtitle */}
      <AnimatePresence>
        {phase === "settled" && (
          <motion.p
            className="text-lg sm:text-2xl mt-2 tracking-wide z-20 text-center font-bold"
            style={{
              fontFamily: "var(--font-nunito), system-ui",
              color: "#111",
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            The first prediction market on network utilization
          </motion.p>
        )}
      </AnimatePresence>

      {/* Big slice behind title */}
      <motion.div
        className="absolute z-0 select-none"
        style={{ opacity: 0.06 }}
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/pepperoni.png" alt="" style={{ width: 400, height: 400 }} draggable={false} />
      </motion.div>
    </motion.div>
  );
}

// ─── Scene 2: The Hook (sequential story) ───────────────────────────────────────
function TheHookScene({ engine }: { engine: SynthEngine }) {
  const [beat, setBeat] = useState(0);
  const [counter, setCounter] = useState(0);
  const counterRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const t1 = setTimeout(() => { setBeat(1); engine.hihat(); engine.rise(2500); }, 1800);
    const t2 = setTimeout(() => { setBeat(2); engine.hihat(); }, 4500);
    const t3 = setTimeout(() => { setBeat(3); engine.pop(500); }, 6500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (beat === 1 && !counterRef.current) {
      counterRef.current = setInterval(() => {
        setCounter((c) => {
          if (c >= 10000) {
            if (counterRef.current) clearInterval(counterRef.current);
            return 10000;
          }
          return Math.min(c + Math.floor(Math.random() * 400 + 200), 10000);
        });
      }, 50);
    }
    return () => {
      if (counterRef.current) clearInterval(counterRef.current);
    };
  }, [beat]);

  return (
    <motion.div
      {...pageTransition}
      className="flex flex-col items-center justify-center h-full relative px-6"
    >
      <FloatingPizzas count={10} seed={99} />

      <AnimatePresence mode="wait">
        {/* Beat 0: "Monad is fast." */}
        {beat === 0 && (
          <motion.div
            key="beat0"
            className="flex flex-col items-center z-10"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.5 }}
          >
            <h2
              className="text-4xl sm:text-6xl font-black text-center"
              style={{ fontFamily: "var(--font-nunito), system-ui", color: "#111" }}
            >
              Monad is fast.
            </h2>
            <p className="text-base sm:text-lg mt-4 text-center" style={{ color: "rgba(0,0,0,0.3)" }}>
              Really, really fast.
            </p>
          </motion.div>
        )}

        {/* Beat 1: Counter takes over the screen */}
        {beat === 1 && (
          <motion.div
            key="beat1"
            className="flex flex-col items-center z-10"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
          >
            <p className="text-sm uppercase tracking-[0.3em] mb-4" style={{ color: "rgba(0,0,0,0.25)" }}>
              transactions per second
            </p>
            <span
              className="text-7xl sm:text-9xl font-black tabular-nums"
              style={{
                fontFamily: "var(--font-nunito), system-ui",
                letterSpacing: "-3px",
                color: "#111",
                textShadow:
                  counter >= 10000
                    ? "0 0 40px rgba(230,57,70,0.3)"
                    : "none",
              }}
            >
              {counter.toLocaleString()}
            </span>
            <p className="text-lg mt-2 font-bold" style={{ color: "rgba(0,0,0,0.2)" }}>
              slices per second
            </p>
          </motion.div>
        )}

        {/* Beat 2: "Every tx goes somewhere" */}
        {beat === 2 && (
          <motion.div
            key="beat2"
            className="flex flex-col items-center z-10 px-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.5 }}
          >
            <h2
              className="text-3xl sm:text-5xl font-black text-center leading-tight"
              style={{ fontFamily: "var(--font-nunito), system-ui", color: "#111" }}
            >
              Every transaction lands
              <br />
              in a{" "}
              <span style={{ color: "#E63946" }}>zone</span>
            </h2>
            <p className="text-base mt-4 text-center" style={{ color: "rgba(0,0,0,0.35)" }}>
              DEX trades, lending, memes, infra, gaming
            </p>
          </motion.div>
        )}

        {/* Beat 3: The question */}
        {beat === 3 && (
          <motion.div
            key="beat3"
            className="flex flex-col items-center z-10 px-4"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <h2
              className="text-3xl sm:text-5xl font-black text-center leading-tight"
              style={{ fontFamily: "var(--font-nunito), system-ui", color: "#111" }}
            >
              What if you could
              <br />
              <span style={{ color: "#E63946" }}>bet</span> on which zone
              <br />
              burns hottest?
            </h2>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Zone intro lines (talking slices) ───────────────────────────────────────────
const ZONE_INTROS: Record<string, { line: string; vibe: string }> = {
  pepperoni: { line: "I run the DEXs around here.", vibe: "Swaps, perps, all the action" },
  mushroom: { line: "Slow and steady wins the yield.", vibe: "Lending, staking, compounding" },
  pineapple: { line: "Controversial? I prefer legendary.", vibe: "Memecoins, launches, degen plays" },
  olive: { line: "I keep the lights on.", vibe: "Oracles, bridges, infrastructure" },
  anchovy: { line: "Underrated. Just watch.", vibe: "Gaming, social, AI, NFTs" },
};

// ─── Zone pop frequencies (one per zone for musical variety) ─────────────────────
const ZONE_POP_FREQ = [330, 440, 523, 587, 660]; // E4, A4, C5, D5, E5

// ─── Scene 3: Pizza Box Zones Reveal ─────────────────────────────────────────────
function ZonesRevealScene({ engine }: { engine: SynthEngine }) {
  const [phase, setPhase] = useState<"box" | "open" | "slices" | "intros">("box");
  const [activeSlice, setActiveSlice] = useState(-1);

  useEffect(() => {
    const t1 = setTimeout(() => { setPhase("open"); engine.whoosh(); }, 800);
    const t2 = setTimeout(() => { setPhase("slices"); engine.hihat(); }, 1800);
    const t3 = setTimeout(() => {
      setPhase("intros");
      setActiveSlice(0);
      engine.pop(ZONE_POP_FREQ[0]);
    }, 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase !== "intros" || activeSlice < 0) return;
    if (activeSlice >= ZONE_LIST.length - 1) return;
    const nextIdx = activeSlice + 1;
    const t = setTimeout(() => {
      setActiveSlice(nextIdx);
      engine.pop(ZONE_POP_FREQ[nextIdx] || 440);
    }, 1800);
    return () => clearTimeout(t);
  }, [phase, activeSlice]);

  return (
    <motion.div
      {...pageTransition}
      className="flex flex-col items-center justify-center h-full relative px-4 overflow-hidden"
    >
      <FloatingPizzas count={6} seed={200} />

      {/* 3D Pizza box */}
      <motion.div
        className="relative z-10"
        style={{ perspective: 900 }}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{
          scale: phase === "intros" ? 0.55 : 1,
          opacity: 1,
          y: phase === "intros" ? -25 : 0,
        }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          style={{ transformStyle: "preserve-3d", width: 280, height: 220 }}
          animate={{
            rotateX: 55,
            rotateZ: -15,
            rotateY: phase === "box" ? [0, 3, 0, -3, 0] : 0,
          }}
          transition={{
            rotateY: phase === "box" ? { duration: 3, repeat: Infinity, ease: "easeInOut" } : { duration: 0.6 },
            default: { duration: 0.6 },
          }}
        >
          {/* ── Box base ── */}
          <div
            className="absolute"
            style={{
              width: 260,
              height: 260,
              left: 10,
              top: -20,
              background: "linear-gradient(135deg, #faf0e4 0%, #f0dfc5 100%)",
              border: "2.5px solid #c49a5c",
              borderRadius: 6,
              boxShadow:
                "inset 0 0 30px rgba(180,140,60,0.06), 0 20px 60px -10px rgba(0,0,0,0.18), 0 8px 20px -5px rgba(0,0,0,0.08)",
            }}
          >
            {/* Grease ring */}
            <div
              className="absolute rounded-full"
              style={{
                width: 190,
                height: 190,
                top: 35,
                left: 35,
                background: "radial-gradient(circle, rgba(200,160,80,0.1) 0%, transparent 60%)",
                border: "1px dashed rgba(180,140,60,0.12)",
              }}
            />
          </div>

          {/* ── Front edge (depth) ── */}
          <div
            className="absolute"
            style={{
              width: 260,
              height: 22,
              left: 10,
              top: 240,
              transformOrigin: "top left",
              transform: "rotateX(-90deg)",
              background: "linear-gradient(180deg, #dbb07a, #b8860b)",
              borderLeft: "2.5px solid #c49a5c",
              borderRight: "2.5px solid #c49a5c",
              borderBottom: "2.5px solid #a07030",
              borderRadius: "0 0 4px 4px",
            }}
          />

          {/* ── Right edge (depth) ── */}
          <div
            className="absolute"
            style={{
              width: 22,
              height: 260,
              left: 270,
              top: -20,
              transformOrigin: "top left",
              transform: "rotateY(90deg)",
              background: "linear-gradient(-90deg, #c49352, #dbb07a)",
              borderTop: "2.5px solid #c49a5c",
              borderBottom: "2.5px solid #c49a5c",
              borderRight: "2.5px solid #b8860b",
              borderRadius: "0 4px 4px 0",
            }}
          />

          {/* ── Lid (hinged at back) ── */}
          <motion.div
            className="absolute"
            style={{
              width: 260,
              height: 260,
              left: 10,
              top: -20,
              transformOrigin: "50% 0%",
              transformStyle: "preserve-3d",
              zIndex: phase === "box" ? 10 : 2,
            }}
            animate={{
              rotateX: phase === "box" ? 0 : 88,
            }}
            transition={{ duration: 1.0, ease: [0.32, 0.72, 0, 1] }}
          >
            {/* Lid face */}
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(135deg, #e8c99b 0%, #dbb07a 100%)",
                border: "2.5px solid #b8860b",
                borderRadius: 6,
                boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
                backfaceVisibility: "hidden",
              }}
            >
              <div className="flex items-center justify-center h-full">
                <motion.div
                  animate={phase === "box" ? { scale: [1, 1.04, 1] } : { scale: 0.6, opacity: 0 }}
                  transition={phase === "box" ? { duration: 2.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/assets/cheeznad.png"
                    alt=""
                    style={{ width: 140, height: 140, objectFit: "contain" }}
                    draggable={false}
                  />
                </motion.div>
              </div>
            </div>

            {/* Lid underside (visible when open) */}
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(135deg, #f5eadb, #ede0cc)",
                border: "2.5px solid #c49a5c",
                borderRadius: 6,
                transform: "rotateY(180deg)",
                backfaceVisibility: "hidden",
              }}
            />

            {/* Lid bottom edge thickness */}
            <div
              className="absolute"
              style={{
                width: 260,
                height: 5,
                bottom: 0,
                left: 0,
                background: "linear-gradient(180deg, #d4a574, #b8860b)",
                borderLeft: "2.5px solid #b8860b",
                borderRight: "2.5px solid #b8860b",
                borderBottom: "2px solid #a07030",
                transformOrigin: "bottom center",
                transform: "rotateX(-90deg)",
              }}
            />
          </motion.div>
        </motion.div>

        {/* ── Slices (positioned flat on top of the visual box) ── */}
        <div className="absolute inset-0" style={{ zIndex: 15 }}>
          {ZONE_LIST.map((zone, i) => {
            const popped = phase === "slices" || phase === "intros";
            const isActive = phase === "intros" && activeSlice === i;
            const isDone = phase === "intros" && activeSlice > i;
            const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
            const popDist = isActive ? 220 : popped ? 90 : 0;
            const popX = Math.round(Math.cos(ang) * popDist);
            const popY = Math.round(Math.sin(ang) * popDist * 0.55);

            return (
              <motion.div
                key={zone.id}
                className="absolute"
                style={{
                  left: "50%",
                  top: "45%",
                  marginLeft: -60,
                  marginTop: -60,
                  zIndex: isActive ? 30 : isDone ? 5 : 10,
                }}
                animate={{
                  x: popX,
                  y: popY - (isActive ? 50 : popped ? 5 : 0),
                  scale: isActive ? 1.8 : isDone ? 0.5 : popped ? 0.85 : 0.35,
                  opacity: isActive ? 1 : isDone ? 0.15 : popped ? 0.7 : 0,
                  rotate: isActive ? [0, -12, 12, -5, 0] : 0,
                }}
                transition={
                  isActive
                    ? { type: "spring", stiffness: 400, damping: 14, rotate: { duration: 0.35 } }
                    : { type: "spring", stiffness: 250, damping: 18, delay: popped && !isDone && !isActive ? i * 0.06 : 0 }
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={isActive ? zone.sliceImageHot : zone.sliceImage}
                  alt={zone.topping}
                  style={{
                    width: 120,
                    height: 120,
                    filter: isActive
                      ? `drop-shadow(0 12px 30px rgba(${zone.colorRgb}, 0.5))`
                      : "drop-shadow(0 4px 8px rgba(0,0,0,0.1))",
                  }}
                  draggable={false}
                />
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Talking slice speech bubble */}
      <div className="relative z-20 mt-6" style={{ height: 130 }}>
        <AnimatePresence mode="wait">
          {phase === "intros" && activeSlice >= 0 && activeSlice < ZONE_LIST.length && (
            <motion.div
              key={activeSlice}
              className="flex flex-col items-center text-center"
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.95 }}
              transition={{ duration: 0.25 }}
            >
              {/* Name */}
              <p
                className="text-2xl sm:text-3xl font-black"
                style={{
                  color: ZONE_LIST[activeSlice].color,
                  fontFamily: "var(--font-nunito), system-ui",
                }}
              >
                {ZONE_LIST[activeSlice].topping}
              </p>

              {/* Speech line */}
              <p
                className="text-base sm:text-lg font-bold mt-1"
                style={{ color: "#111" }}
              >
                &ldquo;{ZONE_INTROS[ZONE_LIST[activeSlice].id].line}&rdquo;
              </p>

              {/* Vibe/description */}
              <p
                className="text-xs mt-1"
                style={{ color: "rgba(0,0,0,0.35)" }}
              >
                {ZONE_INTROS[ZONE_LIST[activeSlice].id].vibe}
              </p>

              {/* Protocol tags */}
              <div className="flex gap-2 mt-3 justify-center flex-wrap">
                {ZONE_PROTOCOLS[ZONE_LIST[activeSlice].id].map((p, j) => (
                  <motion.span
                    key={p}
                    className="text-[11px] px-3 py-1 rounded-full font-semibold"
                    style={{
                      background: `rgba(${ZONE_LIST[activeSlice].colorRgb}, 0.1)`,
                      color: ZONE_LIST[activeSlice].color,
                      border: `1px solid rgba(${ZONE_LIST[activeSlice].colorRgb}, 0.2)`,
                    }}
                    initial={{ opacity: 0, scale: 0, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: 0.3 + j * 0.1, type: "spring", stiffness: 300, damping: 15 }}
                  >
                    {p}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Zone dots */}
      <motion.div
        className="flex items-center gap-2 z-10 mt-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "intros" ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      >
        {ZONE_LIST.map((zone, i) => (
          <motion.div
            key={zone.id}
            className="rounded-full"
            animate={{
              width: activeSlice === i ? 24 : 8,
              height: 8,
              background: activeSlice >= i ? zone.color : "rgba(0,0,0,0.1)",
            }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}

// ─── Scene 4: Pizza Picker (Interactive) ────────────────────────────────────────
function PizzaPickerScene({
  onSelect,
  engine,
}: {
  onSelect: (zone: Zone) => void;
  engine: SynthEngine;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const handlePick = (zone: Zone) => {
    if (picked) return;
    setPicked(zone.id);
    engine.chord([262, 330, 392, 523]);
    setTimeout(() => onSelect(zone), 1200);
  };

  return (
    <motion.div
      {...pageTransition}
      className="flex flex-col items-center justify-center h-full px-4 relative"
    >
      <FloatingPizzas count={8} seed={333} />

      {/* Title */}
      <motion.h2
        className="text-3xl sm:text-5xl font-black z-10 text-center mb-2"
        style={{ fontFamily: "var(--font-nunito), system-ui", color: "#111" }}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 15 }}
      >
        Pick your slice
      </motion.h2>

      <motion.p
        className="text-sm z-10 mb-8"
        style={{ color: "rgba(0,0,0,0.3)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        Which zone are you betting on?
      </motion.p>

      {/* Slice cards */}
      <div className="flex flex-wrap justify-center gap-4 z-10 max-w-2xl px-4">
        {ZONE_LIST.map((zone, i) => {
          const sel = picked === zone.id;
          const dim = picked !== null && !sel;
          const hov = hovered === zone.id && !picked;

          return (
            <motion.button
              key={zone.id}
              className="relative flex flex-col items-center rounded-2xl px-5 py-4 cursor-pointer border-2 transition-colors"
              style={{
                background: sel ? `rgba(${zone.colorRgb}, 0.08)` : "#fff",
                borderColor: sel ? zone.color : hov ? zone.color : "rgba(0,0,0,0.06)",
                boxShadow: sel
                  ? `0 8px 30px rgba(${zone.colorRgb}, 0.2), 0 2px 8px rgba(0,0,0,0.06)`
                  : hov
                  ? `0 6px 24px rgba(${zone.colorRgb}, 0.12), 0 2px 8px rgba(0,0,0,0.04)`
                  : "0 2px 8px rgba(0,0,0,0.04)",
                width: 130,
                outline: "none",
              }}
              initial={{ opacity: 0, y: 30, scale: 0.8 }}
              animate={{
                opacity: dim ? 0.35 : 1,
                y: 0,
                scale: sel ? 1.08 : dim ? 0.95 : 1,
              }}
              whileHover={!picked ? { scale: 1.06, y: -4 } : undefined}
              whileTap={!picked ? { scale: 0.97 } : undefined}
              transition={{
                delay: 0.2 + i * 0.08,
                type: "spring",
                stiffness: 250,
                damping: 18,
              }}
              onClick={() => handlePick(zone)}
              onMouseEnter={() => { if (!picked) { setHovered(zone.id); engine.blip(); } }}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Slice image */}
              <motion.div
                animate={sel ? { rotate: [0, -10, 10, -5, 0], scale: [1, 1.15, 1] } : {}}
                transition={{ duration: 0.5 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sel || hov ? zone.sliceImageHot : zone.sliceImage}
                  alt={zone.topping}
                  style={{
                    width: 64,
                    height: 64,
                    filter: sel
                      ? `drop-shadow(0 4px 12px rgba(${zone.colorRgb}, 0.4))`
                      : "drop-shadow(0 2px 4px rgba(0,0,0,0.1))",
                  }}
                  draggable={false}
                />
              </motion.div>

              {/* Name */}
              <p
                className="text-sm font-black mt-2"
                style={{ color: zone.color, fontFamily: "var(--font-nunito), system-ui" }}
              >
                {zone.topping}
              </p>

              {/* Category */}
              <p className="text-[10px] mt-0.5" style={{ color: "rgba(0,0,0,0.35)" }}>
                {zone.name}
              </p>

              {/* Selected check */}
              {sel && (
                <motion.div
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: zone.color }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 12 }}
                >
                  ✓
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Bottom hint */}
      <div className="z-10 mt-8">
        <AnimatePresence mode="wait">
          {picked ? (
            <motion.p
              key="confirm"
              className="text-sm font-bold tracking-widest uppercase"
              style={{ color: "rgba(0,0,0,0.5)" }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              Nice pick.
            </motion.p>
          ) : (
            <motion.p
              key="hint"
              className="text-[11px] tracking-wider"
              style={{ color: "rgba(0,0,0,0.2)" }}
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              TAP A SLICE TO CONTINUE
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Scene 5: How It Works ──────────────────────────────────────────────────────
function HowItWorksScene({ chosenZone, engine }: { chosenZone: Zone; engine: SynthEngine }) {
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    engine.pop(350);
    const t1 = setTimeout(() => { setBeat(1); engine.pop(440); }, 1200);
    const t2 = setTimeout(() => { setBeat(2); engine.pop(523); }, 2400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const beats = [
    {
      icon: chosenZone.toppingEmoji,
      image: chosenZone.sliceImage,
      text: "Pick your zone",
      sub: `You chose ${chosenZone.topping}`,
    },
    {
      icon: "💰",
      image: null,
      text: "Place your bet",
      sub: "Wager MON on your pick",
    },
    {
      icon: "🏆",
      image: null,
      text: "Win the pool",
      sub: "Highest on-chain activity wins",
    },
  ];

  return (
    <motion.div
      {...pageTransition}
      className="flex flex-col items-center justify-center h-full px-6 relative"
    >
      <FloatingPizzas count={10} seed={500} />

      <motion.p
        className="text-xs uppercase tracking-[0.4em] mb-3 z-10"
        style={{ color: "rgba(0,0,0,0.25)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        Chapter III
      </motion.p>

      <motion.p
        className="text-xs uppercase tracking-[0.3em] mb-10 z-10"
        style={{ color: "rgba(0,0,0,0.35)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        How it works 🍕
      </motion.p>

      <div className="flex flex-col items-center gap-8 z-10">
        {beats.map((b, i) => (
          <AnimatePresence key={i}>
            {beat >= i && (
              <motion.div
                className="flex items-center gap-5"
                initial={{ opacity: 0, x: -40, scale: 0.9 }}
                animate={{
                  opacity: beat === i ? 1 : 0.5,
                  x: 0,
                  scale: beat === i ? 1 : 0.9,
                }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                }}
              >
                <motion.div
                  animate={
                    beat === i
                      ? { scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }
                      : {}
                  }
                  transition={{
                    duration: 0.6,
                    repeat: beat === i ? Infinity : 0,
                    repeatDelay: 0.8,
                  }}
                >
                  {b.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={b.image} alt="" style={{ width: 48, height: 48 }} draggable={false} />
                  ) : (
                    <span className="text-4xl">{b.icon}</span>
                  )}
                </motion.div>
                <div>
                  <p
                    className="text-xl sm:text-2xl font-bold"
                    style={{
                      color:
                        beat === i
                          ? chosenZone.color
                          : "rgba(0,0,0,0.3)",
                    }}
                  >
                    {b.text}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(0,0,0,0.3)" }}>
                    {b.sub}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        ))}
      </div>

      {/* Slice decorations after beats */}
      <motion.div
        className="flex gap-3 mt-10 z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        transition={{ delay: 3 }}
      >
        {ZONE_LIST.slice(0, 3).map((zone, i) => (
          <motion.div
            key={zone.id}
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 1.5, delay: i * 0.3, repeat: Infinity }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zone.sliceImage} alt="" style={{ width: 28, height: 28 }} draggable={false} />
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}

// ─── Scene 6: Connect Wallet ────────────────────────────────────────────────────
function ConnectWalletScene({ onConnected, engine }: { onConnected: () => void; engine: SynthEngine }) {
  const { isConnected, address } = useAccount();
  const [celebrated, setCelebrated] = useState(false);

  useEffect(() => {
    if (isConnected && !celebrated) {
      setCelebrated(true);
      engine.arpeggio();
      const timer = setTimeout(() => onConnected(), 2000);
      return () => clearTimeout(timer);
    }
  }, [isConnected, celebrated, onConnected, engine]);

  return (
    <motion.div
      {...pageTransition}
      className="flex flex-col items-center justify-center h-full relative px-6"
    >
      <FloatingPizzas count={12} seed={777} />

      {/* Slice confetti on connect */}
      {celebrated && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
          {Array.from({ length: 25 }).map((_, i) => {
            const imgIdx = Math.floor(seededRandom(i * 73) * ZONE_LIST.length);
            return (
              <motion.div
                key={i}
                className="absolute"
                style={{
                  left: `${seededRandom(i * 47 + 3) * 100}%`,
                  top: -30,
                }}
                animate={{
                  y: [0, 1000],
                  rotate: [0, seededRandom(i * 31) * 720 - 360],
                  opacity: [1, 0.6, 0],
                }}
                transition={{
                  duration: seededRandom(i * 19) * 2 + 2,
                  delay: seededRandom(i * 11) * 1,
                  ease: "easeOut",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ZONE_LIST[imgIdx].sliceImage} alt="" style={{ width: 36, height: 36 }} draggable={false} />
              </motion.div>
            );
          })}
        </div>
      )}

      <motion.p
        className="text-xs uppercase tracking-[0.4em] mb-3 z-10"
        style={{ color: "rgba(0,0,0,0.25)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        Almost there
      </motion.p>

      {!isConnected ? (
        <>
          <motion.h2
            className="text-2xl sm:text-4xl font-black mb-3 text-center z-10"
            style={{ fontFamily: "var(--font-nunito), system-ui", color: "#111" }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            Connect to enter the kitchen 🍕
          </motion.h2>

          <motion.p
            className="text-sm mb-10 z-10"
            style={{ color: "rgba(0,0,0,0.3)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            You&apos;ll need a wallet to place bets
          </motion.p>

          <motion.div
            className="z-20"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, type: "spring", stiffness: 200, damping: 15 }}
          >
            <ConnectButton.Custom>
              {({
                openConnectModal,
                mounted,
              }) => {
                const ready = mounted;
                return (
                  <div
                    {...(!ready && {
                      "aria-hidden": true,
                      style: {
                        opacity: 0,
                        pointerEvents: "none" as const,
                        userSelect: "none" as const,
                      },
                    })}
                  >
                    <motion.button
                      onClick={openConnectModal}
                      className="relative px-10 py-4 rounded-2xl text-lg font-bold tracking-wider uppercase cursor-pointer"
                      style={{
                        background: "#111",
                        color: "white",
                        border: "2.5px solid #111",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                      }}
                      whileHover={{ scale: 1.06, boxShadow: "0 6px 30px rgba(0,0,0,0.2)" }}
                      whileTap={{ scale: 0.96 }}
                    >
                      🍕 Connect Wallet 🍕
                    </motion.button>
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </motion.div>

          <motion.p
            className="mt-8 text-[10px] tracking-widest uppercase z-10"
            style={{ color: "rgba(0,0,0,0.15)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
          >
            Monad Testnet
          </motion.p>
        </>
      ) : (
        <>
          <motion.h2
            className="text-2xl sm:text-4xl font-black mb-4 text-center z-10"
            style={{ fontFamily: "var(--font-nunito), system-ui", color: "#111" }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
          >
            Welcome, chef! 🍕
          </motion.h2>

          <motion.div
            className="px-6 py-3 rounded-2xl z-10 flex items-center gap-3"
            style={{
              background: "#fff",
              border: "2.5px solid #111",
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <span className="text-2xl">🍕</span>
            <span className="text-sm font-mono" style={{ color: "rgba(0,0,0,0.5)" }}>
              {address
                ? `${address.slice(0, 6)}...${address.slice(-4)}`
                : ""}
            </span>
          </motion.div>

          <motion.p
            className="text-sm mt-4 z-10"
            style={{ color: "rgba(0,0,0,0.3)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            Wallet connected! Taking you to the kitchen...
          </motion.p>
        </>
      )}
    </motion.div>
  );
}

// ─── Scene 7: Launch CTA ────────────────────────────────────────────────────────
function LaunchCtaScene({ chosenZone, engine }: { chosenZone: Zone; engine: SynthEngine }) {
  const router = useRouter();

  const enter = useCallback(() => {
    router.push("/");
  }, [router]);

  useEffect(() => {
    engine.chord([262, 330, 392, 523, 659]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") enter();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enter]);

  const particles = useMemo(
    () =>
      Array.from({ length: 20 }).map((_, i) => ({
        x: (seededRandom(i * 47 + 1) - 0.5) * 600,
        y: (seededRandom(i * 53 + 2) - 0.5) * 600,
        size: seededRandom(i * 59 + 3) * 6 + 2,
        delay: seededRandom(i * 61 + 4) * 2,
        duration: seededRandom(i * 67 + 5) * 3 + 3,
        color:
          i % 5 === 0
            ? chosenZone.color
            : ZONE_LIST[i % ZONE_LIST.length].color,
      })),
    [chosenZone.color]
  );

  return (
    <motion.div
      {...pageTransition}
      className="flex flex-col items-center justify-center h-full relative overflow-hidden"
    >
      <PizzaRain count={25} />
      <FloatingPizzas count={16} seed={999} />

      {/* Colored particles */}
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full z-0"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            left: "50%",
            top: "50%",
            opacity: 0,
          }}
          animate={{
            x: [0, p.x],
            y: [0, p.y],
            opacity: [0, 0.4, 0],
            scale: [0, 1.5, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}

      {/* Logo */}
      <motion.div
        className="z-10 mb-4"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 15 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/cheeznad.png"
          alt="Cheeznad"
          style={{ width: 220, height: 220, objectFit: "contain" }}
          draggable={false}
        />
      </motion.div>

      <motion.p
        className="text-lg sm:text-xl font-medium mb-8 tracking-wide z-10"
        style={{ color: "rgba(0,0,0,0.5)" }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        🍕 The oven is hot. 🍕
      </motion.p>

      {/* Chosen zone slice image */}
      <motion.div
        className="z-10 mb-6"
        initial={{ opacity: 0, rotate: -30 }}
        animate={{ opacity: 1, rotate: 0 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 15 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={chosenZone.sliceImageHot}
          alt={chosenZone.topping}
          style={{ width: 80, height: 80 }}
          draggable={false}
        />
      </motion.div>

      <motion.button
        onClick={enter}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          delay: 0.5,
          type: "spring",
          stiffness: 200,
          damping: 15,
        }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
        className="relative px-10 py-5 rounded-2xl text-xl font-black tracking-wider uppercase cursor-pointer z-10"
        style={{
          background: chosenZone.color,
          color: "white",
          border: "2.5px solid #111",
          fontFamily: "var(--font-nunito), system-ui",
          boxShadow: `0 4px 20px rgba(${chosenZone.colorRgb}, 0.3)`,
        }}
      >
        🍕 Enter the Kitchen 🍕
      </motion.button>

      <motion.p
        className="mt-6 text-[10px] tracking-widest uppercase z-10"
        style={{ color: "rgba(0,0,0,0.2)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        or press Enter
      </motion.p>

      {/* Giant background slice */}
      <motion.div
        className="absolute z-0 select-none"
        style={{ opacity: 0.05 }}
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/mushroom.png" alt="" style={{ width: 450, height: 450 }} draggable={false} />
      </motion.div>
    </motion.div>
  );
}

// ─── Main Start Page ────────────────────────────────────────────────────────────
export default function StartPage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const engine = useSynthBeats();
  const [sceneIndex, setSceneIndex] = useState(0);
  const [chosenZone, setChosenZone] = useState<Zone>(ZONE_LIST[0]);
  const [pickerDone, setPickerDone] = useState(false);
  const [walletDone, setWalletDone] = useState(false);
  const [muted, setMuted] = useState(false);

  const scene = SCENES[sceneIndex];

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      engine.setMuted(!m);
      return !m;
    });
  }, [engine]);

  const canAdvance = useCallback(() => {
    if (scene === "pizzaPicker" && !pickerDone) return false;
    if (scene === "connectWallet" && !walletDone) return false;
    return sceneIndex < SCENES.length - 1;
  }, [scene, sceneIndex, pickerDone, walletDone]);

  const canGoBack = sceneIndex > 0;

  const advance = useCallback(() => {
    engine.kick();
    setSceneIndex((prev) => Math.min(prev + 1, SCENES.length - 1));
  }, [engine]);

  const goBack = useCallback(() => {
    engine.kick();
    setSceneIndex((prev) => Math.max(prev - 1, 0));
  }, [engine]);

  // Auto-advance for timed scenes
  useEffect(() => {
    const duration = SCENE_DURATIONS[scene];
    if (duration === null) return;
    const timer = setTimeout(advance, duration);
    return () => clearTimeout(timer);
  }, [scene, advance]);

  // Arrow key navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && canAdvance()) {
        e.preventDefault();
        advance();
      }
      if (e.key === "ArrowLeft" && canGoBack) {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canAdvance, canGoBack, advance, goBack]);

  const handleZoneSelect = useCallback(
    (zone: Zone) => {
      setChosenZone(zone);
      setPickerDone(true);
      advance();
    },
    [advance]
  );

  const handleWalletConnected = useCallback(() => {
    setWalletDone(true);
    advance();
  }, [advance]);

  const handleSkip = () => {
    router.push("/");
  };

  // If wallet already connected when reaching that scene, auto-advance
  useEffect(() => {
    if (scene === "connectWallet" && isConnected) {
      setWalletDone(true);
      const timer = setTimeout(advance, 1500);
      return () => clearTimeout(timer);
    }
  }, [scene, isConnected, advance]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden"
      style={{ background: "#f4f3ee" }}
    >
      {/* Skip button */}
      <motion.button
        onClick={handleSkip}
        className="absolute top-5 right-6 z-50 text-[11px] uppercase tracking-[0.2em] transition-colors cursor-pointer flex items-center gap-1.5"
        style={{ color: "rgba(0,0,0,0.2)" }}
        whileHover={{ color: "rgba(0,0,0,0.5)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
      >
        Skip 🍕
      </motion.button>

      {/* Scene counter + mute toggle */}
      <div className="absolute top-5 left-6 z-50 flex items-center gap-3">
        <motion.div
          className="text-[10px] uppercase tracking-widest font-mono"
          style={{ color: "rgba(0,0,0,0.15)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          {sceneIndex + 1}/{SCENES.length}
        </motion.div>
        <motion.button
          onClick={toggleMute}
          className="text-sm cursor-pointer"
          style={{ color: "rgba(0,0,0,0.25)" }}
          whileHover={{ color: "rgba(0,0,0,0.5)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? "🔇" : "🔊"}
        </motion.button>
      </div>

      {/* Screen content */}
      <div className="flex-1 relative">
        <AnimatePresence mode="wait">
          {scene === "titleDrop" && <TitleDropScene key="titleDrop" engine={engine} />}
          {scene === "theHook" && <TheHookScene key="theHook" engine={engine} />}
          {scene === "zonesReveal" && <ZonesRevealScene key="zonesReveal" engine={engine} />}
          {scene === "pizzaPicker" && (
            <PizzaPickerScene key="pizzaPicker" onSelect={handleZoneSelect} engine={engine} />
          )}
          {scene === "howItWorks" && (
            <HowItWorksScene key="howItWorks" chosenZone={chosenZone} engine={engine} />
          )}
          {scene === "connectWallet" && (
            <ConnectWalletScene
              key="connectWallet"
              onConnected={handleWalletConnected}
              engine={engine}
            />
          )}
          {scene === "launchCta" && (
            <LaunchCtaScene key="launchCta" chosenZone={chosenZone} engine={engine} />
          )}
        </AnimatePresence>
      </div>

      {/* Navigation hint */}
      <NavHint canGoBack={canGoBack} canGoForward={canAdvance()} />

      {/* Progress bar */}
      <ProgressBar sceneIndex={sceneIndex} total={SCENES.length} />
    </div>
  );
}
