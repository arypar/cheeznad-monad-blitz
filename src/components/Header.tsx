"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useGameStore } from "@/store/useGameStore";
import { ZONES } from "@/lib/zones";

export default function Header() {
  const totalPool = useGameStore((s) => s.totalPool);
  const roundEndTime = useGameStore((s) => s.roundEndTime);
  const roundId = useGameStore((s) => s.roundId);
  const transactions = useGameStore((s) => s.transactions);
  const isResolving = useGameStore((s) => s.isResolving);
  const lastWinner = useGameStore((s) => s.lastWinner);
  const [timeLeft, setTimeLeft] = useState(60);

  useEffect(() => {
    const interval = setInterval(() => {
      if (roundEndTime <= 0) {
        setTimeLeft(0);
        return;
      }
      const diff = Math.max(0, roundEndTime - Date.now());
      setTimeLeft(Math.ceil(diff / 1000));
    }, 100);
    return () => clearInterval(interval);
  }, [roundEndTime]);

  const timerUrgent = timeLeft <= 15;
  const timerCritical = timeLeft <= 5;
  const winnerZone = lastWinner ? ZONES[lastWinner] : null;

  return (
    <header className="card-panel relative overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3.5">
        {/* Logo */}
        <div className="flex items-center gap-3 min-w-[160px]">
          <motion.div
            className="text-3xl"
            animate={
              isResolving
                ? { rotate: [0, 360], scale: [1, 1.4, 1] }
                : timerCritical
                ? { scale: [1, 1.15, 1], rotate: [0, -5, 5, 0] }
                : { rotate: [0, 5, -5, 0] }
            }
            transition={
              isResolving
                ? { duration: 0.6, repeat: Infinity }
                : timerCritical
                ? { duration: 0.3, repeat: Infinity }
                : { duration: 2, repeat: Infinity, repeatDelay: 3 }
            }
          >
            🍕
          </motion.div>
          <div>
            <h1 className="text-lg font-extrabold tracking-widest leading-tight text-gray-900">
              PIZZA WARS
            </h1>
            <p className="text-[9px] text-gray-400 uppercase tracking-[0.25em] font-medium">
              Monad Prediction Market
            </p>
          </div>
        </div>

        {/* Center: Pool as hero, flanked by round info & timer */}
        <div className="flex items-center gap-2">
          {/* Round chip */}
          <div className="flex flex-col items-center px-3 py-1 rounded-lg bg-gray-50 border border-gray-200">
            <span className="text-[9px] text-gray-400 uppercase tracking-wider font-medium">Round</span>
            <span className="font-numbers text-sm font-bold text-gray-800">
              {roundId > 0 ? `#${roundId}` : "—"}
            </span>
          </div>

          {/* Timer chip */}
          <div
            className="flex flex-col items-center px-3 py-1 rounded-lg min-w-[90px]"
            style={{
              background: timerCritical
                ? "rgba(230, 57, 70, 0.08)"
                : timerUrgent
                ? "rgba(212, 160, 23, 0.08)"
                : "#F9FAFB",
              border: timerCritical
                ? "1px solid rgba(230, 57, 70, 0.3)"
                : timerUrgent
                ? "1px solid rgba(212, 160, 23, 0.3)"
                : "1px solid #E5E7EB",
            }}
          >
            <AnimatePresence mode="wait">
              {isResolving ? (
                <motion.div
                  key="resolving"
                  initial={{ opacity: 0, scale: 0.5, rotateX: 90 }}
                  animate={{ opacity: 1, scale: 1, rotateX: 0 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="flex flex-col items-center"
                >
                  <motion.span
                    className="text-[9px] uppercase tracking-wider font-bold"
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                    style={{ color: winnerZone?.color }}
                  >
                    WINNER
                  </motion.span>
                  <span className="text-sm font-bold flex items-center gap-1" style={{ color: winnerZone?.color }}>
                    {winnerZone?.toppingEmoji} {winnerZone?.name}
                  </span>
                </motion.div>
              ) : roundEndTime > 0 ? (
                <motion.div
                  key="timer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center"
                >
                  <span
                    className="text-[9px] uppercase tracking-wider font-semibold"
                    style={{
                      color: timerCritical ? "#E63946" : timerUrgent ? "#D4A017" : "#9CA3AF",
                    }}
                  >
                    {timerCritical ? "LAST CALL" : timerUrgent ? "CLOSING SOON" : "Resolves In"}
                  </span>
                  <motion.span
                    key={timeLeft}
                    initial={timerCritical ? { scale: 1.5 } : { y: 6, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    className="font-numbers text-xl font-bold leading-tight"
                    style={{
                      color: timerCritical ? "#E63946" : timerUrgent ? "#D4A017" : "#1a1a1a",
                    }}
                  >
                    0:{timeLeft.toString().padStart(2, "0")}
                  </motion.span>
                </motion.div>
              ) : (
                <motion.div
                  key="waiting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center"
                >
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-gray-400">
                    Connecting
                  </span>
                  <span className="font-numbers text-xl font-bold leading-tight text-gray-300">
                    —:——
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Pool - HERO ELEMENT */}
          <div className="relative mx-2">
            <div
              className="flex flex-col items-center px-6 py-2 rounded-xl"
              style={{
                background: "rgba(184, 134, 11, 0.06)",
                border: "1px solid rgba(184, 134, 11, 0.2)",
              }}
            >
              <span className="text-[9px] uppercase tracking-[0.2em] font-semibold text-amber-600/60">
                Total Pool
              </span>
              <div className="flex items-baseline gap-1.5">
                <motion.span
                  key={Math.floor(totalPool)}
                  initial={{ scale: 1.2, y: -2 }}
                  animate={{ scale: 1, y: 0 }}
                  className="font-numbers text-3xl font-extrabold leading-none"
                  style={{ color: "#B8860B" }}
                >
                  {totalPool.toFixed(1)}
                </motion.span>
                <span className="text-sm font-bold uppercase tracking-wider text-amber-700/70">
                  MON
                </span>
              </div>
            </div>
          </div>

          {/* Bets chip */}
          <div className="flex flex-col items-center px-3 py-1 rounded-lg bg-gray-50 border border-gray-200">
            <span className="text-[9px] text-gray-400 uppercase tracking-wider font-medium">Bets</span>
            <motion.span
              key={transactions.length}
              initial={{ scale: 1.3 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5 }}
              className="font-numbers text-sm font-bold text-gray-800"
            >
              {transactions.length}
            </motion.span>
          </div>
        </div>

        {/* Wallet */}
        <div className="min-w-[160px] flex justify-end">
          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
              const ready = mounted;
              const connected = ready && account && chain;

              return (
                <div
                  {...(!ready && {
                    "aria-hidden": true,
                    style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
                  })}
                >
                  {(() => {
                    if (!connected) {
                      return (
                        <motion.button
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.96 }}
                          onClick={openConnectModal}
                          className="relative px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider"
                          style={{
                            background: "#836EF9",
                            border: "1px solid rgba(131, 110, 249, 0.4)",
                            boxShadow: "0 2px 8px rgba(131, 110, 249, 0.25)",
                            color: "white",
                          }}
                        >
                          Connect Wallet
                        </motion.button>
                      );
                    }

                    if (chain.unsupported) {
                      return (
                        <motion.button
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.96 }}
                          onClick={openChainModal}
                          className="relative px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider"
                          style={{
                            background: "rgba(230, 57, 70, 0.08)",
                            border: "1px solid rgba(230, 57, 70, 0.3)",
                            color: "#E63946",
                          }}
                        >
                          Wrong Network
                        </motion.button>
                      );
                    }

                    return (
                      <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={openAccountModal}
                        className="relative px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider"
                        style={{
                          background: "rgba(45, 155, 45, 0.08)",
                          border: "1px solid rgba(45, 155, 45, 0.3)",
                          color: "#2D9B2D",
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-green-500 rounded-full" />
                          {account.displayName}
                        </span>
                      </motion.button>
                    );
                  })()}
                </div>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </div>
    </header>
  );
}
