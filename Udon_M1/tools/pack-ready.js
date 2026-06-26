const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const projectRoot = path.resolve(rootDir, '..');
const outFile = path.join(projectRoot, 'Udon_M1-ready.zip');

const runtimeDirs = ['memory-test', 'memory-api-test', 'memory-smoke', 'memory-debug', 'memory-eval'];
for (const dir of runtimeDirs) {
  const full = path.join(rootDir, dir);
  if (fs.existsSync(full)) fs.rmSync(full, { recursive: true, force: true });
}

const runtimeFiles = [
  path.join(rootDir, 'memory', 'answerCache.json')
];
for (const file of runtimeFiles) {
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
}

if (fs.existsSync(outFile)) fs.rmSync(outFile, { force: true });

const command = [
  'Compress-Archive',
  '-Path',
  `"${path.join(rootDir, '*')}"`,
  '-DestinationPath',
  `"${outFile}"`,
  '-Force'
].join(' ');

const result = spawnSync('powershell', ['-NoProfile', '-Command', command], {
  stdio: 'inherit'
});
if (result.status !== 0) process.exit(result.status || 1);

const stat = fs.statSync(outFile);
console.log(JSON.stringify({ ok: true, outFile, bytes: stat.size }, null, 2));
