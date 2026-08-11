import { SUITE_APP_URLS } from "./suite-config";

/**
 * Entrée du **registre** d'apps, statique et possédée par le shell.
 *
 * Modèle **iframe** : chaque app tourne telle quelle (son `fold-app-shell`, ses
 * panels, son scroll). Le shell ne fournit que le switcher + le cadre. L'URL de
 * l'app n'est PAS ici (elle dépend de l'environnement) — elle vit dans
 * `suite-config(.dev).ts` et se résout par `appUrlFor(id)`. Pas d'URL pour un id
 * ⇒ **tuile stub** (app pas encore déployée).
 */
export interface SuiteAppEntry {
  /** Identité stable de l'app — clé dans `SUITE_APP_URLS`. */
  readonly id: string;
  /** Libellé du switcher (rail primaire). */
  readonly title: string;
  /** Icône fold du switcher. */
  readonly icon: string;
  /** 1er segment de route où l'app est montée (`pim` → `/pim/**`). */
  readonly routePath: string;
  /**
   * Permission d'**entitlement** requise pour voir la tuile (claim `permissions`
   * du jeton `api-suite`, ex. `app:pim`). Le launcher masque l'app si le staff ne
   * l'a pas. C'est de l'UX : le vrai mur reste le backend enfant (RBAC + guard).
   * `undefined` ⇒ visible par tout staff authentifié.
   */
  readonly requiredPermission?: string;
}

/** URL de base de l'app (env-résolue) ; `undefined` ⇒ stub. */
export function appUrlFor(id: string): string | undefined {
  return SUITE_APP_URLS[id];
}

/** Origine (scheme://host:port) d'une URL, ou `null` si non parsable. */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * **Allowlist d'origines** du bridge postMessage : le shell ne répond QU'aux
 * origines des apps déclarées. Dérivée de `SUITE_APP_URLS` — une seule source.
 */
export const SUITE_ALLOWED_ORIGINS: ReadonlySet<string> = new Set(
  Object.values(SUITE_APP_URLS)
    .map(originOf)
    .filter((o): o is string => o !== null),
);
