/**
 * fpv2 stage router (Unit 5 rewrite).
 *
 * The app is a `stage` machine (no router): boot | landing | login | onboard |
 * app. This unit ships the login screen and MINIMAL placeholders for the other
 * stages so the whole flow is walkable end to end; the real surfaces arrive in
 * later units:
 *   - app floor → Units 9-11
 *
 * The old single-company Factory / rooms are intentionally no longer imported
 * (they consume the removed old GameContext API). Those files stay on disk for
 * later units to evolve; excluding them from App's import tree keeps them out
 * of the build.
 */
import { GameProvider, useGame } from "./state/GameContext";
import { Login } from "./screens/Login";
import { Landing } from "./screens/Landing";
import { Onboarding } from "./screens/Onboarding";

function Boot() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[hsl(40_30%_99%)] text-ink">
      <div className="flex flex-col items-center gap-3">
        <span className="flex h-9 items-end gap-[3px]" aria-hidden>
          <span className="h-3 w-[5px] animate-pulse rounded-sm bg-sell" />
          <span className="h-5 w-[5px] animate-pulse rounded-sm bg-build" />
          <span className="h-7 w-[5px] animate-pulse rounded-sm bg-grow" />
          <span className="h-9 w-[5px] animate-pulse rounded-sm bg-scale" />
        </span>
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ink/50">Loading</p>
      </div>
    </main>
  );
}

/** Minimal name + logout chip for the app placeholder (no dependency on old Hud). */
function FounderChip() {
  const { profile, logout } = useGame();
  const label = profile.firstName || profile.handle || "Founder";
  return (
    <header className="flex items-center justify-between gap-4 rounded-3xl border border-[hsl(40_14%_89%)] bg-white px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 shrink-0 items-end gap-[2px]" aria-hidden>
          <span className="h-2.5 w-1 rounded-sm bg-sell" />
          <span className="h-4 w-1 rounded-sm bg-build" />
          <span className="h-5 w-1 rounded-sm bg-grow" />
          <span className="h-7 w-1 rounded-sm bg-scale" />
        </span>
        <span className="min-w-0 truncate font-mono text-xs uppercase tracking-wider text-ink/70">
          {label}
        </span>
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border-2 border-ink/15 px-4 font-mono text-xs uppercase tracking-wider text-ink hover:border-ink/30"
      >
        Log out
      </button>
    </header>
  );
}

/** Minimal placeholder floor (real one is Units 9-11). */
function AppFloor() {
  return (
    <main className="flex min-h-screen w-full flex-col gap-4 bg-[hsl(38_40%_92%)] p-4 sm:p-6">
      <FounderChip />
      <div className="flex flex-1 items-center justify-center rounded-3xl border-2 border-dashed border-ink/15 bg-white/40 p-8 text-center">
        <div className="max-w-sm">
          <h1 className="font-display text-2xl font-black leading-tight">
            Factory floor, coming in Unit 9.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink/60">
            The Path, Company, and Products rows plus the Sell floor land here.
          </p>
        </div>
      </div>
    </main>
  );
}

function StageRouter() {
  const { stage } = useGame();
  switch (stage) {
    case "boot":
      return <Boot />;
    case "landing":
      return <Landing />;
    case "login":
      return <Login />;
    case "onboard":
      return <Onboarding />;
    case "app":
      return <AppFloor />;
    default:
      return <Boot />;
  }
}

export function App() {
  return (
    <GameProvider>
      <StageRouter />
    </GameProvider>
  );
}
