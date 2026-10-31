import { getCurrentWindow } from "@tauri-apps/api/window";

// 위젯이 유일한 창이므로 닫으면 앱이 종료된다
export const closeApp = () => getCurrentWindow().close();
