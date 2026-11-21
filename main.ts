// Hand-in program for "Neon Harbor: Vice Run" (make.fun bounty gta6-01, Node 22, standard
// library only). The game itself is the static site under game/ — plain files a desktop
// browser opens offline — and this program delivers it: it copies game/ and screenshots/
// into the output directory and writes dossier.json there with the vendored make.fun
// dossier library, which the gate rebuilds and compares byte for byte.
//
// Run it locally the same way the grader does, with MAKEFUN_OUTPUT_DIR standing in for
// /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The caps below are the gate's own (game/ at most 993 entries and 48 MiB, paths at most
// 1000 bytes, at most 4 screenshots of at most 256 KiB, dossier source text at most
// 160 KiB): buildDossier refuses anything the scorer would refuse, so a clean run here
// means the files are inside every limit.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`Neon Harbor handed in: game/ + screenshots/ + dossier.json (${dossier.length} bytes) in ${outputDir}`);
