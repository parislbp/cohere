//! macOS window chrome. The title bar is an overlay (`titleBarStyle: Overlay`) so the web view
//! owns the top strip; we hide AppKit's standard buttons and draw themed ones in the UI instead.

use tauri::WebviewWindow;

#[cfg(target_os = "macos")]
pub fn hide_native_window_buttons(window: &WebviewWindow) {
    use objc::runtime::{Object, YES};
    use objc::{msg_send, sel, sel_impl};
    let Ok(ns_window) = window.ns_window() else { return };
    let ns_window = ns_window as *mut Object;
    if ns_window.is_null() {
        return;
    }
    // NSWindowButton: close = 0, miniaturize = 1, zoom = 2
    for kind in 0..3usize {
        unsafe {
            let button: *mut Object = msg_send![ns_window, standardWindowButton: kind];
            if !button.is_null() {
                let _: () = msg_send![button, setHidden: YES];
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn hide_native_window_buttons(_window: &WebviewWindow) {}
