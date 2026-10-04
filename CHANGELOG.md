# Changelog

All notable changes to HyperClicker are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.1.0] — 2026-10-04

First public release.

### Added

- **High-precision dispatch loop** with a hybrid coarse-sleep / spin-lock
  timer that holds sub-millisecond accuracy without pinning a core.
- **Batched `SendInput`** — up to 4096 pre-filled `INPUT` records flushed in a
  single kernel call, rebuilt only when a parameter actually changes.
- **Rhai rule engine** — a script compiled to an AST once, evaluated on a gated
  cadence to gate every dispatch cycle. Exposes `get_active_window_title()`,
  `get_pixel_hex(x, y)`, `get_cursor_pos()` and `platform()`, backed by real
  Win32 calls.
- **Global hotkey hook** using native `WH_KEYBOARD_LL` / `WH_MOUSE_LL`, with
  rebindable keys and an optional mouse button for hold-to-run.
- **Injected-event filtering** so the engine's own synthetic clicks can never
  retrigger the hotkey that started it.
- **Honest telemetry** at 10 Hz reporting requested, send-loop and OS-accepted
  rates separately, plus deadline overshoot and rejected batches.
- **Auto-stop timer**, enforced inside the engine loop so it still fires if the
  window has stopped responding.
- **Interval jitter** for non-metronomic bursts.
- **Session statistics** and rate presets.
- **JSON profile persistence** — interval, burst, button, mode, hotkeys, jitter,
  auto-stop and rule all survive a restart. A corrupt file falls back to
  defaults instead of stopping the app from starting.
- **Custom undecorated window** with an integrated title bar, a retractable
  sidebar, and a Help page explaining the engine and rule language.
- **Windows installer** (NSIS and MSI) with a customised installer UI.

### Fixed

The engine is built on a design that needed correcting before it could be
trusted; each of these was a real defect:

- `mod loop;` does not compile — `loop` is a Rust keyword, so the module is
  declared `pub mod r#loop;`.
- The global hook observed the engine's own `SendInput` clicks. A low-level
  hook must check `LLMHF_INJECTED`, which `rdev` does not expose; replaced with
  a native hook.
- The rule engine was never invoked by the dispatch loop, so the rule system
  did nothing at all.
- `get_pixel_hex` and `get_active_window_title` returned hard-coded values,
  which made the default rule permanently true.
- The `INPUT` buffer was ~160 KB on the stack, inside the dispatch call, on a
  thread with a 2 MB default stack. Moved to the heap.
- The `SendInput` return value was discarded, so a rejected burst was
  indistinguishable from a successful one.
- The `mode` atomic was declared but never read; continuous mode is now real.
- The default rule `get_active_window_title() != ""` blocked whenever nothing
  held focus, so the engine appeared broken on launch. The default is now
  explicit `true` with the gating example shipped commented out.

[Unreleased]: https://github.com/HBAABA119/Hyper-Clicker/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/HBAABA119/Hyper-Clicker/releases/tag/v0.1.0