import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toDateKey } from "./dates";

export const MAIN_LABEL = "main";
export const GOTO_DATE_EVENT = "goto-date";
/** 트레이 아이콘이나 두 번째 실행에서 보내는 "전체 창 열기" (lib.rs와 같은 이름) */
export const OPEN_MAIN_EVENT = "open-main";

export const isMainWindow = () => getCurrentWindow().label === MAIN_LABEL;

/** 전체 창을 열고(이미 열려 있으면 앞으로) 해당 날짜로 이동 */
export async function openMainWindow(date?: Date) {
  const key = date ? toDateKey(date) : undefined;
  const existing = await WebviewWindow.getByLabel(MAIN_LABEL);
  if (existing) {
    await existing.unminimize();
    await existing.show();
    await existing.setFocus();
    if (key) await emitTo(MAIN_LABEL, GOTO_DATE_EVENT, key);
    return;
  }
  new WebviewWindow(MAIN_LABEL, {
    url: key ? `index.html#date=${key}` : "index.html",
    title: "코워크 캘린더",
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    center: true,
  });
}

/** 위젯 오른쪽 아래 손잡이로 크기 조절 (바탕화면에 넣은 위젯은 가장자리 조절이 안 된다) */
export const startWidgetResize = () => getCurrentWindow().startResizeDragging("SouthEast");

/** 앱 종료. 창만 닫으면 트레이에 남거나 위젯이 다시 뜨므로 Rust 쪽에서 종료한다. */
export const closeApp = () => invoke("quit_app");
