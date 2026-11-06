/**
 * `pnpm lint:watch` : relance les portes dont un motif `watch` vient d'être
 * touché, après une accalmie. `fs.watch` récursif, sans dépendance — Node le
 * sait sur macOS comme sur Linux depuis la version 20.
 *
 * Un lot de changements qui arrive PENDANT qu'une passe tourne n'est pas
 * perdu : il attend la fin, puis déclenche la passe suivante.
 */
import { watch } from "node:fs";

import { gatesTouchedBy, summary } from "./catalogue.mjs";

/** Le délai sans écriture avant de relancer : un enregistrement d'IDE en fait plusieurs. */
export const QUIET_MS = 400;

const IGNORED =
  /(^|\/)(node_modules|\.git|dist|\.angular|\.turbo|\.wrangler|coverage|graphify-out|\.idea)(\/|$)|^apps\/lfd-api\/src\/platform\/database\/client\//u;

/** Vrai si un chemin relatif ne doit jamais déclencher de porte. */
export function ignoredPath(path) {
  return IGNORED.test(path);
}

/**
 * Surveille `root` et lance `runGate(gate)` (qui rend `{ name, ok }`) pour
 * chaque porte concernée. Rend une fonction d'arrêt.
 */
export function watchGates(root, gates, runGate, log = console.log) {
  const pending = new Set();
  let timer = null;
  let running = false;

  async function flush() {
    timer = null;
    if (running || pending.size === 0) return;
    const paths = [...pending];
    pending.clear();
    const touched = gatesTouchedBy(paths, gates);
    if (touched.length === 0) return;
    running = true;
    log(
      `\n↻ ${paths.length} fichier(s) touché(s) — ${touched.map((gate) => gate.name).join(", ")}`,
    );
    const results = [];
    for (const gate of touched) results.push(await runGate(gate));
    log(summary(results));
    running = false;
    if (pending.size > 0) schedule();
  }

  function schedule() {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => void flush(), QUIET_MS);
  }

  const watcher = watch(root, { recursive: true }, (_event, filename) => {
    if (filename === null) return;
    const path = filename.split("\\").join("/");
    if (ignoredPath(path)) return;
    pending.add(path);
    schedule();
  });
  log(`◉ lint:watch — ${gates.length} portes en veille sur ${root} (Ctrl-C pour arrêter).`);
  return () => {
    if (timer !== null) clearTimeout(timer);
    watcher.close();
  };
}
