#[cfg(windows)]
mod desktop;

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::ManagerExt;

const WIDGET: &str = "widget";
/// 위젯 쪽 JS에 전체 창을 열어달라고 보내는 이벤트 (전체 창 여는 코드는 JS에 있다)
const OPEN_MAIN_EVENT: &str = "open-main";
/// 사용자가 "자동 실행"을 끈 적이 있으면 생기는 표시 파일. 없으면 설치판은 자동 실행을 켠다.
const AUTOSTART_OFF_MARKER: &str = "autostart-disabled";

/// 사용자가 직접 종료할 때만 true. 그 외에 창이 사라지면(탐색기 재시작 등) 위젯을 다시 띄운다.
static QUITTING: AtomicBool = AtomicBool::new(false);

fn quit(app: &AppHandle) {
    QUITTING.store(true, Ordering::SeqCst);
    app.exit(0);
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    quit(&app);
}

fn open_main(app: &AppHandle) {
    let _ = app.emit_to(WIDGET, OPEN_MAIN_EVENT, ());
}

/// 위젯을 바탕화면에 넣고, 바탕화면이 바뀌어도 계속 붙어 있도록 주기적으로 확인한다.
fn setup_widget(window: &WebviewWindow) {
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        let hwnd = hwnd.0 as isize;
        desktop::suppress_caption(hwnd);
        desktop::embed(hwnd);
        std::thread::spawn(move || {
            while desktop::is_alive(hwnd) {
                std::thread::sleep(Duration::from_secs(3));
                desktop::embed(hwnd);
            }
        });
    }
    #[cfg(not(windows))]
    let _ = window;
}

/// 위젯은 탐색기 창의 자식이라 탐색기가 재시작되면 함께 사라진다. 바탕화면이 다시 생기면 새로 만든다.
fn recreate_widget(app: AppHandle) {
    std::thread::spawn(move || {
        #[cfg(windows)]
        while !desktop::desktop_ready() {
            std::thread::sleep(Duration::from_secs(1));
        }
        // 바탕화면 구성이 끝날 때까지 조금 더 기다린다
        std::thread::sleep(Duration::from_secs(2));
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if handle.get_webview_window(WIDGET).is_some() {
                return;
            }
            let Some(config) = handle.config().app.windows.iter().find(|w| w.label == WIDGET).cloned() else {
                return;
            };
            if let Ok(window) = WebviewWindowBuilder::from_config(&handle, &config).and_then(|b| b.build()) {
                setup_widget(&window);
            }
        });
    });
}

/// 위젯이 화면 밖으로 나가 찾을 수 없을 때를 위해 주 모니터 오른쪽 위로 되돌린다.
fn reset_widget_position(app: &AppHandle) {
    let Some(window) = app.get_webview_window(WIDGET) else { return };
    let (Ok(Some(monitor)), Ok(size)) = (window.primary_monitor(), window.outer_size()) else { return };
    let margin = (48.0 * monitor.scale_factor()) as i32;
    let x = monitor.position().x + monitor.size().width as i32 - size.width as i32 - margin;
    let y = monitor.position().y + margin;
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        desktop::move_to(hwnd.0 as isize, x, y);
    }
}

fn autostart_marker(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join(AUTOSTART_OFF_MARKER))
}

fn toggle_autostart(app: &AppHandle, item: &CheckMenuItem<tauri::Wry>) {
    let launcher = app.autolaunch();
    let enabled = launcher.is_enabled().unwrap_or(false);
    let marker = autostart_marker(app);
    if enabled {
        let _ = launcher.disable();
        if let Some(marker) = marker {
            let _ = std::fs::create_dir_all(marker.parent().unwrap());
            let _ = std::fs::write(marker, "");
        }
    } else {
        let _ = launcher.enable();
        if let Some(marker) = marker {
            let _ = std::fs::remove_file(marker);
        }
    }
    let _ = item.set_checked(launcher.is_enabled().unwrap_or(false));
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "전체 창 열기", true, None::<&str>)?;
    let reset = MenuItem::with_id(app, "reset", "위젯 위치 초기화", true, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "Windows 시작 시 실행",
        true,
        app.autolaunch().is_enabled().unwrap_or(false),
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &reset,
            &PredefinedMenuItem::separator(app)?,
            &autostart,
            &PredefinedMenuItem::separator(app)?,
            &quit_item,
        ],
    )?;

    TrayIconBuilder::with_id("tray")
        .icon(app.default_window_icon().cloned().expect("app icon"))
        .tooltip("코워크 캘린더")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open" => open_main(app),
            "reset" => reset_widget_position(app),
            "autostart" => toggle_autostart(app, &autostart),
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                open_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 두 번째로 실행하면 새로 띄우지 않고 전체 창을 연다 (가장 먼저 등록해야 한다)
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| open_main(app)))
        // 위젯 위치·크기를 PC별로 기억
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![quit_app])
        .setup(|app| {
            let handle = app.handle();
            // 설치판은 처음 실행할 때 자동 실행을 켠다 (개발판은 개발용 exe가 등록되지 않게 건너뜀)
            #[cfg(not(debug_assertions))]
            if autostart_marker(handle).is_some_and(|m| !m.exists()) {
                let _ = handle.autolaunch().enable();
            }
            build_tray(handle)?;
            if let Some(widget) = app.get_webview_window(WIDGET) {
                setup_widget(&widget);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == WIDGET && matches!(event, WindowEvent::Destroyed) && !QUITTING.load(Ordering::SeqCst) {
                recreate_widget(window.app_handle().clone());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // 창이 모두 닫혀도(전체 창을 닫거나 위젯이 잠깐 사라져도) 트레이에서 계속 실행
            if let RunEvent::ExitRequested { code, api, .. } = event {
                if code.is_none() && !QUITTING.load(Ordering::SeqCst) {
                    api.prevent_exit();
                }
            }
        });
}
