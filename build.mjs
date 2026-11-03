// Builds the app into ./dist (no Vite needed): node build.mjs
import { build } from "esbuild";
import { rm, mkdir, cp, readFile, writeFile } from "node:fs/promises";
await rm("dist", { recursive: true, force: true }); await mkdir("dist", { recursive: true });
const r = await build({
  entryPoints: ["main.jsx"], bundle: true, minify: true, format: "esm", target: "es2020", outdir: "dist", entryNames: "app-[hash]",
  loader: { ".jsx": "jsx" }, define: { "process.env.NODE_ENV": '"production"', "import.meta.env.PROD": "true" }, metafile: true, legalComments: "none", logLevel: "warning",
});
const js = Object.keys(r.metafile.outputs).find((f) => f.endsWith(".js")).split("/").pop();
let html = await readFile("index.html", "utf8");
html = html.replace('<script type="module" src="/main.jsx"></script>', `<script type="module" src="./${js}"></script>`);
await writeFile("dist/index.html", html);
for (const f of ["sw.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"]) await cp(f, `dist/${f}`);
console.log("built dist/ with", js);
