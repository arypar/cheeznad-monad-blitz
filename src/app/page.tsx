"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, LayoutGroup } from "framer-motion";
import { useLiveFeed } from "@/hooks/useLiveFeed";
import { useGameStore } from "@/store/useGameStore";
import { ZONE_LIST } from "@/lib/zones";
import CheesyNav from "@/components/CheesyNav";
import ZoneRow from "@/components/ZoneRow";
import BottomRow from "@/components/BottomRow";
import PastWinners from "@/components/PastWinners";
import SimpleBetModal from "@/components/SimpleBetModal";
import WinCelebration from "@/components/WinCelebration";
import type { ZoneId } from "@/types";

export default function Home() {
  useLiveFeed();

  const zones = useGameStore((s) => s.zones);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedZone, setSelectedZone] = useState<ZoneId | null>(null);

  const openModal = useCallback((zoneId?: string) => {
    if (zoneId) {
      setSelectedZone(zoneId as ZoneId);
    }
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSelectedZone(null);
  }, []);

  // Sort zones by weighted score descending (leaderboard)
  const sortedZones = useMemo(() => {
    return [...ZONE_LIST].sort((a, b) => {
      const diff =
        (zones[b.id]?.weightedScore ?? 0) - (zones[a.id]?.weightedScore ?? 0);
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });
  }, [zones]);

  return (
    <div className="page">
      <CheesyNav />
      <BottomRow />

      <div className="zones-card">
        <LayoutGroup>
          {sortedZones.map((zone, idx) => (
            <motion.div
              key={zone.id}
              layout
              transition={{
                layout: {
                  type: "spring",
                  damping: 25,
                  stiffness: 200,
                },
              }}
            >
              <ZoneRow
                zone={zone}
                activity={zones[zone.id]}
                onOpenModal={openModal}
                rank={idx + 1}
              />
            </motion.div>
          ))}
        </LayoutGroup>
      </div>

      <PastWinners />

      <SimpleBetModal
        isOpen={modalOpen}
        onClose={closeModal}
        zoneId={selectedZone}
      />
      <WinCelebration />
    </div>
  );
}
