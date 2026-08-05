// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  REHEARSAL_CLEAN_RUNS_KEY,
  REHEARSAL_SUMMARY_KEY,
  REHEARSAL_TAKE_TTL_MS,
  type RehearsalFields,
} from "../../../lib/rehearsal";
import { RehearsalStudioTool } from "../RehearsalStudioTool";

const originalMediaDevices = navigator.mediaDevices;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

class FakeMediaRecorder {
  static isTypeSupported = () => true;

  state: RecordingState = "inactive";
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? "audio/webm";
  }

  start() {
    this.state = "recording";
  }

  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["recorded audio"], { type: this.mimeType }) } as BlobEvent);
    this.onstop?.(new Event("stop"));
  }
}

function installRecorder() {
  const stopTrack = vi.fn();
  const track = { stop: stopTrack, label: "Built-in Microphone" };
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
  const getUserMedia = vi.fn(async () => stream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:rehearsal-take"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  return { getUserMedia, stopTrack };
}

function installSignalMonitor(sampleValue: number) {
  let nextFrame = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    const id = nextFrame++;
    callbacks.set(id, callback);
    return id;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => callbacks.delete(id)));

  class FakeAudioContext {
    state: AudioContextState = "running";
    destination = {} as AudioDestinationNode;

    createMediaStreamSource() {
      return { connect: vi.fn() } as unknown as MediaStreamAudioSourceNode;
    }

    createAnalyser() {
      return {
        fftSize: 256,
        smoothingTimeConstant: 0,
        connect: vi.fn(),
        getByteTimeDomainData: (samples: Uint8Array) => samples.fill(sampleValue),
      } as unknown as AnalyserNode;
    }

    createGain() {
      return { gain: { value: 1 }, connect: vi.fn() } as unknown as GainNode;
    }

    resume = vi.fn(async () => undefined);
    close = vi.fn(async () => {
      this.state = "closed";
    });
  }

  vi.stubGlobal("AudioContext", FakeAudioContext);
  return {
    sample(frames = 1) {
      for (let frame = 0; frame < frames; frame += 1) {
        const pending = [...callbacks.entries()];
        callbacks.clear();
        pending.forEach(([id, callback]) => callback(id));
      }
    },
  };
}

function ControlledTool({
  initial = {},
  onTaskComplete,
}: {
  initial?: RehearsalFields;
  onTaskComplete?: () => void;
}) {
  const [fields, setFields] = React.useState<RehearsalFields>(initial);
  return (
    <>
      <RehearsalStudioTool
        fields={fields}
        onFieldChange={(key, value) => setFields((current) => ({ ...current, [key]: value }))}
        onTaskComplete={onTaskComplete}
      />
      <output aria-label="Saved clean runs">{fields[REHEARSAL_CLEAN_RUNS_KEY] ?? "0"}</output>
      <output aria-label="Saved rehearsal summary">{fields[REHEARSAL_SUMMARY_KEY] ?? ""}</output>
    </>
  );
}

async function beginRecording() {
  fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
  await act(async () => Promise.resolve());
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: originalMediaDevices,
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: originalCreateObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: originalRevokeObjectURL,
  });
});

describe("RehearsalStudioTool", () => {
  it("shows an honest fallback when the browser cannot record", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    render(<ControlledTool />);

    expect(screen.getByText("Rehearsal Studio")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("cannot record audio");
    expect((screen.getByRole("button", { name: "Start recording" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("records, stops the microphone, plays back, and destroys the take after 15 minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T12:00:00Z"));
    const { getUserMedia, stopTrack } = installRecorder();
    render(<ControlledTool />);

    await beginRecording();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    expect(screen.getByRole("button", { name: "Stop and listen" })).toBeTruthy();

    act(() => vi.advanceTimersByTime(12_000));
    fireEvent.click(screen.getByRole("button", { name: "Stop and listen" }));

    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Playback of your recorded pitch")).toBeTruthy();
    expect(document.body.textContent).toContain("0:12 recorded");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(REHEARSAL_TAKE_TTL_MS));
    expect(screen.queryByLabelText("Playback of your recorded pitch")).toBeNull();
    expect(screen.getByText("Your take was deleted after 15 minutes.")).toBeTruthy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:rehearsal-take");
  });

  it("records inside React StrictMode after its development cleanup cycle", async () => {
    installRecorder();
    render(
      <React.StrictMode>
        <ControlledTool />
      </React.StrictMode>,
    );

    await beginRecording();

    expect(screen.getByRole("button", { name: "Stop and listen" })).toBeTruthy();
  });

  it("turns a third honest clean take into persisted evidence and task completion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T12:00:00Z"));
    installRecorder();
    const onTaskComplete = vi.fn();
    render(
      <ControlledTool
        initial={{ [REHEARSAL_CLEAN_RUNS_KEY]: "2" }}
        onTaskComplete={onTaskComplete}
      />,
    );

    await beginRecording();
    act(() => vi.advanceTimersByTime(48_000));
    fireEvent.click(screen.getByRole("button", { name: "Stop and listen" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, clean run" }));

    expect(screen.getByLabelText("Saved clean runs").textContent).toBe("3");
    expect(screen.getByLabelText("Saved rehearsal summary").textContent).toContain(
      "three consecutive note-free pitch runs",
    );
    expect(screen.getByText("Three in a row. You completed this task.")).toBeTruthy();
    expect(onTaskComplete).toHaveBeenCalledTimes(1);
  });

  it("shows the active microphone and prevents a monitored silent take from counting", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T12:00:00Z"));
    installRecorder();
    const monitor = installSignalMonitor(128);
    render(<ControlledTool />);

    await beginRecording();
    expect(screen.getByLabelText("Active microphone").textContent).toContain("Built-in Microphone");
    expect(screen.getByRole("meter", { name: "Microphone input level" })).toBeTruthy();
    act(() => monitor.sample(4));
    act(() => vi.advanceTimersByTime(8_000));
    fireEvent.click(screen.getByRole("button", { name: "Stop and listen" }));

    expect(screen.getByRole("alert").textContent).toContain("No sound detected");
    expect(screen.queryByRole("button", { name: "Yes, clean run" })).toBeNull();
    expect(screen.getByLabelText("Saved clean runs").textContent).toBe("0");
  });

  it("accepts a monitored take after the level meter detects a voice", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T12:00:00Z"));
    installRecorder();
    const monitor = installSignalMonitor(140);
    render(<ControlledTool />);

    await beginRecording();
    act(() => monitor.sample(3));
    expect(screen.getByText("Sound detected")).toBeTruthy();
    act(() => vi.advanceTimersByTime(8_000));
    fireEvent.click(screen.getByRole("button", { name: "Stop and listen" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, clean run" }));

    expect(screen.getByLabelText("Saved clean runs").textContent).toBe("1");
  });

  it("stops automatically at one minute and refuses to count an over-limit take", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T12:00:00Z"));
    installRecorder();
    render(<ControlledTool />);

    await beginRecording();
    act(() => vi.advanceTimersByTime(60_000));

    expect(screen.queryByRole("button", { name: "Stop and listen" })).toBeNull();
    expect(screen.getByLabelText("Playback of your recorded pitch")).toBeTruthy();
    expect(document.body.textContent).toContain("reached the one-minute limit");
    expect((screen.getByRole("button", { name: "Yes, clean run" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("scores each take once and resets a consecutive streak after Not yet", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T12:00:00Z"));
    installRecorder();
    render(<ControlledTool initial={{ [REHEARSAL_CLEAN_RUNS_KEY]: "2" }} />);

    await beginRecording();
    act(() => vi.advanceTimersByTime(35_000));
    fireEvent.click(screen.getByRole("button", { name: "Stop and listen" }));
    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));

    expect(screen.getByLabelText("Saved clean runs").textContent).toBe("0");
    expect((screen.getByRole("button", { name: "Not yet" }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain("starts again at zero");
  });

  it("stops and discards an active recording when the learner leaves the task", async () => {
    const { stopTrack } = installRecorder();
    const view = render(<ControlledTool />);
    await beginRecording();

    view.unmount();

    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
