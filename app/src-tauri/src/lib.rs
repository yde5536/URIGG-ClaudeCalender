use tauri::Manager;

#[cfg(windows)]
mod desktop {
    use windows_sys::core::BOOL;
    use windows_sys::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
    use windows_sys::Win32::Graphics::Gdi::{
        RedrawWindow, ScreenToClient, RDW_ALLCHILDREN, RDW_ERASE, RDW_FRAME, RDW_INVALIDATE,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, FindWindowExW, FindWindowW, GetParent, GetWindow, GetWindowLongPtrW, GetWindowRect, SetParent,
        SetWindowLongPtrW, SetWindowPos, GWL_STYLE, GW_CHILD, HWND_TOP, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOSIZE, SWP_SHOWWINDOW, WS_CAPTION, WS_CHILD, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_POPUP, WS_SYSMENU,
        WS_THICKFRAME,
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

    /// 위젯을 바탕화면 아이콘 창의 자식 창으로 넣는다.
    /// 바탕화면의 일부가 되므로 다른 창들 위로 올라오지 않고, Win+D를 눌러도 바탕화면과 함께 보인다.
    /// 아이콘 층(SHELLDLL_DefView)보다 위에 둬야 클릭이 위젯으로 온다.
    pub fn embed(hwnd: isize) {
        let hwnd = hwnd as HWND;
        let host = icon_host();
        if host.is_null() {
            return;
        }
        unsafe {
            if GetParent(hwnd) != host {
                // 화면 좌표를 기억했다가 부모 기준 좌표로 바꿔 같은 자리에 둔다
                let mut r: RECT = std::mem::zeroed();
                GetWindowRect(hwnd, &mut r);
                // 자식 창에 제목줄·테두리 속성이 남아 있으면 Windows가 옛날식 제목줄을 직접 그리므로 모두 뺀다
                let frame = (WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX) as isize;
                let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
                SetWindowLongPtrW(hwnd, GWL_STYLE, (style & !frame) | WS_CHILD as isize);
                SetParent(hwnd, host);
                let mut pt = POINT { x: r.left, y: r.top };
                ScreenToClient(host, &mut pt);
                SetWindowPos(
                    hwnd,
                    HWND_TOP,
                    pt.x,
                    pt.y,
                    0,
                    0,
                    SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
                );
                // 스타일을 바꾸기 전 잠깐 그려진 제목줄이 바탕화면에 잔상으로 남지 않게 다시 그린다
                RedrawWindow(host, std::ptr::null(), std::ptr::null_mut(), RDW_INVALIDATE | RDW_ERASE | RDW_ALLCHILDREN | RDW_FRAME);
            } else if GetWindow(host, GW_CHILD) != hwnd {
                // 탐색기가 아이콘 층을 다시 위로 올리면 위젯을 맨 위로
                SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
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
                    desktop::embed(hwnd);
                    // 배경화면 프로그램이 아이콘 창을 바꾸거나 아이콘 층을 위로 올릴 수 있어 주기적으로 다시 확인
                    std::thread::spawn(move || loop {
                        std::thread::sleep(std::time::Duration::from_secs(3));
                        desktop::embed(hwnd);
                    });
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
