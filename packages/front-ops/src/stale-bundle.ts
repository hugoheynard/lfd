/**
 * **Reconnaître un onglet resté sur une version retirée.**
 *
 * Un front Angular charge ses écrans en morceaux dont le nom change à chaque
 * build. Cloudflare Pages ne sert que les fichiers du déploiement COURANT : un
 * onglet ouvert avant un déploiement demande un morceau qui n'existe plus, et
 * reçoit la page d'accueil à la place d'un script. L'import échoue, l'écran ne
 * s'ouvre pas, et rien n'atteint ni l'API ni Auth0 — le 2026-09-28, un
 * administrateur s'est dit « bloqué » sans qu'aucun journal n'en garde trace.
 *
 * Seul le navigateur le sait, et chaque moteur le dit avec ses mots : on les
 * reconnaît tous plutôt que d'en supposer un.
 */
const STALE_BUNDLE_MESSAGES: readonly string[] = [
  // Chromium (Chrome, Edge) — y compris quand le « script » reçu est du HTML.
  "Failed to fetch dynamically imported module",
  // Firefox.
  "error loading dynamically imported module",
  // Safari.
  "Importing a module script failed",
];

/** Vrai quand l'erreur est l'échec de chargement d'un morceau de l'application. */
export function isStaleBundleError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : null;
  return message !== null && STALE_BUNDLE_MESSAGES.some((known) => message.includes(known));
}

/**
 * L'intervalle sous lequel on ne recharge PAS une seconde fois.
 *
 * Si le rechargement ne répare pas — le morceau manque aussi dans la version
 * servie, ou le réseau est coupé —, recharger encore ferait une boucle infinie
 * qui rend la page inutilisable. Une fois suffit ; la seconde erreur remonte
 * normalement, et Sentry la voit.
 */
export const RELOAD_GUARD_MS = 10_000;

/** La clé, en `sessionStorage`, de l'instant du dernier rechargement. */
export const RELOAD_GUARD_KEY = "lfd.stale-bundle-reload-at";

/** Ce que la décision lit et écrit — injecté pour être testable sans navigateur. */
export interface ReloadGuardStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Recharger maintenant ? Et, si oui, noter l'instant.
 *
 * Un stockage qui refuse (navigation privée stricte) vaut « jamais rechargé » en
 * lecture, et l'écriture ratée n'empêche pas le rechargement : on préfère un
 * rechargement de trop à un onglet mort. La boucle reste impossible au pire
 * cas, parce qu'une page rechargée sur la bonne version ne relève plus l'erreur.
 */
export function shouldReload(store: ReloadGuardStore | null, nowMs: number): boolean {
  const last = readLast(store);
  if (last !== null && nowMs - last < RELOAD_GUARD_MS) {
    return false;
  }
  try {
    store?.setItem(RELOAD_GUARD_KEY, String(nowMs));
  } catch {
    // Stockage refusé : on recharge quand même, voir plus haut.
  }
  return true;
}

function readLast(store: ReloadGuardStore | null): number | null {
  try {
    const raw = store?.getItem(RELOAD_GUARD_KEY) ?? null;
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
