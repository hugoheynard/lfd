/**
 * **La carte d'un sous-compte, telle que le lecteur pro la lit**
 * (`documentation/comptes-client/plan-carte-des-sites.md`, § 3.1, § 4).
 *
 * Les valeurs sont écrites ici une fois : l'agrégat qui écrit la carte
 * (`lafoliecoffee/account`) les importe, et un CHECK de la base les tient en
 * seconde ligne.
 */

/** `only` : liste blanche ; `except` : liste noire. */
export const MENU_MODES = ["only", "except"] as const;
export type MenuMode = (typeof MENU_MODES)[number];

/** Ce que voit le sous-compte d'un article hors carte. */
export const OFF_MENU_DISPLAYS = ["hidden", "visible_locked"] as const;
export type OffMenuDisplay = (typeof OFF_MENU_DISPLAYS)[number];

/** Le grain d'une entrée ; le plus fin l'emporte. */
export const MENU_LEVELS = ["family", "product", "sku"] as const;
export type MenuLevel = (typeof MENU_LEVELS)[number];

/** Ce qu'une entrée fait de l'article qu'elle désigne. */
export const MENU_EFFECTS = ["include", "exclude"] as const;
export type MenuEffect = (typeof MENU_EFFECTS)[number];

/** Une entrée lue, sans son identifiant : le jugement n'en a pas besoin. */
export interface MenuReadingEntry {
  readonly level: MenuLevel;
  readonly ref: string;
  readonly effect: MenuEffect;
}

/**
 * La carte qui COMPTE pour une société servie. Lue, pas encore appliquée :
 * le jugement est dans `servedToViewer`.
 */
export interface MenuReading {
  readonly mode: MenuMode;
  readonly offMenu: OffMenuDisplay;
  readonly entries: readonly MenuReadingEntry[];
}

/** La carte telle que la requête la rend, colonnes texte. */
export interface MenuRow {
  readonly mode: string;
  readonly offMenu: string;
  readonly entries: readonly {
    readonly level: string;
    readonly ref: string;
    readonly effect: string;
  }[];
}

function narrow<T extends string>(allowed: readonly T[], value: string): T | undefined {
  return allowed.find((candidate) => candidate === value);
}

/**
 * **La carte compte-t-elle ?** Seulement sous un principal `active` (§ 3.1) :
 * principal suspendu, détaché ou absent, la carte dort en base et le
 * sous-compte commande ce que son rayon lui sert.
 *
 * Une valeur que la carte ne connaît pas (le CHECK l'interdit) rend la carte
 * entière muette plutôt qu'à moitié lue : une liste blanche amputée d'une
 * entrée fermerait un article en silence. Une entrée inconnue, elle, est
 * écartée seule.
 */
export function menuReadingOf(
  row: MenuRow | null,
  activePrincipalId: string | null,
): MenuReading | null {
  if (row === null || activePrincipalId === null) {
    return null;
  }
  const mode = narrow(MENU_MODES, row.mode);
  const offMenu = narrow(OFF_MENU_DISPLAYS, row.offMenu);
  if (mode === undefined || offMenu === undefined) {
    return null;
  }
  const entries = row.entries.flatMap((entry) => {
    const level = narrow(MENU_LEVELS, entry.level);
    const effect = narrow(MENU_EFFECTS, entry.effect);
    return level === undefined || effect === undefined ? [] : [{ level, ref: entry.ref, effect }];
  });
  return { mode, offMenu, entries };
}
