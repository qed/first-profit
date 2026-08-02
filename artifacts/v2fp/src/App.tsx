import React, { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { GameProvider, useGame } from './state/GameContext';
import { Onboarding } from './components/Onboarding';
import { Hud } from './components/Hud';
import { FactoryFloor } from './components/FactoryFloor';
import { NextStepCoach } from './components/NextStepCoach';
import { StepRunner } from './components/StepRunner';
import { RoomShell } from './components/RoomShell';
import { IdeaPanel } from './components/rooms/IdeaPanel';
import { MarketPanel } from './components/rooms/MarketPanel';
import { BuildPanel } from './components/rooms/BuildPanel';
import { WebsitePanel } from './components/rooms/WebsitePanel';
import { CheckoutPanel } from './components/rooms/CheckoutPanel';
import { ProductPanel } from './components/rooms/ProductPanel';
import { WorkshopPanel } from './components/rooms/WorkshopPanel';
import { CommandPanel } from './components/rooms/CommandPanel';
import type { RoomId } from './data/path';

const PANELS: Record<RoomId, React.ComponentType> = {
  idea: IdeaPanel,
  market: MarketPanel,
  build: BuildPanel,
  website: WebsitePanel,
  checkout: CheckoutPanel,
  product: ProductPanel,
  workshop: WorkshopPanel,
  command: CommandPanel
};

function Factory() {
  const { onboarded, activeRoom, openRoom, nextUp, justUnlocked, clearUnlocks } = useGame();
  const [walkTo, setWalkTo] = useState<RoomId | null>(null);
  const [openOnArrive, setOpenOnArrive] = useState(true);
  const [runnerOpen, setRunnerOpen] = useState(false);

  useEffect(() => {
    if (!justUnlocked.length) return;
    const id = window.setTimeout(clearUnlocks, 6000);
    return () => window.clearTimeout(id);
  }, [justUnlocked, clearUnlocks]);

  if (!onboarded) return <Onboarding />;

  const Panel = activeRoom ? PANELS[activeRoom] : null;

  const arrive = (room: RoomId) => {
    if (openOnArrive) openRoom(room);
    setWalkTo(null);
  };

  const startNextStep = () => {
    setOpenOnArrive(false);
    setWalkTo(nextUp?.step.room ?? null);
    setRunnerOpen(true);
  };

  const openFromRunner = (room: RoomId) => {
    setRunnerOpen(false);
    setOpenOnArrive(true);
    openRoom(room);
  };

  return (
    <main className="flex h-full min-h-screen w-full flex-col gap-4 bg-paper p-4 sm:p-6">
      <Hud />
      <div className="min-h-[34rem] flex-1">
        <FactoryFloor
          walkTo={walkTo}
          onArrived={(room) => {
            arrive(room);
            setOpenOnArrive(true);
          }} />
        
      </div>

      <NextStepCoach onGo={startNextStep} />

      <AnimatePresence>
        {runnerOpen ?
        <StepRunner onClose={() => setRunnerOpen(false)} onOpenRoom={openFromRunner} /> :
        null}
      </AnimatePresence>

      <AnimatePresence>
        {Panel && activeRoom ?
        <RoomShell roomId={activeRoom} onClose={() => openRoom(null)}>
            <Panel />
          </RoomShell> :
        null}
      </AnimatePresence>
    </main>);

}

export function App() {
  return (
    <GameProvider>
      <Factory />
    </GameProvider>);

}