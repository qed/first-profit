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
  phaseById,
  type ArtifactKey,
  type PhaseId,
  type RoomId,
  type Step,
  type UnitTask } from
'../data/path';
import { ROOMS, roomById } from '../data/rooms';

export interface Sale {
  id: string;
  customer: string;
  product: string;
  amount: number;
  day: string;
  kind: 'sale' | 'backing';
}

export interface Backer {
  id: string;
  name: string;
  amount: number;
  credit: number;
  note: string;
  day: string;
}

export interface Profile {
  firstName: string;
  age: number;
  handle: string;
}

export interface Company {
  name: string;
  product: string;
  price: number;
  cost: number;
  headline: string;
  cta: string;
  colorway: 'ember' | 'ocean' | 'moss' | 'plum';
  delivery: 'email' | 'download' | 'handoff';
  deliveryNote: string;
  sitePublished: boolean;
}

export interface NextUp {
  step: Step;
  task: UnitTask;
  index: number;
  total: number;
}

interface GameApi {
  profile: Profile;
  company: Company;
  onboarded: boolean;
  fields: Record<string, string>;
  artifacts: Record<ArtifactKey, boolean>;
  workshopsDone: string[];
  sales: Sale[];
  backers: Backer[];
  nos: {reason: string;lesson: string;}[];
  outreach: number;
  contacts: number;
  weeks: {revenue: number;costs: number;}[];
  xp: number;
  revenue: number;
  backing: number;
  creditIssued: number;
  profit: number;
  activeRoom: RoomId | null;
  justUnlocked: RoomId[];

  startJourney: (profile: Profile) => void;
  toggleTask: (taskId: string) => void;
  isTaskDone: (taskId: string) => boolean;
  isStepDone: (stepId: string) => boolean;
  stepProgress: (stepId: string) => {done: number;total: number;};
  setField: (key: string, value: string) => void;
  updateCompany: (patch: Partial<Company>) => void;
  buildArtifact: (key: ArtifactKey) => void;
  completeWorkshop: (id: string) => void;
  addSale: (sale: Omit<Sale, 'id' | 'kind'> & {kind?: Sale['kind'];}) => void;
  addBacker: (backer: Omit<Backer, 'id' | 'credit' | 'day'>) => void;
  logNo: (reason: string, lesson: string) => void;
  bumpOutreach: (n: number) => void;
  bumpContacts: (n: number) => void;
  addWeek: (revenue: number, costs: number) => void;
  nextUp: NextUp | undefined;
  currentPhase: PhaseId;
  phaseProgress: (phase: PhaseId) => {done: number;total: number;};
  roomProgress: (room: RoomId) => {done: number;total: number;};
  isRoomUnlocked: (room: RoomId) => boolean;
  isStepVisible: (step: Step) => boolean;
  openRoom: (room: RoomId | null) => void;
  clearUnlocks: () => void;
  siteUrl: string;
}

const GameContext = createContext<GameApi | null>(null);

const defaultCompany: Company = {
  name: '',
  product: 'Invest in me',
  price: 10,
  cost: 0,
  headline: '',
  cta: 'Back me',
  colorway: 'ember',
  delivery: 'handoff',
  deliveryNote: '',
  sitePublished: true
};

export function GameProvider({ children }: {children: React.ReactNode;}) {
  const [profile, setProfile] = useState<Profile>({ firstName: '', age: 12, handle: '' });
  const [onboarded, setOnboarded] = useState(false);
  const [company, setCompany] = useState<Company>(defaultCompany);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [doneTasks, setDoneTasks] = useState<Record<string, boolean>>({});
  const [artifacts, setArtifacts] = useState<Record<ArtifactKey, boolean>>({
    website: false,
    checkout: false,
    delivery: false,
    ledger: false
  });
  const [workshopsDone, setWorkshopsDone] = useState<string[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [backers, setBackers] = useState<Backer[]>([]);
  const [nos, setNos] = useState<{reason: string;lesson: string;}[]>([]);
  const [outreach, setOutreach] = useState(0);
  const [contacts, setContacts] = useState(0);
  const [weeks, setWeeks] = useState<{revenue: number;costs: number;}[]>([]);
  const [activeRoom, setActiveRoom] = useState<RoomId | null>(null);
  const [justUnlocked, setJustUnlocked] = useState<RoomId[]>([]);

  const taskByIdMap = useMemo(() => {
    const map = new Map<string, UnitTask>();
    STEPS.forEach((s) => s.tasks.forEach((t) => map.set(t.id, t)));
    return map;
  }, []);

  const isTaskDone = useCallback(
    (taskId: string) => {
      const task = taskByIdMap.get(taskId);
      if (task?.auto && artifacts[task.auto]) return true;
      return Boolean(doneTasks[taskId]);
    },
    [doneTasks, artifacts, taskByIdMap]
  );

  const isStepDone = useCallback(
    (stepId: string) => {
      const step = STEPS.find((s) => s.id === stepId);
      return step ? step.tasks.every((t) => isTaskDone(t.id)) : false;
    },
    [isTaskDone]
  );

  const stepProgress = useCallback(
    (stepId: string) => {
      const step = STEPS.find((s) => s.id === stepId);
      if (!step) return { done: 0, total: 0 };
      return { done: step.tasks.filter((t) => isTaskDone(t.id)).length, total: step.tasks.length };
    },
    [isTaskDone]
  );

  const unlockedRoomsFor = useCallback(
    (doneMap: (id: string) => boolean) =>
    ROOMS.filter((r) => !r.unlockAfter || doneMap(r.unlockAfter)).map((r) => r.id),
    []
  );

  const toggleTask = useCallback(
    (taskId: string) => {
      setDoneTasks((prev) => {
        const next = { ...prev, [taskId]: !prev[taskId] };
        // work out which pods just opened
        const doneWith = (map: Record<string, boolean>) => (stepId: string) => {
          const step = STEPS.find((s) => s.id === stepId);
          if (!step) return false;
          return step.tasks.every((t) => t.auto && artifacts[t.auto] || map[t.id]);
        };
        const before = unlockedRoomsFor(doneWith(prev));
        const after = unlockedRoomsFor(doneWith(next));
        const fresh = after.filter((r) => !before.includes(r));
        if (fresh.length) setJustUnlocked(fresh);
        return next;
      });
    },
    [artifacts, unlockedRoomsFor]
  );

  const startJourney = useCallback((next: Profile) => {
    setProfile(next);
    setCompany((prev) => ({
      ...prev,
      name: `${next.firstName}'s first company`,
      headline: `Hi, I'm ${next.firstName} and I'm ${next.age} years old. This is the future site of my first $1,000 profit company.`
    }));
    setArtifacts((prev) => ({ ...prev, website: true, checkout: true }));
    setOnboarded(true);
  }, []);

  const setField = useCallback(
    (key: string, value: string) => setFields((prev) => ({ ...prev, [key]: value })),
    []
  );
  const updateCompany = useCallback(
    (patch: Partial<Company>) => setCompany((prev) => ({ ...prev, ...patch })),
    []
  );
  const buildArtifact = useCallback(
    (key: ArtifactKey) => setArtifacts((prev) => prev[key] ? prev : { ...prev, [key]: true }),
    []
  );
  const completeWorkshop = useCallback(
    (id: string) => setWorkshopsDone((prev) => prev.includes(id) ? prev : [...prev, id]),
    []
  );
  const addSale = useCallback(
    (sale: Omit<Sale, 'id' | 'kind'> & {kind?: Sale['kind'];}) =>
    setSales((prev) => [
    { kind: 'sale', ...sale, id: `s${prev.length + 1}` } as Sale,
    ...prev]
    ),
    []
  );
  const addBacker = useCallback(
    (backer: Omit<Backer, 'id' | 'credit' | 'day'>) => {
      const day = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      setBackers((prev) => [
      { ...backer, credit: backer.amount * 2, day, id: `b${prev.length + 1}` },
      ...prev]
      );
      setSales((prev) => [
      {
        id: `s${prev.length + 1}`,
        customer: backer.name,
        product: 'Invest in me · store credit',
        amount: backer.amount,
        day,
        kind: 'backing'
      },
      ...prev]
      );
    },
    []
  );
  const logNo = useCallback(
    (reason: string, lesson: string) => setNos((prev) => [...prev, { reason, lesson }]),
    []
  );
  const bumpOutreach = useCallback((n: number) => setOutreach((v) => v + n), []);
  const bumpContacts = useCallback((n: number) => setContacts((v) => v + n), []);
  const addWeek = useCallback(
    (revenue: number, costs: number) => setWeeks((prev) => [...prev, { revenue, costs }]),
    []
  );

  const nextUp = useMemo<NextUp | undefined>(() => {
    for (const step of STEPS) {
      const index = step.tasks.findIndex((t) => !isTaskDone(t.id));
      if (index !== -1) {
        return { step, task: step.tasks[index], index, total: step.tasks.length };
      }
    }
    return undefined;
  }, [isTaskDone]);

  const currentPhase = useMemo<PhaseId>(() => {
    for (const phase of PHASES) {
      if (!STEPS.filter((s) => s.phase === phase.id).every((s) => isStepDone(s.id))) return phase.id;
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
      const def = roomById(room);
      return !def.unlockAfter || isStepDone(def.unlockAfter);
    },
    [isStepDone]
  );

  /** Only show criteria from the phase you are in (or already passed). */
  const isStepVisible = useCallback(
    (step: Step) => phaseById(step.phase).index <= phaseById(currentPhase).index,
    [currentPhase]
  );

  const xp = useMemo(() => {
    const stepXp = STEPS.reduce((sum, step) => {
      const { done, total } = stepProgress(step.id);
      return sum + Math.round(step.xp * done / total);
    }, 0);
    return stepXp + workshopsDone.length * 40;
  }, [stepProgress, workshopsDone]);

  const revenue = useMemo(
    () => sales.filter((s) => s.kind === 'sale').reduce((sum, s) => sum + s.amount, 0),
    [sales]
  );
  const backing = useMemo(() => backers.reduce((sum, b) => sum + b.amount, 0), [backers]);
  const creditIssued = useMemo(() => backers.reduce((sum, b) => sum + b.credit, 0), [backers]);
  const profit = useMemo(
    () =>
    sales.
    filter((s) => s.kind === 'sale').
    reduce((sum, s) => sum + (s.amount - company.cost), 0),
    [sales, company.cost]
  );

  const value: GameApi = {
    profile,
    company,
    onboarded,
    fields,
    artifacts,
    workshopsDone,
    sales,
    backers,
    nos,
    outreach,
    contacts,
    weeks,
    xp,
    revenue,
    backing,
    creditIssued,
    profit,
    activeRoom,
    justUnlocked,
    startJourney,
    toggleTask,
    isTaskDone,
    isStepDone,
    stepProgress,
    setField,
    updateCompany,
    buildArtifact,
    completeWorkshop,
    addSale,
    addBacker,
    logNo,
    bumpOutreach,
    bumpContacts,
    addWeek,
    nextUp,
    currentPhase,
    phaseProgress,
    roomProgress,
    isRoomUnlocked,
    isStepVisible,
    openRoom: setActiveRoom,
    clearUnlocks: () => setJustUnlocked([]),
    siteUrl: `firstprofit.school/${profile.handle || 'you'}`
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameApi {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}