//! Persisted user profile.
//!
//! The architecture diagram listed a config store that was never implemented,
//! so every restart lost the interval, burst, button, hotkeys and rule. This
//! writes them to the app config directory as JSON.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Default rule: allow every click.
///
/// Deliberately `true`, not a window-title test. A rule like
/// `get_active_window_title() != ""` blocks whenever nothing holds focus (a
/// console, a service context, the launcher), so the engine would appear
/// broken on launch. The gating example ships commented out below it.
pub const DEFAULT_SCRIPT: &str = "// Return true to allow clicking.\n// Available: get_active_window_title(), get_pixel_hex(x, y),\n//             get_cursor_pos(), platform()\ntrue\n// Gate on one window by uncommenting:\n// get_active_window_title() == \"Target Application\"";

pub const DEFAULT_TOGGLE_KEY: &str = "F6";
pub const DEFAULT_HOLD_KEY: &str = "F7";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub interval_micros: u64,
    pub burst: u32,
    pub button: u32,
    /// 0 = burst, 1 = continuous.
    pub mode: u32,
    pub time_critical: bool,
    pub toggle_key: String,
    pub hold_key: String,
    pub script: String,
    /// Auto-stop after this many minutes. 0 = never.
    pub auto_stop_minutes: u64,
    /// +/- interval spread in microseconds.
    pub jitter_micros: u32,
    /// Optional mouse button for hold-to-run: 0 left, 1 right, 2 middle.
    pub mouse_hold: Option<u8>,
}

impl Default for Profile {
    fn default() -> Self {
        Self {
            interval_micros: 1_000,
            burst: 1,
            button: 0,
            mode: 0,
            time_critical: false,
            toggle_key: DEFAULT_TOGGLE_KEY.to_string(),
            hold_key: DEFAULT_HOLD_KEY.to_string(),
            script: DEFAULT_SCRIPT.to_string(),
            auto_stop_minutes: 0,
            jitter_micros: 0,
            mouse_hold: None,
        }
    }
}

pub struct ConfigStore {
    path: PathBuf,
}

impl ConfigStore {
    pub fn new(dir: &Path) -> Self {
        Self {
            path: dir.join("profile.json"),
        }
    }

    /// Load the profile, falling back to defaults if it is missing or corrupt.
    /// A broken config file must never stop the app from starting.
    pub fn load(&self) -> Profile {
        match fs::read_to_string(&self.path) {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_else(|err| {
                eprintln!(
                    "hyperclicker: ignoring unreadable profile at {}: {err}",
                    self.path.display()
                );
                Profile::default()
            }),
            Err(_) => Profile::default(),
        }
    }

    pub fn save(&self, profile: &Profile) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .map_err(|err| format!("failed to create {}: {err}", parent.display()))?;
        }
        let raw = serde_json::to_string_pretty(profile)
            .map_err(|err| format!("failed to serialize profile: {err}"))?;
        fs::write(&self.path, raw)
            .map_err(|err| format!("failed to write {}: {err}", self.path.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("hyperclicker-test-{tag}"));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn missing_profile_returns_defaults() {
        let store = ConfigStore::new(&temp_dir("missing"));
        let profile = store.load();
        assert_eq!(profile.interval_micros, Profile::default().interval_micros);
    }

    #[test]
    fn profile_round_trips_through_disk() {
        let dir = temp_dir("roundtrip");
        let store = ConfigStore::new(&dir);

        let mut profile = Profile::default();
        profile.interval_micros = 250;
        profile.burst = 8;
        profile.button = 2;
        profile.script = "1 < 2".to_string();

        store.save(&profile).expect("save should succeed");
        let loaded = store.load();
        assert_eq!(loaded.interval_micros, 250);
        assert_eq!(loaded.burst, 8);
        assert_eq!(loaded.button, 2);
        assert_eq!(loaded.script, "1 < 2");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupt_profile_falls_back_to_defaults() {
        let dir = temp_dir("corrupt");
        fs::create_dir_all(&dir).expect("mkdir");
        fs::write(dir.join("profile.json"), "{ not json").expect("write");

        let store = ConfigStore::new(&dir);
        let profile = store.load();
        assert_eq!(profile.burst, Profile::default().burst);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn default_script_is_valid_and_allows() {
        let engine = crate::scripting::ScriptEngine::new();
        engine.compile(DEFAULT_SCRIPT).expect("default rule compiles");
        assert_eq!(
            engine.evaluate().verdict,
            crate::scripting::RuleVerdict::Allow
        );
    }
}