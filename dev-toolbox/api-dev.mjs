/**
 * Lance l'API de dev, la tient à jour, et la relève quand elle tombe.
 *
 * Remplace `nest start --watch` et son compagnon
 * `restart-api-on-package-build.mjs` (supprimé le 2026-10-08).
 *
 * ## Le 2026-10-08
 *
 * Le compagnon touchait `src/main.ts` quand un `packages/*\/dist` était
 * reconstruit, pour que Nest recompile et relance. Ce matin-là, un paquet a été
 * vu à moitié écrit, la compilation de Nest est tombée en erreur — et **Nest ne
 * relance pas après une compilation en erreur**. Toucher `main.ts` n'y changeait
 * plus rien, `dist/main.js` n'était plus réémis : l'API était morte, et rien ne
 * le disait. Le front recevait des refus de connexion qu'on aurait cherchés
 * partout ailleurs.
 *
 * ## Ce que ce script fait à la place
 *
 * 1. `tsc --watch` émet `dist/` **même en présence d'erreurs de type**
 *    (`noEmitOnError` n'est pas posé, vérifié le 2026-10-08) : une erreur de
 *    type s'affiche, elle ne bloque plus l'application.
 * 2. Node exécute `dist/main.js` ; il est relancé quand un `.js` change dans
 *    `apps/lfd-api/dist` ou dans un `packages/*\/dist` — après un calme de
 *    `SETTLE_MS`, pour ne jamais démarrer sur un build à moitié écrit. Un
 *    paquet dont le `dist` apparaît plus tard est pris aussi.
 * 3. Une API morte seule est relancée (2 s, 5 s, 15 s, puis 30 s) ; un
 *    changement de fichier remet le compteur à zéro. **Sauf si c'est la base
 *    qui est en retard** (depuis le 2026-10-10) : une migration commitée en
 *    attente est appliquée à la base locale, une migration non commitée est
 *    nommée avec la commande à lancer, et la relance en boucle s'arrête.
 * 4. Un chien de garde interroge `/health` toutes les 10 s, et relance une API
 *    vivante mais muette depuis une minute.
 * 5. Les tâches périodiques que le Worker joue en production (arrêt du plan,
 *    boîte d'envoi, impayés…) sont rejouées au même rythme, avec un jeton
 *    passé à l'API au démarrage (`dev-sweeps.mjs`, depuis le 2026-11-02).
 *    `LFD_DEV_SWEEPS=0` les coupe.
 * 6. `Ctrl-C` / `SIGTERM` tuent tsc et Node : aucun orphelin (cf. l'en-tête de
 *    `dev-stack.sh`, et ses sept compagnons du 2026-09-10).
 *
 * Les décisions vivent dans `api-dev-policy.mjs`, testées par
 * `node --test dev-toolbox/__tests__/api-dev.test.mjs`.
 */
import { spawn, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  HEALTH_PERIOD_MS,
  SETTLE_MS,
  backoffDelay,
  catchUpVerdict,
  isRelevantChange,
  isTscReady,
  watchdogVerdict,
} from "./api-dev-policy.mjs";
import {
  DEV_DB_RETRY,
  applyMigrations,
  databaseIsLocal,
  pendingMigrations,
  postgresReady,
  uncommittedMigrations,
} from "./dev-db.mjs";
import {
  EVERY_FIVE_MINUTES,
  EVERY_HOUR,
  dueSweeps,
  unclassifiedWorkerPaths,
} from "./dev-sweeps.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = join(ROOT, "apps", "lfd-api");
const API_DIST = join(API, "dist");
const PACKAGES = join(ROOT, "packages");
const TSC = join(API, "node_modules", ".bin", "tsc");
const PORT = 3200;
const HEALTH_URL = `http://localhost:${String(PORT)}/health`;
const HEALTH_TIMEOUT_MS = 5_000;
const KILL_GRACE_MS = 5_000;
const DIST_SCAN_MS = 5_000;
const API_URL = `http://localhost:${String(PORT)}`;
const WORKER_SOURCE = join(API, "container", "worker.ts");
const SWEEP_CHECK_MS = 30_000;
const SWEEP_TIMEOUT_MS = 60_000;
const SWEEPS_ON = process.env.LFD_DEV_SWEEPS !== "0";
/**
 * Le jeton des routes machine : celui de l'environnement s'il existe, sinon un
 * jeton de session. Passé à l'API dans son environnement, il l'emporte sur les
 * fichiers `.env` (ConfigModule ne remplace pas une variable déjà posée).
 */
const SWEEP_TOKEN = process.env.RECOMPUTE_TOKEN?.trim() || randomUUID();

const say = (line) => console.log(`[api-dev] ${line}`);

// ─── État ────────────────────────────────────────────────────────────────────
let tsc = null;
let app = null; // { child, startedAt, lastHealthyAt, expected }
let tscReady = false;
let crashes = 0;
let settleTimer = null;
let retryTimer = null;
let stopping = false;
const watchers = new Map();

// ─── Préparation : le port et le dist, comme `free-port` et `deleteOutDir` ──
function freePort() {
  try {
    execSync(`lsof -ti:${String(PORT)} | xargs kill 2>/dev/null; true`, {
      stdio: "ignore",
      shell: "/bin/bash",
    });
  } catch {
    // Rien sur le port : le cas normal.
  }
}

// ─── L'application ───────────────────────────────────────────────────────────
function startApp(reason) {
  clearTimeout(retryTimer);
  retryTimer = null;
  if (stopping) return;
  if (!existsSync(join(API_DIST, "main.js"))) {
    say("dist/main.js absent — attente de tsc.");
    return;
  }
  if (reason) say(reason);
  const child = spawn(process.execPath, ["--enable-source-maps", "dist/main.js"], {
    cwd: API,
    stdio: "inherit",
    env: { ...process.env, RECOMPUTE_TOKEN: SWEEP_TOKEN },
  });
  const current = { child, startedAt: Date.now(), lastHealthyAt: null, expected: false };
  app = current;
  child.on("exit", (code, signal) => onAppExit(current, code, signal));
}

function onAppExit(current, code, signal) {
  if (app === current) app = null;
  if (current.expected || stopping) return;
  const how = signal ? `signal ${signal}` : `code ${String(code)}`;
  void catchUpThenRetry(how);
}

/**
 * Avant de relancer une API tombée, regarde si c'est la base qui est en
 * retard (`catchUpVerdict`). Une migration commitée qu'un geste git a sautée
 * est appliquée ici ; une migration en cours d'écriture ne l'est jamais — on
 * le dit, et on attend que le fichier change ou soit commité (le hook
 * post-commit l'appliquera, puis la régénération du client relancera l'API).
 */
async function catchUpThenRetry(how) {
  const pending = (await postgresReady()) ? await pendingMigrations().catch(() => []) : [];
  const uncommitted =
    pending.length > 0 ? await uncommittedMigrations(pending).catch(() => pending) : [];
  const verdict = catchUpVerdict({ local: databaseIsLocal(), pending, uncommitted });
  if (stopping) return;
  if (verdict === "wait") {
    say(
      `✋ API arrêtée (${how}) : la base de dev attend ${uncommitted.join(", ")}, ` +
        "pas encore commitée — elle n'est pas appliquée d'office (une migration en cours " +
        "d'écriture changerait de somme de contrôle). Commitez-la, ou si elle est finie : " +
        `${DEV_DB_RETRY}. L'API repart au prochain changement.`,
    );
    return;
  }
  if (verdict === "apply") {
    say(
      `↻ API arrêtée (${how}) : migrations commitées en attente (${pending.join(", ")}) — appliquées à la base de dev.`,
    );
    try {
      await applyMigrations();
      crashes = 0;
      startApp("base de dev rattrapée, relance");
    } catch (error) {
      const said = String(error?.stderr || error?.message || error)
        .split("\n")
        .slice(-4)
        .join("\n");
      say(`✖ rattrapage de la base refusé :\n${said}\nÀ relancer : ${DEV_DB_RETRY}`);
    }
    return;
  }
  const delay = backoffDelay(crashes);
  crashes += 1;
  say(`API arrêtée seule (${how}) — relance dans ${String(delay / 1000)} s.`);
  retryTimer = setTimeout(() => startApp("relance après arrêt"), delay);
}

/** Arrête l'API courante et attend sa fin (SIGKILL passé le délai de grâce). */
function stopApp() {
  const current = app;
  app = null;
  if (!current || current.child.exitCode !== null || current.child.signalCode !== null)
    return Promise.resolve();
  current.expected = true;
  return new Promise((done) => {
    const force = setTimeout(() => current.child.kill("SIGKILL"), KILL_GRACE_MS);
    current.child.once("exit", () => {
      clearTimeout(force);
      done();
    });
    current.child.kill("SIGTERM");
  });
}

async function restartApp(reason) {
  clearTimeout(retryTimer);
  retryTimer = null;
  await stopApp();
  startApp(reason);
}

// ─── Les changements de build ────────────────────────────────────────────────
function onBuildChange(source) {
  if (!tscReady) return; // la première passe de tsc lance l'API elle-même
  crashes = 0;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    void restartApp(`↻ ${source} reconstruit — API relancée.`);
  }, SETTLE_MS);
}

function watchDist(dir, source) {
  if (watchers.has(dir) || !existsSync(dir)) return;
  try {
    // `recursive` : un build émet dans des sous-dossiers, et c'est le dernier
    // fichier écrit qui compte.
    const watcher = watch(dir, { recursive: true }, (_event, file) => {
      if (isRelevantChange(file)) onBuildChange(source);
    });
    // Un dist supprimé (un `clean`) ferme son observateur ; le balayage
    // périodique le rattache quand il réapparaît.
    watcher.on("error", () => {
      watcher.close();
      watchers.delete(dir);
    });
    watchers.set(dir, watcher);
  } catch {
    // Disparu entre l'existence et l'observation : le prochain balayage s'en charge.
  }
}

function scanPackageDists() {
  if (!existsSync(PACKAGES)) return;
  for (const entry of readdirSync(PACKAGES, { withFileTypes: true })) {
    if (entry.isDirectory()) watchDist(join(PACKAGES, entry.name, "dist"), entry.name);
  }
  for (const dir of watchers.keys()) {
    if (!existsSync(dir)) {
      watchers.get(dir)?.close();
      watchers.delete(dir);
    }
  }
}

// ─── tsc ─────────────────────────────────────────────────────────────────────
function startTsc() {
  tsc = spawn(TSC, ["-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput"], {
    cwd: API,
    stdio: ["ignore", "pipe", "inherit"],
  });
  createInterface({ input: tsc.stdout }).on("line", (line) => {
    console.log(line);
    if (!tscReady && isTscReady(line)) {
      tscReady = true;
      watchDist(API_DIST, "lfd-api");
      startApp("▶ première compilation terminée — API lancée.");
    }
  });
  tsc.on("exit", (code, signal) => {
    if (stopping) return;
    say(
      `✗ tsc s'est arrêté (${signal ?? `code ${String(code)}`}) — plus aucune recompilation. Relancez la pile.`,
    );
    void shutdown(1);
  });
}

// ─── Le chien de garde ───────────────────────────────────────────────────────
async function probe() {
  const current = app;
  if (!current) return;
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (res.ok) current.lastHealthyAt = Date.now();
  } catch {
    // Muet : c'est le verdict qui décide, pas une sonde isolée.
  }
  if (app !== current) return;
  const alive = current.child.exitCode === null && current.child.signalCode === null;
  const verdict = watchdogVerdict({
    now: Date.now(),
    alive,
    startedAt: current.startedAt,
    lastHealthyAt: current.lastHealthyAt,
  });
  if (verdict === "restart") await restartApp("⚠ API muette depuis 60 s — relancée.");
}

// ─── Les tâches périodiques de la production ─────────────────────────────────
const lastSweep = { fiveMinutes: null, hour: null };
let sweeping = false;

async function postSweep(path) {
  try {
    const res = await fetch(`${API_URL}/${path}`, {
      method: "POST",
      headers: { "x-lfc-recompute-token": SWEEP_TOKEN },
      signal: AbortSignal.timeout(SWEEP_TIMEOUT_MS),
    });
    if (!res.ok) say(`⚠ tâche ${path} : HTTP ${String(res.status)}`);
    else if (path === "admin/production/auto-close") await sayAutoClose(res);
  } catch (error) {
    say(`⚠ tâche ${path} : ${String(error?.message ?? error)}`);
  }
}

/** L'arrêt du plan ne se tait que quand il n'a rien fait. */
async function sayAutoClose(res) {
  const report = await res.json().catch(() => null);
  const acted = [report?.outcome, report?.todayOutcome].filter((o) => o && o !== "nothing");
  if (acted.length > 0 || report?.todayOverdue) {
    say(`arrêt du plan : ${JSON.stringify(report)}`);
  }
}

/** Une passe à la fois, et seulement sur une API qui répond. */
async function runDueSweeps() {
  const current = app;
  if (sweeping || !current || current.lastHealthyAt === null) return;
  sweeping = true;
  try {
    const now = Date.now();
    const due = dueSweeps(now, lastSweep);
    // L'heure se compte dès la première passe : elle part au premier
    // changement d'heure, pas au démarrage.
    if (lastSweep.hour === null || due.includes("hour")) lastSweep.hour = now;
    if (due.includes("fiveMinutes")) lastSweep.fiveMinutes = now;
    for (const cadence of due) {
      const paths = cadence === "fiveMinutes" ? EVERY_FIVE_MINUTES : EVERY_HOUR;
      for (const path of paths) await postSweep(path);
    }
  } finally {
    sweeping = false;
  }
}

function warnUnclassifiedSweeps() {
  try {
    const unknown = unclassifiedWorkerPaths(readFileSync(WORKER_SOURCE, "utf8"));
    if (unknown.length > 0) {
      say(
        `⚠ le Worker appelle ${unknown.join(", ")}, que dev-sweeps.mjs ne range nulle part — ` +
          "rejouée en dev ou écartée avec sa raison ?",
      );
    }
  } catch {
    // Le Worker déplacé : le test de dev-sweeps le dira.
  }
}

// ─── Sortie ──────────────────────────────────────────────────────────────────
async function shutdown(exitCode) {
  if (stopping) return;
  stopping = true;
  clearTimeout(settleTimer);
  clearTimeout(retryTimer);
  for (const watcher of watchers.values()) watcher.close();
  tsc?.kill("SIGTERM");
  await stopApp();
  process.exit(exitCode);
}

process.on("SIGINT", () => void shutdown(130));
process.on("SIGTERM", () => void shutdown(143));
process.on("SIGHUP", () => void shutdown(129));
// Dernier filet, synchrone : quelle que soit la sortie, aucun enfant ne survit.
process.on("exit", () => {
  tsc?.kill("SIGKILL");
  app?.child.kill("SIGKILL");
});

if (!existsSync(TSC)) {
  say(`✗ tsc introuvable : ${TSC} — lancez \`pnpm install\`.`);
  process.exit(1);
}
freePort();
// `maxRetries` : un `tsc` d'une session précédente, tué juste avant par le
// balayage de `dev-stack.sh`, peut encore écrire un fichier pendant la purge —
// `rmdir` lève alors ENOTEMPTY et le lanceur mourait au démarrage (2026-10-08).
rmSync(API_DIST, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
mkdirSync(API_DIST, { recursive: true });
startTsc();
scanPackageDists();
setInterval(scanPackageDists, DIST_SCAN_MS).unref();
setInterval(() => void probe(), HEALTH_PERIOD_MS).unref();
if (SWEEPS_ON) {
  warnUnclassifiedSweeps();
  setInterval(() => void runDueSweeps(), SWEEP_CHECK_MS).unref();
}
