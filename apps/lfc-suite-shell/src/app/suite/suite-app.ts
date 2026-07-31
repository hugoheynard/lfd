import type { Routes } from '@angular/router';

/**
 * Contrat qu'un **remote** expose à `./app` : ses `routes` fédérées, rien de
 * plus. Le remote monte SON propre menu dans le content (il n'y a pas de shell
 * imbriqué, juste un nav + outlet) — le shell n'a donc pas à connaître le menu,
 * seulement où brancher les routes.
 *
 * Le shell ne dépend d'AUCUN type du remote, et le remote d'aucun type du shell
 * (découplage : la forme est structurelle, dupliquée côté remote, pas partagée
 * par un import croisé). Au 2ᵉ remote, on extraira ce type dans un
 * `@lfd/suite-contract` — pas avant (pas d'abstraction sur 1 usage).
 */
export interface SuiteRemoteModule {
  readonly routes: Routes;
}

/**
 * Entrée du **registre** d'apps, statique et possédée par le shell. `remoteName`
 * absent = tuile **stub** (app pas encore construite) : le switcher la montre,
 * le montage affiche « bientôt disponible ». `remoteName` présent = clé dans le
 * `federation.manifest.json` → URL du `remoteEntry.json`.
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
  /** Clé Native Federation du remote ; absent ⇒ stub. */
  readonly remoteName?: string;
  /** Module exposé par le remote (défaut `./app`). */
  readonly exposedModule?: string;
}
