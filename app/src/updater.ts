import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

const CHECK_INTERVAL = 6 * 60 * 60_000;

/** GitHub Releases에 새 버전이 있으면 내려받아 설치하고 다시 시작한다. 개발 모드에서는 건너뛴다. */
async function updateIfAvailable() {
  try {
    const update = await check();
    if (!update) return;
    await update.downloadAndInstall();
    await relaunch();
  } catch (err) {
    // 오프라인이거나 릴리스가 아직 없으면 다음 확인 때 다시 시도
    console.warn("update check failed", err);
  }
}

/** 시작 직후 잠시 뒤 한 번, 이후 6시간마다 확인. 정리 함수를 돌려준다. */
export function startAutoUpdate(): () => void {
  if (import.meta.env.DEV) return () => {};
  const first = setTimeout(updateIfAvailable, 15_000);
  const timer = setInterval(updateIfAvailable, CHECK_INTERVAL);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
