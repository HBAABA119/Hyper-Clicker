# HyperClicker

A high-precision OS-level click engine for Windows, plus the marketing site.

Two independent projects live in this repo:

| Path | What it is |
|---|---|
| `/` | The Tauri desktop app (Rust engine + React dashboard) |
| `website/` | The Next.js 16 landing page |

---

## Run it

### Desktop app

Requires Rust (stable, 1.77+), Node 20+, and the MSVC C++ build tools on
Windows. WebView2 already ships with Windows 11.

```bash
pnpm install
pnpm tauri dev        # hot-reloading dev build, opens the window
```

To produce a distributable installer:

```bash
pnpm tauri build      # .msi and setup.exe land in src-tauri/target/release/bundle/
```

To run the engine tests:

```bash
cd src-tauri
cargo test            # 63 tests
```

### Website

```bash
cd website
pnpm install
pnpm dev              # http://localhost:3000
pnpm build            # static export into website/out
```

`website/out` is plain static files — drop it on any host.

---

## What the engine actually does

The dispatch cycle is: **rule check → batched `SendInput` → wait for one
deadline**. Timing is hybrid — a coarse `sleep` while far from the target
timestamp, then `spin_loop()` for the final stretch, because the OS scheduler
granularity (1–15.6 ms) is far too coarse to hit a sub-millisecond deadline.

Defaults to `THREAD_PRIORITY_HIGHEST`. `TIME_CRITICAL` is available but
off by default: it starves every other thread on the machine, which matters on
a shared PC.

### Hotkeys

| Key | Action |
|---|---|
| `F6` | Toggle the engine |
| `F7` | Hold to run |
| `Escape` | Panic stop — always wins, even over a rule |

Bindings are rebindable in **Settings** and applied to the live hook the moment
you save — no restart. An optional mouse button can be bound for hold-to-run;
synthetic clicks are filtered out of the hook by the injected flag, so that
cannot make the engine retrigger itself.

### Features

- **Auto-stop** — arm a duration in Settings; enforced inside the engine loop,
  so it still fires if the window has hung.
- **Interval jitter** — ± spread so bursts are not metronomic.
- **Session stats** — clicks sent, clicks accepted, batches, rule-blocked cycles.
- **Presets** — 10 CPS / 100 CPS / 1 kHz / send-loop, applied instantly.
- **Profile persistence** — interval, burst, button, mode, hotkeys, jitter,
  auto-stop and your rule all survive a restart. A corrupt file falls back to
  defaults rather than stopping the app from starting.

### Rules

The rule engine evaluates a Rhai expression that must return `true`. It is
compiled to an AST once on edit and evaluated on a gated cadence, never once
per click. Available host functions:

- `get_active_window_title()` — real `GetForegroundWindow` + `GetWindowTextW`
- `get_pixel_hex(x, y)` — real `BitBlt` sample from the screen DC
- `get_cursor_pos()` — `[x, y]`
- `platform()` — OS name

A failing rule **allows** clicks and surfaces the error in the UI, so a typo
cannot silently and permanently stop the engine.

---

## Performance, honestly

The dashboard reports three separate numbers, because conflating them is how
clicker tools end up quoting nonsense:

- **Requested** — clicks handed to `SendInput` per second
- **Send loop** — `SendInput` calls per second
- **Accepted** — clicks the OS confirmed, derived from accepted raw events

`SendInput` serialises into the session input queue, which the OS drains on its
own schedule. Real sustained delivery is in the hundreds-to-low-thousands of
clicks per second. Claims of "100,000 CPS" from other tools are measuring how
fast a loop can call an API, not clicks that reached a window. The **Accepted**
figure in the app is the real one.

---

## Layout

```
src/                 React dashboard
  components/        Logo, TitleBar, Sidebar, Slider, Switch,
                     KeyCapture, Sparkline, Segmented, Stat, RuleEditor (lazy)
  pages/             Dashboard, Rules, Settings
  lib/store.tsx      shared engine state + actions
  lib/api.ts         typed IPC bridge + telemetry types
src-tauri/
  src/engine/        input_win.rs, loop.rs, telemetry.rs
  src/hooks/         global_hook.rs (native WH_*_LL hook)
  src/scripting/     engine.rs (Rhai AST), host.rs (Win32 bindings)
  src/config/        store.rs (JSON profile persistence)
  src/main.rs        Tauri commands and app wiring
scripts/make_icons.py  regenerates the app icons from scratch
website/             Next.js 16.3.8 landing page
```

The window is undecorated, so `TitleBar` supplies the drag region and the
minimise/maximise/close controls. `Slider` and `Switch` are built from scratch
rather than styled from `input[type=range]`, so they match the surface exactly.

Note: `engine/loop.rs` is declared as `pub mod r#loop;` because `loop` is a
Rust keyword.

---

## Licence and use

An input automation utility for testing and personal workflows. Respect the
terms of service of whatever you point it at.