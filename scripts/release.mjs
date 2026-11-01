// 새 버전을 GitHub Releases에 올린다. 설치된 앱은 latest.json을 보고 자동 업데이트한다.
//
// 사용법 (저장소 루트에서, 먼저 app/src-tauri/tauri.conf.json의 version을 올리고 서명된 빌드를 마친 뒤):
//   node scripts/release.mjs "이번 버전에서 바뀐 점"
//
// GitHub 토큰은 GITHUB_TOKEN 환경 변수, 없으면 git에 저장된 github.com 자격 증명을 쓴다.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

const REPO = "yde5536/URIGG-ClaudeCalender";
const API = `https://api.github.com/repos/${REPO}`;

const conf = JSON.parse(readFileSync("app/src-tauri/tauri.conf.json", "utf8"));
const version = conf.version;
const tag = `v${version}`;
const notes = process.argv[2] ?? `${tag} 업데이트`;

const nsisDir = "app/src-tauri/target/release/bundle/nsis";
const installer = readdirSync(nsisDir).find((f) => f.includes(`_${version}_`) && f.endsWith("-setup.exe"));
if (!installer) throw new Error(`${nsisDir}에 ${version} 설치 파일이 없습니다. 먼저 빌드하세요.`);
const installerPath = join(nsisDir, installer);
const signature = readFileSync(`${installerPath}.sig`, "utf8").trim();

function gitToken() {
  const out = execFileSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\n\n" }).toString();
  const line = out.split("\n").find((l) => l.startsWith("password="));
  if (!line) throw new Error("git에 저장된 GitHub 자격 증명이 없습니다. GITHUB_TOKEN을 설정하세요.");
  return line.slice("password=".length).trim();
}
const token = process.env.GITHUB_TOKEN || gitToken();

async function gh(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${url} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const existing = await fetch(`${API}/releases/tags/${tag}`, { headers: { Authorization: `Bearer ${token}` } });
if (existing.ok) throw new Error(`${tag} 릴리스가 이미 있습니다. tauri.conf.json의 version을 올리세요.`);

const release = await gh(`${API}/releases`, {
  method: "POST",
  body: JSON.stringify({ tag_name: tag, target_commitish: "main", name: tag, body: notes }),
});

const assetUrl = (name) => `https://github.com/${REPO}/releases/download/${tag}/${encodeURIComponent(name)}`;
const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: { "windows-x86_64": { signature, url: assetUrl(installer) } },
};

async function upload(name, body, contentType) {
  const url = release.upload_url.replace(/\{.*\}$/, `?name=${encodeURIComponent(name)}`);
  await gh(url, { method: "POST", headers: { "Content-Type": contentType }, body });
  console.log(`  올림: ${name}`);
}

console.log(`${tag} 릴리스 생성`);
await upload(basename(installerPath), readFileSync(installerPath), "application/octet-stream");
await upload(`${installer}.sig`, signature, "text/plain");
await upload("latest.json", JSON.stringify(latest, null, 2), "application/json");
console.log(`완료: ${release.html_url}`);
