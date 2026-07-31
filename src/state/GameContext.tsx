import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState } from
'react';
import {
  PHASES,
  STEPS,
  parseTask,
  phaseById,
  type ArtifactKey,
  type PhaseId,
  type RoomId,
  type Step } from
'../data/path';
import { ROOMS } from '../data/rooms';
import { WORKSHOPS } from '../data/workshops';

export interface Sale {
  id: string;
  customer: string;
  product: string;
  amount: number;
  day: string;
}

export interface Company {
  founder: string;
  name: string;
  product: string;
  price: number;
  cost: number;
  headline: string;
  cta: string;
  colorway: 'ember' | 'ocean' | 'moss' | 'plum';
  delivery: 'email' | 'download' | 'handoff';
  deliveryNote: string;
}

interface GameState {
  company: Company;
  fields: Record<string, string>;
  tasksDone: Record<string, boolean>;
  artifacts: Record<ArtifactKey, boolean>;
  workshopsDone: string[];
  sales: Sale[];
  xp: number;
  outreach: number;
  contacts: number;
  nos: {reason: string;lesson: string;}[];
  weeks: {revenue: number;costs: number;}[];
}

interface GameApi extends GameState {
  toggleTask: (stepId: string, index: number) => void;
  setField: (key: string, value: string) => void;
  updateCompany: (patch: Partial<Company>) => void;
  buildArtifact: (key: ArtifactKey) => void;
  completeWorkshop: (id: string) => void;
  addSale: (sale: Omit<Sale, 'id'>) => void;
  logNo: (reason: string, lesson: string) => void;
  bumpOutreach: (n: number) => void;
  bumpContacts: (n: number) => void;
  addWeek: (revenue: number, costs: number) => void;
  isTaskDone: (stepId: string, index: number) => boolean;
  isStepDone: (stepId: string) => boolean;
  stepProgress: (stepId: string) => {done: number;total: number;};
  nextStep: Step | undefined;
  currentPhase: PhaseId;
  phaseProgress: (phase: PhaseId) => {done: number;total: number;};
  roomProgress: (room: RoomId) => {done: number;total: number;};
  isRoomUnlocked: (room: RoomId) => boolean;
  revenue: number;
  profit: number;
  activeRoom: RoomId | null;
  openRoom: (room: RoomId | null) => void;
  guideOn: boolean;
  setGuideOn: (v: boolean) => void;
}

const GameContext = createContext<GameApi | null>(null);

const initialCompany: Company = {
  founder: 'Robin',
  name: 'Loop & Lace',
  product: 'Team-colour friendship bracelet',
  price: 12,
  cost: 3.5,
  headline: 'Bracelets your whole team will actually wear.',
  cta: 'Order yours',
  colorway: 'ember',
  delivery: 'handoff',
  deliveryNote: 'Hand-delivered at Saturday practice, in a kraft envelope with a thank-you card.'
};

const taskKey = (stepId: string, index: number) => `${stepId}#${index}`;

export function GameProvider({ children }: {children: React.ReactNode;}) {
  const [company, setCompany] = useState<Company>(initialCompany);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [tasksDone, setTasksDone] = useState<Record<string, boolean>>({});
  const [artifacts, setArtifacts] = useState<Record<ArtifactKey, boolean>>({
    website: false,
    checkout: false,
    delivery: false,
    ledger: false
  });
  const [workshopsDone, setWorkshopsDone] = useState<string[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [nos, setNos] = useState<{reason: string;lesson: string;}[]>([]);
  const [outreach, setOutreach] = useState(0);
  const [contacts, setContacts] = useState(0);
  const [weeks, setWeeks] = useState<{revenue: number;costs: number;}[]>([]);
  const [activeRoom, setActiveRoom] = useState<RoomId | null>(null);
  const [guideOn, setGuideOn] = useState(true);

  const isTaskDone = useCallback(
    (stepId: string, index: number) => {
      const step = STEPS.find((s) => s.id === stepId);
      const raw = step?.tasks[index];
      if (raw) {
        const { auto } = parseTask(raw);
        if (auto && artifacts[auto]) return true;
      }
      return Boolean(tasksDone[taskKey(stepId, index)]);
    },
    [tasksDone, artifacts]
  );

  const isStepDone = useCallback(
    (stepId: string) => {
      const step = STEPS.find((s) => s.id === stepId);
      if (!step) return false;
      return step.tasks.every((_, i) => isTaskDone(stepId, i));
    },
    [isTaskDone]
  );

  const stepProgress = useCallback(
    (stepId: string) => {
      const step = STEPS.find((s) => s.id === stepId);
      if (!step) return { done: 0, total: 0 };
      const done = step.tasks.filter((_, i) => isTaskDone(stepId, i)).length;
      return { done, total: step.tasks.length };
    },
    [isTaskDone]
  );

  const toggleTask = useCallback((stepId: string, index: number) => {
    setTasksDone((prev) => ({
      ...prev,
      [taskKey(stepId, index)]: !prev[taskKey(stepId, index)]
    }));
  }, []);

  const setField = useCallback((key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateCompany = useCallback((patch: Partial<Company>) => {
    setCompany((prev) => ({ ...prev, ...patch }));
  }, []);

  const buildArtifact = useCallback((key: ArtifactKey) => {
    setArtifacts((prev) => prev[key] ? prev : { ...prev, [key]: true });
  }, []);

  const completeWorkshop = useCallback((id: string) => {
    setWorkshopsDone((prev) => prev.includes(id) ? prev : [...prev, id]);
  }, []);

  const addSale = useCallback((sale: Omit<Sale, 'id'>) => {
    setSales((prev) => [{ ...sale, id: `s${prev.length + 1}` }, ...prev]);
  }, []);

  const logNo = useCallback((reason: string, lesson: string) => {
    setNos((prev) => [...prev, { reason, lesson }]);
  }, []);

  const bumpOutreach = useCallback((n: number) => setOutreach((v) => v + n), []);
  const bumpContacts = useCallback((n: number) => setContacts((v) => v + n), []);
  const addWeek = useCallback(
    (revenue: number, costs: number) => setWeeks((prev) => [...prev, { revenue, costs }]),
    []
  );

  const nextStep = useMemo(() => STEPS.find((s) => !isStepDone(s.id)), [isStepDone]);

  const currentPhase = useMemo<PhaseId>(() => {
    for (const phase of PHASES) {
      const steps = STEPS.filter((s) => s.phase === phase.id);
      if (!steps.every((s) => isStepDone(s.id))) return phase.id;
    }
    return 'scale';
  }, [isStepDone]);

  const phaseProgress = useCallback(
    (phase: PhaseId) => {
      const steps = STEPS.filter((s) => s.phase === phase);
      return { done: steps.filter((s) => isStepDone(s.id)).length, total: steps.length };
    },
    [isStepDone]
  );

  const roomProgress = useCallback(
    (room: RoomId) => {
      const steps = STEPS.filter((s) => s.room === room);
      return { done: steps.filter((s) => isStepDone(s.id)).length, total: steps.length };
    },
    [isStepDone]
  );

  const isRoomUnlocked = useCallback(
    (room: RoomId) => {
      const earliest = Math.min(
        ...STEPS.filter((s) => s.room === room).map((s) => phaseById(s.phase).index)
      );
      return phaseById(currentPhase).index >= earliest;
    },
    [currentPhase]
  );

  const xp = useMemo(() => {
    const stepXp = STEPS.reduce((sum, step) => {
      const { done, total } = stepProgress(step.id);
      return sum + Math.round(step.xp * done / total);
    }, 0);
    return stepXp + workshopsDone.length * 40;
  }, [stepProgress, workshopsDone]);

  const revenue = useMemo(() => sales.reduce((sum, s) => sum + s.amount, 0), [sales]);
  const profit = useMemo(
    () => sales.reduce((sum, s) => sum + (s.amount - company.cost), 0),
    [sales, company.cost]
  );

  const value: GameApi = {
    company,
    fields,
    tasksDone,
    artifacts,
    workshopsDone,
    sales,
    nos,
    outreach,
    contacts,
    weeks,
    xp,
    toggleTask,
    setField,
    updateCompany,
    buildArtifact,
    completeWorkshop,
    addSale,
    logNo,
    bumpOutreach,
    bumpContacts,
    addWeek,
    isTaskDone,
    isStepDone,
    stepProgress,
    nextStep,
    currentPhase,
    phaseProgress,
    roomProgress,
    isRoomUnlocked,
    revenue,
    profit,
    activeRoom,
    openRoom: setActiveRoom,
    guideOn,
    setGuideOn
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameApi {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}

export const TOTAL_ROOMS = ROOMS.length;
export const TOTAL_WORKSHOPS = WORKSHOPS.length;