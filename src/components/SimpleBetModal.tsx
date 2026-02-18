"use client";

import { useState, useCallback, useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { parseEther } from "viem";
import { useGameStore } from "@/store/useGameStore";
import { ZONES } from "@/lib/zones";
import { CHEEZNAD_ADDRESS, cheeznadAbi, ZONE_TO_ENUM } from "@/lib/cheeznadAbi";
import type { ZoneId } from "@/types";

interface SimpleBetModalProps {
  isOpen: boolean;
  onClose: () => void;
  zoneId: ZoneId | null;
}

export default function SimpleBetModal({ isOpen, onClose, zoneId }: SimpleBetModalProps) {
  const isResolving = useGameStore((s) => s.isResolving);
  const zoneActivity = useGameStore((s) => zoneId ? s.zones[zoneId] : null);
  const [amount, setAmount] = useState("0.5");

  const { isConnected } = useAccount();

  const {
    writeContract,
    data: txHash,
    isPending: isSending,
    reset: resetTx,
    error: writeError,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  const zone = zoneId ? ZONES[zoneId] : null;
  const amtNum = parseFloat(amount) || 0;
  const multiplier = zoneActivity?.multiplier ?? 1.0;

  useEffect(() => {
    if (isConfirmed) {
      const timer = setTimeout(() => {
        onClose();
        resetTx();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isConfirmed, onClose, resetTx]);

  useEffect(() => {
    if (!isOpen) {
      resetTx();
    }
  }, [isOpen, resetTx]);

  const handlePlaceBet = useCallback(() => {
    if (isResolving || amtNum <= 0 || !zoneId || !isConnected) return;
    writeContract({
      address: CHEEZNAD_ADDRESS,
      abi: cheeznadAbi,
      functionName: "deposit",
      args: [ZONE_TO_ENUM[zoneId]],
      value: parseEther(amount),
    });
  }, [isResolving, amtNum, zoneId, isConnected, writeContract, amount]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!zone) return null;

  return (
    <div className={`modal-overlay${isOpen ? " open" : ""}`} onClick={handleOverlayClick}>
      <div className="simple-modal">
        <button className="modal-close" onClick={onClose}>✕</button>

        <div className="simple-modal-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="simple-modal-img" src={zone.sliceImageHot} alt={zone.displayName} />
          <div>
            <div className="simple-modal-zone">{zone.name}</div>
            <div className="simple-modal-topping" style={{ textTransform: "capitalize" }}>{zone.displayName}</div>
          </div>
        </div>

        <div className="simple-modal-multiplier">
          <div className="simple-modal-mult-row">
            <span className="simple-modal-mult-label">Round multiplier</span>
            <span className={`simple-modal-mult-value${multiplier >= 2.0 ? " high" : multiplier >= 1.5 ? " boosted" : ""}`}>
              {multiplier.toFixed(1)}x
            </span>
          </div>
          <div className="simple-modal-mult-explain">
            {multiplier >= 2.0
              ? "Underdog boost — each txn here counts extra toward winning!"
              : multiplier >= 1.5
                ? "This category has a slight edge this round."
                : multiplier < 1.0
                  ? "Popular pick — each txn counts for less toward winning."
                  : "Standard weight this round."}
          </div>
        </div>

        <div className="simple-modal-input-row">
          <div className="modal-input-wrap">
            <span>◆</span>
            <input
              type="number"
              className="modal-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              min="0"
              step="0.1"
            />
          </div>
          <button
            className="modal-buy"
            onClick={handlePlaceBet}
            disabled={isResolving || amtNum <= 0 || !isConnected || isSending || isConfirming}
          >
            {!isConnected
              ? "Connect Wallet"
              : isSending
              ? "Confirm in Wallet..."
              : isConfirming
              ? "Confirming..."
              : isConfirmed
              ? "Deposited!"
              : "Buy In"}
          </button>
        </div>

        {writeError && (
          <div className="modal-error" style={{ color: "#ef4444", fontSize: "0.8rem", textAlign: "center", marginTop: "0.5rem" }}>
            {writeError.message.includes("User rejected")
              ? "Transaction rejected"
              : writeError.message.includes("Betting window")
              ? "Betting window is closed"
              : "Transaction failed"}
          </div>
        )}

        <div className="quick-row">
          <button className="quick-btn" onClick={() => setAmount("0.1")}>0.1</button>
          <button className="quick-btn" onClick={() => setAmount("0.5")}>0.5</button>
          <button className="quick-btn" onClick={() => setAmount("1")}>1</button>
          <button className="quick-btn" onClick={() => setAmount("5")}>5</button>
        </div>

        <div className="modal-footer">Settled on-chain · No fees · Instant payout</div>
      </div>
    </div>
  );
}
