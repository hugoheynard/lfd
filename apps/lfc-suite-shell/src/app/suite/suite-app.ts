import type { Routes } from '@angular/router';

/**
 * Un item du menu d'une app, en **donnée** (pas de chrome). `path` est relatif
 * au point de montage de l'app (`produits` → `/pim/produits`) : c'est le shell
 * qui préfixe, l'app ignore où elle est montée.
 */
export interface SuiteMenuItem {
  readonly label: string;
  readonly icon: string;
  readonly path: string;
}

/**
 * Contrat qu'un **remote** expose à `./app`. Le shell ne connaît que cette
 * forme — il ne dépend d'AUCUN type du remote, et le remote ne dépend d'aucun
 * type du shell (découplage : la forme est structurelle, dupliquée côté remote,
 * pas partagée par un import croisé). Le jour d'un 2ᵉ remote, on extraira ce
 * type dans un `@lfd/suite-contract` — pas avant (pas d'abstraction sur 1 usage).
 */
export interface SuiteRemoteModule {
  readonly routes: Routes;
  readonly menu: readonly SuiteMenuItem[];
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
