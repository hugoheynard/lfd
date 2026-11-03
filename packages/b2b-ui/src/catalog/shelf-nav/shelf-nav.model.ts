import type { LevelState } from '../shelf-tree';

/**
 * Les mots du rail — chaque front passe les siens : la boutique ceux de la
 * langue du visiteur, le back-office les siens en français. Un `{shelf}` se
 * passe en argument plutôt qu'en gabarit à remplir : le rail n'a pas à savoir
 * comment un front interpole ses textes.
 */
export interface CatalogShelfNavLabels {
  /** Le nom du groupe de pastilles, pour les lecteurs d'écran. */
  readonly group: string;
  /** La pastille qui est la famille elle-même, en tête de son niveau (« Tout »). */
  readonly all: string;
  /** Le premier maillon du fil d'Ariane. */
  readonly root: string;
  /** La pastille de tête d'un niveau dont la parente est la tête. */
  readonly climbToRoot: string;
  readonly climbTo: (shelf: string) => string;
  /** Le nom d'un niveau, pour les lecteurs d'écran. */
  readonly level: (shelf: string) => string;
  /** Une pastille qui plonge : son nom et son nombre de sous-familles. */
  readonly withChildren: (shelf: string, children: number) => string;
}

/** Un article tel que le rail le compte : le rayon où il est rangé. */
export interface ShelfCounted {
  readonly shelfId: string;
}

/** Une pastille d'un niveau. */
export interface ChipView {
  readonly id: string;
  readonly label: string;
  /** Les articles du sous-arbre — `null` pour ce qui n'est pas une famille. */
  readonly count: number | null;
  readonly on: boolean;
  /** Elle a des enfants : la choisir fait plonger. */
  readonly drill: boolean;
  readonly ariaLabel: string | null;
  /** Le délai d'entrée, en ms — nul hors du niveau affiché (SPEC §5.4). */
  readonly delay: number;
}

/** Un niveau du rail, monté en permanence (SPEC §2). */
export interface LevelView {
  readonly id: string;
  readonly state: LevelState;
  readonly nested: boolean;
  /** Un niveau de premier rang : sa famille n'a pas de parente. */
  readonly top: boolean;
  readonly label: string;
  readonly ariaLabel: string;
  readonly count: number;
  readonly climbTo: string;
  readonly climbLabel: string;
  readonly crumbs: readonly { readonly id: string; readonly label: string }[];
  readonly chips: readonly ChipView[];
}
