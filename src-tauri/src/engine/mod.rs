pub mod input_win;
// `loop` is a Rust keyword, so the module needs the raw-identifier escape.
pub mod r#loop;
pub mod telemetry;

use serde::{Deserialize, Serialize};

/// Which mouse button the engine targets.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TargetButton {
    Left,
    Right,
    Middle,
}

impl TargetButton {
    pub fn from_u32(value: u32) -> Self {
        match value {
            1 => TargetButton::Right,
            2 => TargetButton::Middle,
            _ => TargetButton::Left,
        }
    }
}

/// Result of one `SendInput` flush.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DispatchOutcome {
    /// The OS inserted this many raw events.
    Accepted(u32),
    /// Zero events were inserted. `requested` is what we asked for and
    /// `last_error` is the Win32 error code (UIPI blocking is the usual cause).
    Rejected { requested: u32, last_error: u32 },
}