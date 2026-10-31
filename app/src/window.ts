import { emitTo } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toDateKey } from "./dates";

export const MAIN_LABEL = "main";
export const GOTO_DATE_EVENT = "goto-date";

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

/** 앱 종료: 전체 창이 열려 있으면 함께 닫는다 */
export async function closeApp() {
  const main = await WebviewWindow.getByLabel(MAIN_LABEL);
  if (main) await main.destroy();
  await getCurrentWindow().close();
}
