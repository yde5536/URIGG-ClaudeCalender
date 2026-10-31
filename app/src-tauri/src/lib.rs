use tauri::Manager;

#[cfg(windows)]
mod desktop {
    use windows_sys::core::BOOL;
    use windows_sys::Win32::Foundation::{HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, FindWindowExW, FindWindowW, GetWindowLongPtrW, SetWindowLongPtrW, GWLP_HWNDPARENT,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    unsafe extern "system" fn find_icon_host(hwnd: HWND, out: LPARAM) -> BOOL {
        let defview = wide("SHELLDLL_DefView");
        unsafe {
            if !FindWindowExW(hwnd, std::ptr::null_mut(), defview.as_ptr(), std::ptr::null()).is_null() {
                *(out as *mut HWND) = hwnd;
                return 0;
            }
        }
        1
    }

    /// 바탕화면 아이콘(SHELLDLL_DefView)을 담고 있는 창.
    /// 보통 Progman이지만, 움직이는 배경화면 프로그램을 쓰면 WorkerW로 옮겨진다.
    fn icon_host() -> HWND {
        let mut host: HWND = std::ptr::null_mut();
        unsafe {
            EnumWindows(Some(find_icon_host), &mut host as *mut HWND as LPARAM);
            if host.is_null() {
                host = FindWindowW(wide("Progman").as_ptr(), std::ptr::null());
            }
        }
        host
    }

    /// 위젯 창의 소유자를 바탕화면 아이콘 창으로 지정한다.
    /// 바탕화면에 딸린 창이 되므로 Win+D(바탕화면 보기)를 눌러도 숨겨지지 않는다.
    pub fn pin(hwnd: isize) {
        let host = icon_host() as isize;
        if host == 0 {
            return;
        }
        unsafe {
            if GetWindowLongPtrW(hwnd as HWND, GWLP_HWNDPARENT) != host {
                SetWindowLongPtrW(hwnd as HWND, GWLP_HWNDPARENT, host);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 위젯 위치·크기를 PC별로 기억
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            #[cfg(windows)]
            if let Some(widget) = app.get_webview_window("widget") {
                if let Ok(hwnd) = widget.hwnd() {
                    let hwnd = hwnd.0 as isize;
                    desktop::pin(hwnd);
                    // 탐색기 재시작이나 배경화면 프로그램이 아이콘 창을 바꿀 수 있어 주기적으로 다시 확인
                    std::thread::spawn(move || loop {
                        std::thread::sleep(std::time::Duration::from_secs(3));
                        desktop::pin(hwnd);
                    });
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
