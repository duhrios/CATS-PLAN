import { afterEach, describe, expect, it, vi } from "vitest";

describe("operator movement alarm audio", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "AudioContext");
  });

  it("resumes the browser audio context before scheduling the alarm tones", async () => {
    const oscillators: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
    let createdContext: MockAudioContext | undefined;

    class MockAudioContext {
      state: AudioContextState = "suspended";
      currentTime = 0;
      destination = {};
      resume = vi.fn(async () => {
        this.state = "running";
      });
      constructor() {
        createdContext = this;
      }
      createOscillator() {
        const gain = this.createGain();
        const oscillator = {
          frequency: { value: 0 },
          type: "sine",
          connect: vi.fn(() => gain),
          start: vi.fn(() => {
            if (this.state !== "running") throw new Error("AudioContext is suspended");
          }),
          stop: vi.fn(),
        };
        oscillators.push(oscillator);
        return oscillator as unknown as OscillatorNode;
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
            value: 1,
          },
          connect: vi.fn((destination: object) => destination),
        } as unknown as GainNode;
      }
    }

    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: MockAudioContext,
    });

    const { playOperatorAlert } = await import("@/lib/operator-audio");
    const stop = playOperatorAlert({
      volume: 70,
      vibration: false,
      tone: "classic",
      customToneUrl: "",
      alarmDurationSeconds: 5,
    }, 3);

    await vi.waitFor(() => expect(oscillators.length).toBeGreaterThan(0));
    expect(createdContext?.resume).toHaveBeenCalledOnce();
    expect(oscillators[0].start).toHaveBeenCalled();
    stop();
    expect(oscillators[0].stop).toHaveBeenCalled();

    const initialOscillatorCount = oscillators.length;
    const stopAgain = playOperatorAlert({
      volume: 70,
      vibration: false,
      tone: "classic",
      customToneUrl: "",
      alarmDurationSeconds: 5,
    }, 3);
    await vi.waitFor(() => expect(oscillators.length).toBeGreaterThan(initialOscillatorCount));
    expect(createdContext?.resume).toHaveBeenCalledOnce();
    stopAgain();
  });
});
