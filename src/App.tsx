import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRightIcon } from 'lucide-react';
import { GameProvider, useGame } from './state/GameContext';
import { Hud } from './components/Hud';
import { FactoryFloor } from './components/FactoryFloor';
import { NextStepCoach } from './components/NextStepCoach';
import { RoomShell } from './components/RoomShell';
import { IdeaPanel } from './components/rooms/IdeaPanel';
import { MarketPanel } from './components/rooms/MarketPanel';
import { BuildPanel } from './components/rooms/BuildPanel';
import { WebsitePanel } from './components/rooms/WebsitePanel';
import { CheckoutPanel } from './components/rooms/CheckoutPanel';
import { ProductPanel } from './components/rooms/ProductPanel';
import { WorkshopPanel } from './components/rooms/WorkshopPanel';
import { CommandPanel } from './components/rooms/CommandPanel';
import { PHASES, type RoomId } from './data/path';

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
  const { activeRoom, openRoom } = useGame();
  const [walkTo, setWalkTo] = useState<RoomId | null>(null);
  const [intro, setIntro] = useState(true);
  const Panel = activeRoom ? PANELS[activeRoom] : null;

  const arrive = (room: RoomId) => {
    openRoom(room);
    setWalkTo(null);
  };

  return (
    <main className="flex h-full min-h-screen w-full flex-col gap-4 bg-paper p-4 sm:p-6">
      <Hud />
      <div className="min-h-[34rem] flex-1">
        <FactoryFloor walkTo={walkTo} onArrived={arrive} />
      </div>

      <NextStepCoach onGo={(room) => setWalkTo(room as RoomId)} />

      <AnimatePresence>
        {Panel && activeRoom ?
        <RoomShell roomId={activeRoom} onClose={() => openRoom(null)}>
            <Panel />
          </RoomShell> :
        null}
      </AnimatePresence>

      <AnimatePresence>
        {intro ?
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}>
          
            <motion.div
            initial={{ y: 18, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            className="w-full max-w-lg rounded-3xl border-2 border-ink/15 bg-parchment p-7 shadow-pod">
            
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ember">
                First Profit · Home Study
              </p>
              <h1 className="mt-2 font-display text-3xl font-black leading-tight">
                Welcome to the factory floor.
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-graphite">
                You are the founder. Walk your avatar into any pod to work on a real part of your
                business — the idea, the selling, the build, the website, the checkout, the
                delivery, the numbers. Twenty-five pass criteria stand between you and your first
                $1,000.
              </p>
              <ol className="mt-4 grid grid-cols-5 gap-1.5">
                {PHASES.map((phase) =>
              <li key={phase.id} className="text-center">
                    <span
                  className="block rounded-lg py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white"
                  style={{ backgroundColor: phase.color }}>
                  
                      {phase.name}
                    </span>
                  </li>
              )}
              </ol>
              <p className="mt-4 rounded-xl bg-go/10 px-3.5 py-3 text-xs leading-relaxed text-go">
                Stuck? Hit the big green <strong>Next Step</strong> button. It walks you to the
                right pod and tells you exactly what to do next.
              </p>
              <button
              type="button"
              onClick={() => setIntro(false)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-4 font-display text-lg font-bold text-paper hover:bg-graphite">
              
                Start The Path <ArrowRightIcon className="h-5 w-5" />
              </button>
            </motion.div>
          </motion.div> :
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