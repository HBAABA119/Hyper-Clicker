import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface Telemetry {
  running: boolean;
  mode: number;
  button: number;
  intervalMicros: number;
  burst: number;
  timeCritical: boolean;
  clicksDispatched: number;
  clicksAccepted: number;
  dispatchCalls: number;
  dispatchFailures: number;
  ruleBlocked: number;
  dispatchCps: number;
  acceptedCps: number;
  sendLoopCps: number;
  /** Measured overshoot past the deadline, in microseconds. */
  jitterMicros: number;
  ruleStatus: "allow" | "blocked" | "error" | "unconfigured" | "unknown";
  ruleError: string;
  platformSupported: boolean;
  stopInMs: number | null;
  uptimeSecs: number;
  /** The configured jitter setting, unrelated to `jitterMicros`. */
  jitterSettingMicros: number;
}

export interface Capabilities {
  platformSupported: boolean;
  hookActive: boolean;
  nativeBindings: boolean;
  platform: string;
  panicKey: string;
  toggleKey: string;
  holdKey: string;
}

export interface Profile {
  intervalMicros: number;
  burst: number;
  button: number;
  mode: number;
  timeCritical: boolean;
  toggleKey: string;
  holdKey: string;
  script: string;
  autoStopMinutes: number;
  jitterMicros: number;
  mouseHold: number | null;
}

export interface Stats {
  clicksDispatched: number;
  clicksAccepted: number;
  eventsAccepted: number;
  dispatchCalls: number;
  dispatchFailures: number;
  ruleBlocked: number;
  uptimeSecs: number;
  running: boolean;
}

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export const MODE_BURST = 0;
export const MODE_CONTINUOUS = 1;

export const BUTTON_NAMES = ["Left", "Right", "Middle"] as const;

export const api = {
  capabilities: () => invoke<Capabilities>("get_capabilities"),
  profile: () => invoke<Profile>("get_profile"),
  saveProfile: () => invoke<void>("save_profile"),
  resetProfile: () => invoke<Profile>("reset_profile"),
  stats: () => invoke<Stats>("get_stats"),

  setActive: (active: boolean) => invoke<void>("set_clicker_active", { active }),
  setTiming: (intervalMicros: number, burstCount: number) =>
    invoke<void>("set_timing_parameters", { intervalMicros, burstCount }),
  setMode: (mode: number) => invoke<void>("set_mode", { mode }),
  setButton: (button: number) => invoke<void>("set_button", { button }),
  setTimeCritical: (enabled: boolean) =>
    invoke<void>("set_time_critical", { enabled }),
  setAutoStop: (minutes: number) => invoke<void>("set_auto_stop", { minutes }),
  setJitter: (micros: number) => invoke<void>("set_jitter", { micros }),
  setBindings: (
    toggleKey: string,
    holdKey: string,
    mouseHold: number | null,
  ) => invoke<void>("set_bindings", { toggleKey, holdKey, mouseHold }),

  fireBurst: () => invoke<number>("trigger_burst_now"),
  panicStop: () => invoke<void>("panic_stop"),
  updateScript: (code: string) => invoke<number>("update_script", { code }),
};

export function onTelemetry(
  handler: (snapshot: Telemetry) => void,
): Promise<UnlistenFn> {
  return listen<Telemetry>("engine://telemetry", (event) =>
    handler(event.payload),
  );
}

export function onEngineStatus(
  handler: (running: boolean) => void,
): Promise<UnlistenFn> {
  return listen<boolean>("engine://status", (event) => handler(event.payload));
}

export function formatRate(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 100_000) return `${(value / 1000).toFixed(0)}k`;
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}