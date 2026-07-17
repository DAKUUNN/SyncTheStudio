#!/usr/bin/env node
/** One-command release: `npm run release -- 5.2.5`
 *
 *  Bumps the version everywhere it has to stay in sync (package.json,
 *  src-tauri/tauri.conf.json, src-tauri/gen/apple/project.yml), commits
 *  as "release: vX.Y.Z", tags and pushes — the tag push triggers the
 *  GitHub Actions release workflow (.github/workflows/release.yml). */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: npm run release -- <version>   (e.g. npm run release -- 5.2.5)");
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { stdio: "pipe" }).toString().trim();

if (run("git status --porcelain")) {
  console.error("Working tree is not clean — commit or stash your changes first.");
  process.exit(1);
}
if (run(`git tag -l v${version}`)) {
  console.error(`Tag v${version} already exists.`);
  process.exit(1);
}

const bumpJson = (path) => {
  const data = JSON.parse(readFileSync(path, "utf8"));
  data.version = version;
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  console.log(`✓ ${path} → ${version}`);
};
bumpJson("package.json");
bumpJson("src-tauri/tauri.conf.json");

const ymlPath = "src-tauri/gen/apple/project.yml";
const yml = readFileSync(ymlPath, "utf8")
  .replace(/CFBundleShortVersionString: .*/g, `CFBundleShortVersionString: ${version}`)
  .replace(/CFBundleVersion: .*/g, `CFBundleVersion: "${version}"`);
writeFileSync(ymlPath, yml);
console.log(`✓ ${ymlPath} → ${version}`);

run(`git add package.json src-tauri/tauri.conf.json ${ymlPath}`);
run(`git commit -m "release: v${version}"`);
run(`git tag v${version}`);
console.log(`✓ committed and tagged v${version}`);

execSync("git push", { stdio: "inherit" });
execSync(`git push origin v${version}`, { stdio: "inherit" });
console.log(`\n🚀 v${version} pushed — GitHub Actions is building the release now.`);
console.log("   Track it: gh run watch");
