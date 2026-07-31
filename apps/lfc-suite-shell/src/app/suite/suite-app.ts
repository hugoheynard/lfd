/**
 * Entrée du **registre** d'apps, statique et possédée par le shell.
 *
 * Modèle **iframe** : chaque app tourne telle quelle (son propre `fold-app-shell`,
 * ses panels, son scroll) dans un cadre — standalone === embarqué. Le shell ne
 * fournit que le **switcher** (rail primaire) et le cadre. `appUrl` absent =
 * tuile **stub** (app pas encore construite).
 */
export interface SuiteAppEntry {
  /** Identité stable de l'app. */
  readonly id: string;
  /** Libellé du switcher (rail primaire). */
  readonly title: string;
  /** Icône fold du switcher. */
  readonly icon: string;
  /** 1er segment de route où l'app est montée (`pim` → `/pim/**`). */
  readonly routePath: string;
  /**
   * URL de base de l'app à charger en iframe ; **absent ⇒ tuile stub**. L'app
   * détecte elle-même qu'elle est embarquée (`window.self !== window.top`) et
   * baisse son rail de `primary` à `secondary` — la hiérarchie lit alors
   * *primary = switcher suite, secondary = menu de l'app*.
   */
  readonly appUrl?: string;
}
