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
import { Factory } from "./screens/Factory";

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
      return <Factory />;
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
