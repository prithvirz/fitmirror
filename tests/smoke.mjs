// Smoke test: is the try-on engine up and does it still expose /tryon? Run: node tests/smoke.mjs
const SPACE = "yisol/IDM-VTON";
const fail = m => { console.error("FAIL:", m); process.exit(1); };
const info = await (await fetch(`https://huggingface.co/api/spaces/${SPACE}`)).json();
if (info.runtime?.stage !== "RUNNING") fail(`Space stage is ${info.runtime?.stage}`);
const cfg = await (await fetch(`https://${SPACE.replace("/", "-").toLowerCase()}.hf.space/config`)).json();
if (!cfg.dependencies.some(d => d.api_name === "tryon")) fail("endpoint /tryon missing");
const html = await (await import("node:fs/promises")).readFile(new URL("../index.html", import.meta.url), "utf8");
if (!html.includes(`Client.connect("${SPACE}"`)) fail("index.html does not use " + SPACE);
console.log("OK: Space running, /tryon present, index.html matches");
