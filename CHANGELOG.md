# Changelog

All notable changes to HyperClicker are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-10-04

### Added

- **Uninstall from Settings.** Resolves the registered uninstaller from the
  Windows registry (both hives, both registry views, so MSI and per-user
  installs both work), falls back to the `uninstall.exe` beside the binary,
  removes the app config directory, and exits. Guarded by an explicit
  confirmation, and the config directory is only deleted if it actually looks
  like HyperClicker's.
- **A much fuller Help page** — a first-minute walkthrough, a full explanation
  of every Dashboard number, expanded privacy and safety notes, and a
  troubleshooting list covering the real failure modes.

### Fixed

- **Panic Stop did not stop the engine promptly, and the window froze after
  pressing it.** Three separate causes, all fixed:
  - `wait_until` never checked the stop flag, so the loop always spun out the
    rest of its interval — up to ten seconds at the maximum setting — before
    `stop()`'s join could return. The wait is now interruptible.
  - `stop()` joined that thread, and `panic_stop` is a synchronous Tauri
    command, so the join ran on the main thread and blocked the whole event
    loop. Stops no longer join on the caller; the thread is reaped by the next
    start or on shutdown.
  - The default thread priority was `THREAD_PRIORITY_HIGHEST`. A busy-spinning
    thread above every normal thread starved the UI and input processing, which
    is the sluggishness that outlived the stop. The default is now
    `ABOVE_NORMAL`, `TIME_CRITICAL` remains opt-in, and priority is restored
    when the loop exits.
- Starting the engine reaped the previous thread before checking whether it was
  still running, which would have waited on a thread that nothing had asked to
  stop.
- The on/off switches were drawn in `surface-sunk` with a white knob — almost
  the same value as the card behind them, so the control read as a smudge and
  its state was ambiguous. They now have real contrast and an explicit ON/OFF
  label.
- The sidebar showed a hardcoded `v1.0` instead of the real version.

### Security

- The rule engine remains sandboxed to four read-only host functions with no
  file, network or process access, under an operation cap. Documented on the
  Help page alongside the uninstall and telemetry behaviour so the app's
  guarantees are stated rather than implied.

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
- The installer artwork was shipped as PNG. NSIS hands those bitmaps to
  `LoadImage`, which only understands Windows bitmaps, so makensis discarded
  them with `warning 5040: Unsupported format` and the installer silently fell
  back to the stock UI. The generator now emits 24-bit BMP, which is what NSIS
  actually renders.
- The app reported version `1.0.0` while the tag was `v0.1.0`, so the in-app
  update check compared `0.1.0` against `1.0.0`, decided every release was
  older, and reported "up to date" forever.
- The release profile's `strip`, `lto` and `codegen-units` were applied to host
  build scripts and proc macros, which never ship. Overriding them makes clean
  release builds noticeably faster and avoids a confusing failure where
  rustc reports `can't find crate for ...` because Windows refused to load a
  freshly linked proc-macro DLL.
- The CI engine job carried a Linux-only `apt-get` step and a duplicated
  checkout, and the Release workflow published the current ref rather than a
  chosen tag when dispatched.

[Unreleased]: https://github.com/HBAABA119/Hyper-Clicker/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/HBAABA119/Hyper-Clicker/releases/tag/v0.1.1
[0.1.0]: https://github.com/HBAABA119/Hyper-Clicker/releases/tag/v0.1.0