import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Clock3, Mic, Play, ShieldCheck, Square, Trash2, X } from "lucide-react";
import {
  REHEARSAL_CLEAN_RUNS_KEY,
  REHEARSAL_LAST_SECONDS_KEY,
  REHEARSAL_MAX_MS,
  REHEARSAL_SUMMARY_KEY,
  REHEARSAL_TAKE_TTL_MS,
  REHEARSAL_TARGET_RUNS,
  cleanRunCount,
  displayedRunSeconds,
  isUnderRehearsalLimit,
  reviewRehearsalRun,
  type RehearsalFields,
} from "../../lib/rehearsal";

type RecorderPhase = "idle" | "requesting" | "recording" | "processing" | "ready" | "error";

interface SavedTake {
  durationMs: number;
  expiresAt: number;
  hasSound: boolean;
  signalAnalyzed: boolean;
  url: string;
}

const INPUT_LEVEL_THRESHOLD = 0.018;
const INPUT_ACTIVE_FRAMES_REQUIRED = 3;

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${(safe % 60).toString().padStart(2, "0")}`;
}

function bestAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find(
    (type) => MediaRecorder.isTypeSupported(type),
  );
}

function recordingErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access is blocked. Allow it in your browser, then try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found. Connect one or switch to a device with a microphone.";
  }
  return "Recording could not start. Check your microphone and try again.";
}

function ProgressDots({ count }: { count: number }) {
  return (
    <div aria-label={`${count} of ${REHEARSAL_TARGET_RUNS} consecutive clean runs`} className="flex gap-2">
      {Array.from({ length: REHEARSAL_TARGET_RUNS }, (_, index) => {
        const complete = index < count;
        return (
          <span
            key={index}
            aria-hidden
            className={`flex h-10 w-10 items-center justify-center rounded-full border-2 font-display text-sm font-black ${
              complete
                ? "border-verified bg-verified text-white"
                : "border-[hsl(25_34%_20%/0.16)] bg-white text-[hsl(25_20%_38%)]"
            }`}
          >
            {complete ? <Check size={18} strokeWidth={3} /> : index + 1}
          </span>
        );
      })}
    </div>
  );
}

export function RehearsalStudioTool({
  fields,
  onFieldChange,
  onTaskComplete,
}: {
  fields: RehearsalFields;
  onFieldChange: (key: string, value: string) => void;
  onTaskComplete?: () => void;
}) {
  const cleanRuns = cleanRunCount(fields);
  const supported =
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function";

  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [take, setTake] = useState<SavedTake | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [microphoneLabel, setMicrophoneLabel] = useState("");
  const [liveInputLevel, setLiveInputLevel] = useState(0);
  const [signalMonitorAvailable, setSignalMonitorAvailable] = useState(false);

  const mountedRef = useRef(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickerRef = useRef<number | null>(null);
  const limitTimerRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const takeRef = useRef<SavedTake | null>(null);
  const completionSentRef = useRef(false);
  const recordingFailedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const signalFrameRef = useRef<number | null>(null);
  const signalMonitorAvailableRef = useRef(false);
  const activeSignalFramesRef = useRef(0);

  const stopSignalMonitoring = useCallback(() => {
    if (signalFrameRef.current !== null) window.cancelAnimationFrame(signalFrameRef.current);
    signalFrameRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
    if (mountedRef.current) setLiveInputLevel(0);
  }, []);

  const startSignalMonitoring = useCallback((stream: MediaStream) => {
    stopSignalMonitoring();
    activeSignalFramesRef.current = 0;
    signalMonitorAvailableRef.current = false;
    setSignalMonitorAvailable(false);
    setLiveInputLevel(0);

    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;

    try {
      const context = new AudioContextConstructor();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      const silentGain = context.createGain();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      silentGain.gain.value = 0;
      source.connect(analyser);
      analyser.connect(silentGain);
      silentGain.connect(context.destination);
      audioContextRef.current = context;

      const samples = new Uint8Array(analyser.fftSize);
      const sampleInput = () => {
        if (!mountedRef.current || recorderRef.current?.state !== "recording") return;
        analyser.getByteTimeDomainData(samples);
        let peakDeviation = 0;
        for (const value of samples) {
          peakDeviation = Math.max(peakDeviation, Math.abs(value - 128));
        }
        const level = Math.min(1, peakDeviation / 64);
        if (level >= INPUT_LEVEL_THRESHOLD) activeSignalFramesRef.current += 1;
        setLiveInputLevel(level);
        signalFrameRef.current = window.requestAnimationFrame(sampleInput);
      };
      void context.resume().then(() => {
        if (
          !mountedRef.current ||
          audioContextRef.current !== context ||
          recorderRef.current?.state !== "recording"
        ) return;
        signalMonitorAvailableRef.current = true;
        setSignalMonitorAvailable(true);
        signalFrameRef.current = window.requestAnimationFrame(sampleInput);
      }).catch(() => {
        if (audioContextRef.current !== context) return;
        stopSignalMonitoring();
        signalMonitorAvailableRef.current = false;
        setSignalMonitorAvailable(false);
      });
    } catch {
      stopSignalMonitoring();
      signalMonitorAvailableRef.current = false;
      setSignalMonitorAvailable(false);
    }
  }, [stopSignalMonitoring]);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearRecordingTimers = useCallback(() => {
    if (tickerRef.current !== null) window.clearInterval(tickerRef.current);
    if (limitTimerRef.current !== null) window.clearTimeout(limitTimerRef.current);
    tickerRef.current = null;
    limitTimerRef.current = null;
  }, []);

  const discardTake = useCallback(() => {
    if (takeRef.current) URL.revokeObjectURL(takeRef.current.url);
    takeRef.current = null;
    if (mountedRef.current) {
      setTake(null);
      setRemainingMs(0);
      setReviewed(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    clearRecordingTimers();
    if (mountedRef.current) {
      setElapsedMs(Math.min(REHEARSAL_MAX_MS, Math.max(1, Date.now() - startedAtRef.current)));
      setPhase("processing");
    }
    recorder.stop();
  }, [clearRecordingTimers]);

  const startRecording = useCallback(async () => {
    if (!supported || phase === "requesting" || phase === "recording" || phase === "processing") return;

    const requestId = ++requestRef.current;
    setError("");
    setNotice("");
    setReviewed(false);
    discardTake();
    setElapsedMs(0);
    setPhase("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (!mountedRef.current || requestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      chunksRef.current = [];
      recordingFailedRef.current = false;
      const microphoneTrack = stream.getAudioTracks()[0];
      setMicrophoneLabel(microphoneTrack?.label?.trim() || "Microphone connected");
      const mimeType = bestAudioMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        recordingFailedRef.current = true;
        clearRecordingTimers();
        stopSignalMonitoring();
        stopTracks();
        recorderRef.current = null;
        if (!mountedRef.current) return;
        setError("The recording stopped unexpectedly. Please try another take.");
        setPhase("error");
      };
      recorder.onstop = () => {
        const signalAnalyzed = signalMonitorAvailableRef.current;
        const hasSound =
          !signalAnalyzed || activeSignalFramesRef.current >= INPUT_ACTIVE_FRAMES_REQUIRED;
        clearRecordingTimers();
        stopSignalMonitoring();
        stopTracks();
        recorderRef.current = null;
        if (!mountedRef.current) return;

        if (recordingFailedRef.current) {
          chunksRef.current = [];
          return;
        }

        const durationMs = Math.min(
          REHEARSAL_MAX_MS,
          Math.max(1, Date.now() - startedAtRef.current),
        );
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        chunksRef.current = [];
        if (blob.size === 0) {
          setError("No audio was captured. Check your microphone and try again.");
          setPhase("error");
          return;
        }

        const saved: SavedTake = {
          durationMs,
          expiresAt: Date.now() + REHEARSAL_TAKE_TTL_MS,
          hasSound,
          signalAnalyzed,
          url: URL.createObjectURL(blob),
        };
        takeRef.current = saved;
        setTake(saved);
        setRemainingMs(REHEARSAL_TAKE_TTL_MS);
        setElapsedMs(durationMs);
        setPhase("ready");
      };

      recorder.start(250);
      setPhase("recording");
      startSignalMonitoring(stream);
      tickerRef.current = window.setInterval(() => {
        setElapsedMs(Math.min(REHEARSAL_MAX_MS, Date.now() - startedAtRef.current));
      }, 250);
      limitTimerRef.current = window.setTimeout(stopRecording, REHEARSAL_MAX_MS);
    } catch (caught) {
      stopSignalMonitoring();
      stopTracks();
      if (!mountedRef.current || requestRef.current !== requestId) return;
      setError(recordingErrorMessage(caught));
      setPhase("error");
    }
  }, [discardTake, phase, startSignalMonitoring, stopRecording, stopSignalMonitoring, stopTracks, supported, clearRecordingTimers]);

  useEffect(() => {
    if (!take) return;
    const updateExpiry = () => {
      const next = Math.max(0, take.expiresAt - Date.now());
      setRemainingMs(next);
      if (next > 0) return;
      discardTake();
      setPhase("idle");
      setNotice("Your take was deleted after 15 minutes.");
    };
    updateExpiry();
    const expiryTicker = window.setInterval(updateExpiry, 1000);
    return () => window.clearInterval(expiryTicker);
  }, [discardTake, take]);

  useEffect(() => {
    if (cleanRuns < REHEARSAL_TARGET_RUNS || completionSentRef.current) return;
    completionSentRef.current = true;
    onTaskComplete?.();
  }, [cleanRuns, onTaskComplete]);

  useEffect(() => {
    // React StrictMode intentionally runs an effect setup -> cleanup -> setup
    // cycle in development. Re-arm the mounted guard on the second setup so a
    // real microphone request is not mistaken for a stale request.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
      clearRecordingTimers();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        recorder.stop();
      }
      recorderRef.current = null;
      stopSignalMonitoring();
      stopTracks();
      if (takeRef.current) URL.revokeObjectURL(takeRef.current.url);
      takeRef.current = null;
    };
  }, [clearRecordingTimers, stopSignalMonitoring, stopTracks]);

  const reviewTake = (noteFree: boolean) => {
    if (!take || reviewed) return;
    const result = reviewRehearsalRun(cleanRuns, noteFree, take.durationMs);
    onFieldChange(REHEARSAL_CLEAN_RUNS_KEY, String(result.cleanRuns));
    onFieldChange(REHEARSAL_LAST_SECONDS_KEY, String(result.latestSeconds));
    onFieldChange(REHEARSAL_SUMMARY_KEY, result.summary);
    setReviewed(true);
    setNotice(
      result.complete
        ? "Three in a row. You completed this task."
        : result.cleanRuns > 0
          ? `${result.cleanRuns} clean ${result.cleanRuns === 1 ? "run" : "runs"} in a row. Record the next take.`
          : "That is useful practice. The consecutive-run count starts again at zero.",
    );
    if (result.complete && !completionSentRef.current) {
      completionSentRef.current = true;
      onTaskComplete?.();
    }
  };

  const deleteTake = () => {
    discardTake();
    setPhase("idle");
    setNotice("Take deleted from this device.");
  };

  const elapsedSeconds = Math.min(60, Math.floor(elapsedMs / 1000));
  const expirySeconds = Math.ceil(remainingMs / 1000);
  const takeUnderLimit = take ? isUnderRehearsalLimit(take.durationMs) : false;
  const takeHasSound = take ? !take.signalAnalyzed || take.hasSound : true;
  const isBusy = phase === "requesting" || phase === "processing";
  const inputMeterPercent = Math.round(Math.min(1, liveInputLevel / 0.2) * 100);

  return (
    <div aria-labelledby="fp-rehearsal-title" className="pb-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-sell">
            Record · listen · repeat
          </p>
          <h3 id="fp-rehearsal-title" className="mt-1 font-display text-[24px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
            Rehearsal Studio
          </h3>
          <p className="mt-1.5 max-w-[620px] text-[13.5px] leading-[1.55] text-[hsl(25_20%_38%)]">
            Record your pitch, listen once, then answer honestly. Three note-free runs under one minute complete the task.
          </p>
        </div>

        <div className="shrink-0 rounded-[14px] border-2 border-verified/25 bg-verified/10 p-3 shadow-card">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-verified">
            Consecutive clean runs
          </p>
          <div className="mt-2"><ProgressDots count={cleanRuns} /></div>
        </div>
      </div>

      <section className="mt-4 rounded-[14px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-4 shadow-card" aria-label="Pitch recorder">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${phase === "recording" ? "animate-pulse bg-sell text-white" : "bg-sell/10 text-sell"}`} aria-hidden>
              <Mic size={22} />
            </span>
            <div className="min-w-0">
              <p className="font-display text-[18px] font-black text-[hsl(25_34%_20%)]">
                {phase === "recording" ? "Pitching now" : phase === "requesting" ? "Opening microphone" : phase === "processing" ? "Preparing playback" : "Your next take"}
              </p>
              <p className="mt-0.5 text-[12.5px] leading-[1.45] text-[hsl(25_20%_38%)]">
                {phase === "recording" ? "Stop before the clock reaches one minute." : "Find a quiet spot and put your notes out of sight."}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <p role="timer" aria-label={`${elapsedSeconds} seconds recorded`} className="min-w-[66px] text-center font-display text-[30px] font-black tabular-nums text-[hsl(25_34%_20%)]">
              {formatClock(elapsedSeconds)}
            </p>
            {phase === "recording" ? (
              <button type="button" onClick={stopRecording} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sell px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)] active:translate-y-px active:shadow-[0_1px_0_hsl(14_78%_38%)]">
                <Square size={15} fill="currentColor" aria-hidden /> Stop and listen
              </button>
            ) : (
              <button type="button" onClick={() => void startRecording()} disabled={!supported || isBusy} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sell px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)] disabled:cursor-not-allowed disabled:opacity-55">
                <Mic size={16} aria-hidden /> {isBusy ? "Please wait" : take ? "Record another" : "Start recording"}
              </button>
            )}
          </div>
        </div>

        {phase === "recording" ? (
          <div className="mt-4 rounded-[10px] border-2 border-sell/15 bg-sell/5 px-3.5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p aria-label="Active microphone" className="min-w-0 truncate font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[hsl(25_20%_38%)]">
                {microphoneLabel || "Microphone connected"}
              </p>
              <p className={`font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] ${liveInputLevel >= INPUT_LEVEL_THRESHOLD ? "text-verified" : "text-[hsl(25_20%_38%)]"}`}>
                {signalMonitorAvailable
                  ? liveInputLevel >= INPUT_LEVEL_THRESHOLD
                    ? "Sound detected"
                    : "Speak to test"
                  : "Recording audio"}
              </p>
            </div>
            {signalMonitorAvailable ? (
              <div
                role="meter"
                aria-label="Microphone input level"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={inputMeterPercent}
                className="mt-2 h-2.5 overflow-hidden rounded-full bg-[hsl(25_34%_20%/0.12)]"
              >
                <span className="block h-full rounded-full bg-verified transition-[width] duration-100" style={{ width: `${inputMeterPercent}%` }} />
              </div>
            ) : null}
          </div>
        ) : null}

        {!supported ? (
          <div role="alert" className="mt-4 rounded-[10px] border-2 border-scale/35 bg-scale/10 px-3.5 py-3 text-[12.5px] leading-[1.5] text-[hsl(25_34%_20%)]">
            This browser cannot record audio here. Open First Profit in a current version of Chrome, Edge, or Safari.
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-[10px] border-2 border-sell/30 bg-sell/5 px-3.5 py-3 text-[12.5px] leading-[1.5] text-[hsl(25_34%_20%)]">
            <X size={17} className="mt-0.5 shrink-0 text-sell" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}
      </section>

      {take ? (
        <section className="mt-4 rounded-[14px] border-2 border-build/25 bg-build/5 p-4" aria-label="Recorded take">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-[18px] font-black text-[hsl(25_34%_20%)]">Listen to this take</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[hsl(25_20%_38%)]">
                <span className="inline-flex items-center gap-1"><Play size={14} aria-hidden /> {formatClock(displayedRunSeconds(take.durationMs))} recorded</span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1"><Clock3 size={14} aria-hidden /> Deletes in {formatClock(expirySeconds)}</span>
              </p>
            </div>
            <button type="button" onClick={deleteTake} aria-label="Delete this take now" className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 font-display text-[13px] font-bold text-[hsl(25_34%_20%)]">
              <Trash2 size={16} aria-hidden /> Delete now
            </button>
          </div>
          <audio controls src={take.url} aria-label="Playback of your recorded pitch" className="mt-3 w-full" />

          {!takeHasSound ? (
            <div role="alert" className="mt-3 flex items-start gap-2 rounded-[10px] border-2 border-sell/30 bg-sell/5 px-3.5 py-3 text-[12.5px] leading-[1.5] text-[hsl(25_34%_20%)]">
              <X size={17} className="mt-0.5 shrink-0 text-sell" aria-hidden />
              <span><strong>No sound detected.</strong> Check the microphone shown above, then record another take. This one will not affect your clean-run count.</span>
            </div>
          ) : null}

          {cleanRuns < REHEARSAL_TARGET_RUNS && takeHasSound ? (
            <div className="mt-4 border-t-2 border-build/15 pt-4">
              <p className="font-display text-[17px] font-black text-[hsl(25_34%_20%)]">Was it note-free and under one minute?</p>
              {!takeUnderLimit ? (
                <p className="mt-1 text-[12.5px] font-semibold text-sell">This take reached the one-minute limit, so record another to count it.</p>
              ) : null}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => reviewTake(true)} disabled={reviewed || !takeUnderLimit} className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-verified px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(150_52%_26%)] disabled:cursor-not-allowed disabled:opacity-50">
                  <Check size={17} aria-hidden /> Yes, clean run
                </button>
                <button type="button" onClick={() => reviewTake(false)} disabled={reviewed} className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-4 font-display text-[13px] font-bold text-[hsl(25_34%_20%)] disabled:cursor-not-allowed disabled:opacity-50">
                  <X size={17} aria-hidden /> Not yet
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {notice ? (
        <p role="status" className={`mt-4 rounded-[12px] border-2 px-3.5 py-3 text-[12.5px] font-semibold leading-[1.5] ${cleanRuns >= REHEARSAL_TARGET_RUNS ? "border-verified/35 bg-verified/10 text-[hsl(150_52%_28%)]" : "border-[hsl(25_34%_20%/0.12)] bg-white text-[hsl(25_34%_20%)]"}`}>
          {notice}
        </p>
      ) : null}

      <div className="mt-4 flex items-start gap-2.5 rounded-[12px] border-2 border-verified/20 bg-verified/5 px-3.5 py-3">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-verified" aria-hidden />
        <p className="text-[12px] leading-[1.5] text-[hsl(25_20%_38%)]">
          <strong className="text-[hsl(25_34%_20%)]">Private by design.</strong> Audio never leaves this device. It is deleted after 15 minutes, when you leave this task, or when you sign out. Only your clean-run count and summary are saved.
        </p>
      </div>
    </div>
  );
}
