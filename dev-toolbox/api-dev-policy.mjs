/**
 * Les décisions de `api-dev.mjs`, sans effet de bord — pour être éprouvées
 * par `node --test` sans lancer ni tsc, ni l'API.
 */

/**
 * Le temps qu'un `tsc` laisse un `dist` à moitié écrit. Relancer plus tôt
 * démarrerait sur un build incomplet — c'est ce qui a tué l'API le 2026-10-08.
 */
export const SETTLE_MS = 400;

/** Les délais avant de relancer une API morte seule, puis 30 s indéfiniment. */
export const BACKOFF_MS = Object.freeze([2_000, 5_000, 15_000, 30_000]);

/** Période du chien de garde. */
export const HEALTH_PERIOD_MS = 10_000;

/** Silence toléré — et grâce accordée à un démarrage avant tout jugement. */
export const SILENCE_LIMIT_MS = 60_000;

/** Délai avant de relancer après la `n`-ième mort spontanée consécutive (0 = première). */
export function backoffDelay(consecutiveCrashes) {
  const index = Math.min(Math.max(consecutiveCrashes, 0), BACKOFF_MS.length - 1);
  return BACKOFF_MS[index];
}

/** Un fichier écrit dans un `dist` justifie-t-il une relance ? Seul le JS est exécuté. */
export function isRelevantChange(file) {
  return typeof file === "string" && /\.(c|m)?js$/.test(file);
}

/** tsc a-t-il fini sa première passe ? (`--watch` l'écrit après chaque passe) */
export function isTscReady(line) {
  return line.includes("Watching for file changes");
}

/**
 * Verdict du chien de garde.
 *
 * @returns {"idle" | "grace" | "ok" | "restart"} `idle` sans enfant vivant,
 *   `grace` pendant la première minute d'un démarrage, `restart` après une
 *   minute sans réponse saine.
 */
export function watchdogVerdict({ now, alive, startedAt, lastHealthyAt }) {
  if (!alive) return "idle";
  if (now - startedAt < SILENCE_LIMIT_MS) return "grace";
  const lastSign = Math.max(startedAt, lastHealthyAt ?? 0);
  return now - lastSign >= SILENCE_LIMIT_MS ? "restart" : "ok";
}

/**
 * **Que faire d'une API tombée sur des migrations en attente ?**
 *
 * Elle refuse de démarrer (`persistence.migrations_pending`), et la relance
 * en boucle n'y change rien : la base n'avance pas toute seule. Le 2026-10-10,
 * un lot a laissé une migration non commitée dans l'arbre, et l'API de Hugo
 * tournait toutes les 30 s sans dire quoi faire.
 *
 * - `apply` : la base est locale et TOUTES les migrations en attente sont
 *   commitées et intactes. C'est exactement ce que fait le hook post-commit
 *   (`sync-dev-db-after-git.mjs`) — rattrape un geste git qui l'a sauté.
 * - `wait` : au moins une est non commitée ou retouchée. On ne l'applique PAS :
 *   une migration appliquée en cours d'écriture changerait de somme de contrôle
 *   ensuite, et Prisma refuserait la version finale. On le dit, et on attend.
 * - `retry` : rien d'attendu, ou base non locale — la relance ordinaire.
 */
export function catchUpVerdict({ local, pending, uncommitted }) {
  if (!local || pending.length === 0) return "retry";
  return pending.some((name) => uncommitted.includes(name)) ? "wait" : "apply";
}
