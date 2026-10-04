//! Native bindings exposed to Rhai scripts.
//!
//! The original implementation returned hard-coded values -- `get_pixel_hex`
//! always answered `"#FFFFFF"` and `get_active_window_title` always answered
//! `"Target Application"`. That made the default rule in the UI
//! (`get_active_window_title() == "Target Application"`) *always true*, so the
//! rule engine appeared to work while doing nothing. These are the real Win32
//! implementations.

/// `true` when the host functions can actually query the OS.
pub const fn native_bindings_available() -> bool {
    cfg!(windows)
}

#[cfg(windows)]
mod imp {
    use std::mem::{size_of, zeroed};
    use std::ptr::null_mut;

    use windows_sys::Win32::Foundation::{HWND, POINT};
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC,
        SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT, DIB_RGB_COLORS, SRCCOPY,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetForegroundWindow, GetWindowTextW,
    };

    /// Title of the window currently holding focus, or `""`.
    pub fn active_window_title() -> String {
        unsafe {
            let hwnd: HWND = GetForegroundWindow();
            if hwnd.is_null() {
                return String::new();
            }
            let mut buf = [0u16; 512];
            let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
            if len <= 0 {
                return String::new();
            }
            String::from_utf16_lossy(&buf[..len as usize])
        }
    }

    /// Sample one screen pixel and return it as `#RRGGBB`.
    ///
    /// Reads through a 1x1 top-down DIB via `BitBlt` from the screen DC, which
    /// is the reliable way to sample the composited desktop. Returns `"#000000"`
    /// only if the DC or DIB cannot be created.
    pub fn pixel_hex(x: i32, y: i32) -> String {
        unsafe {
            let screen_dc = GetDC(null_mut());
            if screen_dc.is_null() {
                return "#000000".to_string();
            }

            let mem_dc = CreateCompatibleDC(screen_dc);
            if mem_dc.is_null() {
                ReleaseDC(null_mut(), screen_dc);
                return "#000000".to_string();
            }

            let mut bmi: BITMAPINFO = zeroed();
            bmi.bmiHeader.biSize = size_of::<BITMAPINFOHEADER>() as u32;
            bmi.bmiHeader.biWidth = 1;
            bmi.bmiHeader.biHeight = -1; // top-down
            bmi.bmiHeader.biPlanes = 1;
            bmi.bmiHeader.biBitCount = 32;
            bmi.bmiHeader.biCompression = BI_RGB;

            let mut bits: *mut core::ffi::c_void = null_mut();
            let section =
                CreateDIBSection(screen_dc, &bmi, DIB_RGB_COLORS, &mut bits, null_mut(), 0);
            if section.is_null() || bits.is_null() {
                DeleteDC(mem_dc);
                ReleaseDC(null_mut(), screen_dc);
                return "#000000".to_string();
            }

            let previous = SelectObject(mem_dc, section);
            let ok = BitBlt(mem_dc, 0, 0, 1, 1, screen_dc, x, y, SRCCOPY | CAPTUREBLT) != 0;

            let colour = if ok && !bits.is_null() {
                let px = &*(bits as *const [u8; 4]);
                format!("#{:02X}{:02X}{:02X}", px[2], px[1], px[0])
            } else {
                "#000000".to_string()
            };

            SelectObject(mem_dc, previous);
            DeleteObject(section);
            DeleteDC(mem_dc);
            ReleaseDC(null_mut(), screen_dc);
            colour
        }
    }

    /// Current cursor position as `[x, y]`.
    pub fn cursor_pos() -> Vec<i32> {
        unsafe {
            let mut pt = POINT { x: 0, y: 0 };
            if GetCursorPos(&mut pt) != 0 {
                vec![pt.x, pt.y]
            } else {
                vec![-1, -1]
            }
        }
    }

    pub fn platform_name() -> String {
        "windows".to_string()
    }
}

#[cfg(not(windows))]
mod imp {
    /// No native implementation on this platform. These deliberately return
    /// empty/negative values rather than plausible-looking fakes, so a rule
    /// comparing against them fails loudly instead of silently passing.
    pub fn active_window_title() -> String {
        String::new()
    }

    pub fn pixel_hex(_x: i32, _y: i32) -> String {
        String::new()
    }

    pub fn cursor_pos() -> Vec<i32> {
        vec![-1, -1]
    }

    pub fn platform_name() -> String {
        std::env::consts::OS.to_string()
    }
}

pub use imp::{active_window_title, cursor_pos, pixel_hex, platform_name};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pixel_hex_is_empty_or_well_formed() {
        let value = pixel_hex(10, 10);
        assert!(
            value.is_empty() || (value.len() == 7 && value.starts_with('#')),
            "unexpected pixel format: {value:?}"
        );
    }

    #[test]
    fn cursor_pos_is_reported_as_a_pair() {
        assert_eq!(cursor_pos().len(), 2);
    }
}
