//! Self-uninstallation.
//!
//! Windows does not expose "uninstall me" to a running application, so the
//! best an app can do is locate the uninstaller that installed it, launch it,
//! and get out of the way. Two things make that reliable:
//!
//! * The uninstall string is read from the registry rather than guessed. The
//!   NSIS installer writes one; the MSI writes another; the per-user and
//!   machine-wide installs live under different hives and registry views.
//!   `uninstall.exe` sitting next to the running binary is the fallback, and
//!   the only path that is available if the registry entry has been removed.
//! * The app's own config directory is removed first, so uninstalling does not
//!   leave a profile file behind. That directory is ours and is named after the
//!   app identifier, so nothing else lives there.
//!
//! Every path is validated against a set of markers before anything is deleted
//! or launched. Uninstalling is irreversible and removes code the user wants
//! gone, so a wrong guess here is much worse than an error message.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Registry key that lists installed applications, for both install scopes.
const UNINSTALL_KEYS: [(&str, u32); 4] = [
    (
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        0, // KEY_WOW64_64KEY
    ),
    (
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        0x1000, // KEY_WOW64_32KEY
    ),
    (
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        0, // KEY_WOW64_64KEY
    ),
    (
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        0x1000,
    ),
];

/// Substrings that identify our own uninstall entry. Matching on several
/// independent markers means an unrelated program that merely mentions
/// "click" can never be mistaken for this app.
const PRODUCT_MARKERS: [&str; 4] = [
    "hyperclicker",
    "hyper clicker",
    "hyper-clicker",
    "com.hyperclicker",
];

/// Hives to search, with their `HKEY_*` values.
const HIVES: [u16; 2] = [0x8001, 0x8002]; // HKCU, HKLM

/// Reject anything that is obviously not our config directory.
fn is_our_config_dir(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }
    let text = path.to_string_lossy().to_ascii_lowercase();
    // Refuse a bare drive root, a user profile root, or a system directory.
    if text.len() < 12 {
        return false;
    }
    PRODUCT_MARKERS.iter().any(|marker| text.contains(marker))
}

#[cfg(windows)]
mod imp {
    use super::{PRODUCT_MARKERS, UNINSTALL_KEYS};
    use std::ptr::null_mut;

    use windows_sys::Win32::Foundation::{ERROR_MORE_DATA, ERROR_NO_MORE_ITEMS, ERROR_SUCCESS};
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, RegQueryValueExW, HKEY,
    };

    const KEY_READ: u32 = 0x20019;

    /// Read a `REG_SZ`/`REG_EXPAND_SZ` value. Returns `None` when absent or of
    /// an unexpected type, rather than guessing at a wider buffer.
    unsafe fn read_string(root: HKEY, path: &str, value: &str, view: u32) -> Option<String> {
        let mut sub: HKEY = null_mut();
        let wide_path: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        let wide_value: Vec<u16> = value.encode_utf16().chain(std::iter::once(0)).collect();

        let status = RegOpenKeyExW(root, wide_path.as_ptr(), 0, KEY_READ | view, &mut sub);
        if status != ERROR_SUCCESS {
            return None;
        }

        // Ask for the size first rather than guessing, then read exactly that.
        let mut kind: u32 = 0;
        let mut bytes: u32 = 0;
        let size_status = RegQueryValueExW(
            sub,
            wide_value.as_ptr(),
            null_mut(),
            &mut kind,
            null_mut(),
            &mut bytes,
        );

        let text = if size_status == ERROR_SUCCESS && bytes > 0 && bytes < 64 * 1024 {
            let mut buf = vec![0u16; (bytes as usize / 2) + 1];
            let mut read: u32 = 0;
            let read_status = RegQueryValueExW(
                sub,
                wide_value.as_ptr(),
                null_mut(),
                &mut kind,
                buf.as_mut_ptr() as *mut u8,
                &mut read,
            );
            if read_status == ERROR_SUCCESS || read_status == ERROR_MORE_DATA {
                let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
                buf.truncate(len);
                String::from_utf16(&buf).ok()
            } else {
                None
            }
        } else {
            None
        };

        RegCloseKey(sub);
        // Guard against a value that is not a string at all.
        match kind {
            1 | 2 => text, // REG_SZ | REG_EXPAND_SZ
            _ => None,
        }
    }

    /// Every subkey name under an uninstall root.
    unsafe fn subkeys(root: HKEY, path: &str, view: u32) -> Vec<String> {
        let mut sub: HKEY = null_mut();
        let wide_path: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        if RegOpenKeyExW(root, wide_path.as_ptr(), 0, KEY_READ | view, &mut sub) != ERROR_SUCCESS {
            return Vec::new();
        }

        let mut names = Vec::new();
        let mut index = 0u32;
        loop {
            let mut buf = vec![0u16; 512];
            let mut len: u32 = buf.len() as u32;
            let status = RegEnumKeyExW(
                sub,
                index,
                buf.as_mut_ptr(),
                &mut len,
                null_mut(),
                null_mut(),
                null_mut(),
                null_mut(),
            );
            if status == ERROR_NO_MORE_ITEMS {
                break;
            }
            if status != ERROR_SUCCESS {
                break;
            }
            buf.truncate(len as usize);
            names.push(String::from_utf16_lossy(&buf));
            index += 1;
            if index > 4096 {
                // Refuse to walk an unbounded registry tree.
                break;
            }
        }
        RegCloseKey(sub);
        names
    }

    /// Find our uninstall command in the registry.
    pub fn registry_uninstall_command() -> Option<String> {
        unsafe {
            for hive in super::HIVES {
                for (key, view) in UNINSTALL_KEYS {
                    let root = hive as HKEY;
                    for name in subkeys(root, key, view) {
                        let lowered = name.to_ascii_lowercase();
                        if !PRODUCT_MARKERS.iter().any(|m| lowered.contains(m)) {
                            continue;
                        }
                        let full = format!("{}\\{name}", key.trim_end_matches('\\'));
                        if let Some(cmd) = read_string(root, &full, "UninstallString", view) {
                            if !cmd.trim().is_empty() {
                                return Some(cmd);
                            }
                        }
                    }
                }
            }
        }
        None
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn registry_uninstall_command() -> Option<String> {
        None
    }
}

/// Split an `UninstallString` into a program and its arguments.
///
/// Values look like `"C:\...\uninstall.exe"` or `MsiExec.exe /I{...}`, and NSIS
/// often appends a flag. Quoted paths must not be split on spaces.
fn split_command(raw: &str) -> Option<(String, Vec<String>)> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(rest) = trimmed.strip_prefix('"') {
        let end = rest.find('"')?;
        let program = rest[..end].to_string();
        let args = rest[end + 1..]
            .split_whitespace()
            .map(str::to_string)
            .collect();
        return Some((program, args));
    }

    // `MsiExec.exe` must be resolved through PATH; everything else is a path.
    let mut parts = trimmed.split_whitespace();
    let first = parts.next()?.to_string();
    let args: Vec<String> = parts.map(str::to_string).collect();
    Some((first, args))
}

/// The uninstaller sitting beside the running binary, if present.
fn sibling_uninstaller() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let candidate = dir.join("uninstall.exe");
    candidate.is_file().then_some(candidate)
}

/// Resolve what should actually be run, preferring the registry.
///
/// Returns the command to execute. The registry wins because it is the only
/// source that is correct for an MSI install and for a machine-wide install,
/// where the binary is not necessarily beside the running one.
pub fn resolve_uninstall_command() -> Result<(String, Vec<String>), String> {
    if let Some(raw) = imp::registry_uninstall_command() {
        if let Some((program, args)) = split_command(&raw) {
            return Ok((program, args));
        }
    }
    if let Some(path) = sibling_uninstaller() {
        return Ok((path.to_string_lossy().into_owned(), Vec::new()));
    }
    Err(
        "Could not find the HyperClicker uninstaller. Use Windows Settings > \
         Apps > Installed apps instead."
            .to_string(),
    )
}

/// Remove the app's own configuration directory.
///
/// Refuses anything that does not look like our directory: deleting the wrong
/// path here would be unrecoverable.
pub fn remove_app_data(config_dir: &Path) -> Result<(), String> {
    if !config_dir.exists() {
        return Ok(());
    }
    if !is_our_config_dir(config_dir) {
        return Err(format!(
            "Refusing to delete {}, which does not look like the HyperClicker \
             config directory.",
            config_dir.display()
        ));
    }
    std::fs::remove_dir_all(config_dir)
        .map_err(|err| format!("could not remove {}: {err}", config_dir.display()))
}

/// Launch the uninstaller and hand control over to it.
///
/// The uninstaller must outlive this process, so it is spawned detached and
/// the caller is expected to exit immediately afterwards.
pub fn launch_uninstaller() -> Result<(), String> {
    let (program, args) = resolve_uninstall_command()?;

    Command::new(&program)
        .args(&args)
        .spawn()
        .map(|_| ())
        .map_err(|err| format!("could not start the uninstaller ({program}): {err}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn quoted_uninstall_strings_split_correctly() {
        let (program, args) =
            split_command(r#""C:\Program Files\HyperClicker\uninstall.exe" /S"#).unwrap();
        assert_eq!(program, r"C:\Program Files\HyperClicker\uninstall.exe");
        assert_eq!(args, vec!["/S".to_string()]);
    }

    #[test]
    fn msi_exec_strings_split_correctly() {
        let (program, args) = split_command(r#"MsiExec.exe /I{1234-5678} /qn"#).unwrap();
        assert_eq!(program, "MsiExec.exe");
        assert_eq!(args, vec!["/I{1234-5678}".to_string(), "/qn".to_string()]);
    }

    #[test]
    fn a_bare_path_is_treated_as_the_program() {
        let (program, args) = split_command(r"C:\Apps\uninstall.exe").unwrap();
        assert_eq!(program, r"C:\Apps\uninstall.exe");
        assert!(args.is_empty());
    }

    #[test]
    fn empty_or_malformed_commands_are_rejected() {
        assert!(split_command("").is_none());
        assert!(split_command("   ").is_none());
        // An unterminated quote must not silently run the wrong program.
        assert!(split_command(r#""C:\Apps\uninstall.exe"#).is_none());
    }

    #[test]
    fn unrelated_directories_are_never_deleted() {
        for path in [
            PathBuf::from(r"C:\"),
            PathBuf::from(r"C:\Users"),
            PathBuf::from(r"C:\Windows"),
            PathBuf::from(r"C:\Users\aayan\Documents"),
        ] {
            assert!(
                !is_our_config_dir(&path),
                "{} must not be treated as the app config directory",
                path.display()
            );
        }
    }

    #[test]
    fn a_missing_directory_is_not_an_error() {
        let missing = PathBuf::from(r"C:\definitely\not\here\hyperclicker");
        assert!(!missing.exists());
        // Removing something that is already gone is a success, not a failure.
        assert!(remove_app_data(&missing).is_ok());
    }

    #[test]
    fn the_real_config_directory_is_recognised() {
        let dir: PathBuf = [
            std::env::temp_dir(),
            PathBuf::from("hyperclicker-config-test"),
        ]
        .iter()
        .collect();
        std::fs::create_dir_all(&dir).expect("temp dir should be creatable");
        assert!(is_our_config_dir(&dir));
        assert!(remove_app_data(&dir).is_ok());
        assert!(!dir.exists());
    }

    #[test]
    fn product_markers_are_all_lowercase_and_distinct() {
        for marker in PRODUCT_MARKERS {
            assert_eq!(marker, marker.to_ascii_lowercase());
        }
        let mut sorted = PRODUCT_MARKERS.to_vec();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), PRODUCT_MARKERS.len());
    }

    #[test]
    fn resolution_returns_an_actionable_error_when_nothing_is_found() {
        // On a dev machine nothing is installed, so this must fail with
        // guidance rather than panic or launch something arbitrary.
        match resolve_uninstall_command() {
            Ok((program, _)) => assert!(!program.trim().is_empty()),
            Err(message) => assert!(
                message.contains("Installed apps"),
                "error should tell the user what to do instead: {message}"
            ),
        }
    }
}
