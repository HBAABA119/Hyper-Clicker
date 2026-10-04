import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  api,
  isDesktop,
  MODE_BURST,
  onEngineStatus,
  onTelemetry,
  type Capabilities,
  type Profile,
  type Stats,
  type Telemetry,
} from "./api";

const HISTORY_LENGTH = 120;

interface EngineValue {
  desktop: boolean;
  ready: boolean;
  caps: Capabilities | null;
  telemetry: Telemetry | null;
  stats: Stats | null;
  history: number[];

  running: boolean;
  interval: number;
  burst: number;
  button: number;
  mode: number;
  timeCritical: boolean;
  autoStopMinutes: number;
  jitterMicros: number;
  toggleKey: string;
  holdKey: string;
  mouseHold: number | null;

  setInterval: (v: number) => void;
  setBurst: (v: number) => void;
  setButton: (v: number) => void;
  setMode: (v: number) => void;
  setTimeCritical: (v: boolean) => void;
  setAutoStopMinutes: (v: number) => void;
  setJitterMicros: (v: number) => void;

  toggleEngine: () => Promise<void>;
  panicStop: () => Promise<void>;
  fireBurst: () => Promise<void>;
  saveBindings: (
    toggleKey: string,
    holdKey: string,
    mouseHold: number | null,
  ) => Promise<void>;
  resetProfile: () => Promise<void>;
}

const EngineContext = createContext<EngineValue | null>(null);

export function useEngine(): EngineValue {
  const value = useContext(EngineContext);
  if (!value) throw new Error("useEngine must be used inside EngineProvider");
  return value;
}

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const desktop = useMemo(() => isDesktop(), []);

  const [ready, setReady] = useState(false);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  const [running, setRunning] = useState(false);
  const [interval, setIntervalState] = useState(1000);
  const [burst, setBurstState] = useState(1);
  const [button, setButtonState] = useState(0);
  const [mode, setModeState] = useState(MODE_BURST);
  const [timeCritical, setTimeCriticalState] = useState(false);
  const [autoStopMinutes, setAutoStopMinutesState] = useState(0);
  const [jitterMicros, setJitterMicrosState] = useState(0);
  const [toggleKey, setToggleKey] = useState("F6");
  const [holdKey, setHoldKey] = useState("F7");
  const [mouseHold, setMouseHold] = useState<number | null>(null);

  // Mirrors `interval`/`burst` so the debounced push always reads the latest
  // pair without re-subscribing the effect.
  const timingRef = useRef({ interval: 1000, burst: 1 });
  const hydrated = useRef(false);

  const applyProfile = useCallback((profile: Profile) => {
    setIntervalState(profile.intervalMicros);
    setBurstState(profile.burst);
    setButtonState(profile.button);
    setModeState(profile.mode);
    setTimeCriticalState(profile.timeCritical);
    setAutoStopMinutesState(profile.autoStopMinutes);
    setJitterMicrosState(profile.jitterMicros);
    setToggleKey(profile.toggleKey);
    setHoldKey(profile.holdKey);
    setMouseHold(profile.mouseHold ?? null);
  }, []);

  useEffect(() => {
    if (!desktop) {
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [capabilities, profile] = await Promise.all([
          api.capabilities(),
          api.profile(),
        ]);
        if (cancelled) return;
        setCaps(capabilities);
        applyProfile(profile);
        timingRef.current = {
          interval: profile.intervalMicros,
          burst: profile.burst,
        };
        hydrated.current = true;
      } catch (err) {
        console.error("bootstrap failed", err);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [desktop, applyProfile]);

  // Telemetry stream + a slower stats poll for the cumulative counters.
  useEffect(() => {
    if (!desktop) return;
    const offs: Array<() => void> = [];

    onTelemetry((snapshot) => {
      setTelemetry(snapshot);
      setRunning(snapshot.running);
      setHistory((prev) => [...prev, snapshot.acceptedCps].slice(-HISTORY_LENGTH));
    })
      .then((off) => offs.push(off))
      .catch((err) => console.error("telemetry subscription failed", err));

    onEngineStatus((isRunning) => setRunning(isRunning))
      .then((off) => offs.push(off))
      .catch((err) => console.error("status subscription failed", err));

    const statsTimer = window.setInterval(() => {
      api
        .stats()
        .then(setStats)
        .catch((err) => console.error("stats poll failed", err));
    }, 1000);

    return () => {
      window.clearInterval(statsTimer);
      offs.forEach((off) => off());
    };
  }, [desktop]);

  // Debounced timing push: the UI pushes on every slider tick.
  useEffect(() => {
    if (!desktop || !hydrated.current) return;
    const handle = window.setTimeout(() => {
      api
        .setTiming(timingRef.current.interval, timingRef.current.burst)
        .catch((err) => console.error(err));
    }, 180);
    return () => window.clearTimeout(handle);
  }, [interval, burst, desktop]);

  const setInterval = useCallback((v: number) => {
    timingRef.current = { ...timingRef.current, interval: v };
    setIntervalState(v);
  }, []);

  const setBurst = useCallback((v: number) => {
    timingRef.current = { ...timingRef.current, burst: v };
    setBurstState(v);
  }, []);

  const setButton = useCallback((v: number) => {
    setButtonState(v);
    if (isDesktop()) api.setButton(v).catch(console.error);
  }, []);

  const setMode = useCallback((v: number) => {
    setModeState(v);
    if (isDesktop()) api.setMode(v).catch(console.error);
  }, []);

  const setTimeCritical = useCallback((v: boolean) => {
    setTimeCriticalState(v);
    if (isDesktop()) api.setTimeCritical(v).catch(console.error);
  }, []);

  const setAutoStopMinutes = useCallback((v: number) => {
    setAutoStopMinutesState(v);
    if (isDesktop()) api.setAutoStop(v).catch(console.error);
  }, []);

  const setJitterMicros = useCallback((v: number) => {
    setJitterMicrosState(v);
    if (isDesktop()) api.setJitter(v).catch(console.error);
  }, []);

  const toggleEngine = useCallback(async () => {
    if (!desktop) return;
    const next = !running;
    setRunning(next);
    try {
      await api.setActive(next);
    } catch (err) {
      setRunning(!next);
      console.error(err);
    }
  }, [desktop, running]);

  const panicStop = useCallback(async () => {
    if (!desktop) return;
    try {
      await api.panicStop();
    } finally {
      setRunning(false);
    }
  }, [desktop]);

  const fireBurst = useCallback(async () => {
    if (!desktop) return;
    try {
      await api.fireBurst();
    } catch (err) {
      console.error(err);
    }
  }, [desktop]);

  const saveBindings = useCallback(
    async (nextToggle: string, nextHold: string, nextMouse: number | null) => {
      setToggleKey(nextToggle);
      setHoldKey(nextHold);
      setMouseHold(nextMouse);
      await api.setBindings(nextToggle, nextHold, nextMouse);
      await api.saveProfile();
      const nextCaps = await api.capabilities();
      setCaps(nextCaps);
    },
    [],
  );

  const resetProfile = useCallback(async () => {
    const profile = await api.resetProfile();
    applyProfile(profile);
    timingRef.current = {
      interval: profile.intervalMicros,
      burst: profile.burst,
    };
  }, [applyProfile]);

  const value: EngineValue = {
    desktop,
    ready,
    caps,
    telemetry,
    stats,
    history,
    running,
    interval,
    burst,
    button,
    mode,
    timeCritical,
    autoStopMinutes,
    jitterMicros,
    toggleKey,
    holdKey,
    mouseHold,
    setInterval,
    setBurst,
    setButton,
    setMode,
    setTimeCritical,
    setAutoStopMinutes,
    setJitterMicros,
    toggleEngine,
    panicStop,
    fireBurst,
    saveBindings,
    resetProfile,
  };

  return (
    <EngineContext.Provider value={value}>{children}</EngineContext.Provider>
  );
}