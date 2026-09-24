/**
 * La tuile mise en avant DANS la grille du rayon — le rayon d'une opération
 * datée (Noël, Pâques), posé en première case de « Tout ».
 *
 * ⚠️ SIMULATION. Il n'existe aucun modèle d'opération datée côté serveur
 * (vérifié le 2026-09-24) : ces valeurs viennent de la maquette « Boutique
 * pro » (§3 du handoff) telles quelles. Le branchement réel se fera quand
 * l'opération existera au référentiel — cas 3 du dossier, le même que
 * {@link MOCK_EVENT} — et que le catalogue public la servira avec son rayon :
 * `ShopCatalogue` la portera alors, et ce fichier disparaîtra.
 *
 * Hors période, une opération n'a pas de mise en avant du tout.
 */
export interface ShelfFeature {
  /** La pastille, compte à rebours compris, telle qu'elle s'écrit. */
  readonly badge: string;
  readonly title: string;
  /** Une phrase — ce qu'on y trouve et ce qu'il faut savoir pour commander. */
  readonly lede: string;
  /** La photo. Visuel de banque, à remplacer par la pièce réellement faite. */
  readonly image: string;
  /**
   * Le rayon qu'ouvre la tuile. `null` quand l'opération n'a pas (encore) de
   * rayon : la tuile se montre, sans action.
   */
  readonly shelfId: string | null;
}

/**
 * Les trois formats d'une mise en avant du rayon. La maquette les offre tous ;
 * aucun sélecteur à l'écran — c'est l'opération qui choisira.
 *
 * - `wide` — **la tuile** : deux colonnes, photo à gauche au bureau, posée en
 *   première case.
 * - `block` — **le bloc** : 2 × 2, photo au-dessus à toutes les largeurs.
 * - `band` — **la bande** (nom retenu par Hugo le 2026-09-24) : toute la
 *   largeur de la grille, sur fond encre bleue, en troisième rangée — photo à
 *   gauche au bureau, au-dessus en pile.
 */
export type ShelfFeatureFormat = 'wide' | 'block' | 'band';

/**
 * Les deux hauteurs de la bande (Hugo, 2026-09-24 : « un mode double et
 * simple »). Sans effet sur la tuile et le bloc.
 *
 * - `simple` — **une rangée** de la grille : la hauteur d'une carte
 *   ordinaire, photo à gauche, texte à droite ; la phrase se coupe si elle ne
 *   tient pas.
 * - `double` — **deux rangées** : photo plus grande, titre plus gros, la
 *   phrase entière.
 *
 * En pile, les deux gardent la photo au-dessus ; seules la taille du titre et
 * celle de la photo diffèrent.
 */
export type ShelfBandSize = 'simple' | 'double';

/** Une mise en avant et le format dans lequel la grille la pose. */
export interface PlacedShelfFeature {
  readonly feature: ShelfFeature;
  readonly format: ShelfFeatureFormat;
  /** Lu seulement pour `band` ; `simple` si absent. */
  readonly bandSize?: ShelfBandSize;
}

/** ⚠️ SIMULATION — l'opération de Noël, en tuile. */
export const MOCK_SHELF_FEATURE: ShelfFeature = {
  badge: 'Noël · J‑18',
  title: 'Le rayon de Noël',
  lede: 'Bûches, calendrier de l’Avent, papillotes. Commande 72 h à l’avance, retrait comme le reste.',
  image:
    'https://images.unsplash.com/photo-1607920591413-4ec007e70023?fm=jpg&q=70&w=900&auto=format&fit=crop',
  // DOUBLURE : il n'y a pas de rayon Noël. Pâtisseries tient le rôle pour que
  // l'action se voie ; le vrai rayon viendra avec l'opération.
  shelfId: 'cat_patis',
};

/**
 * ⚠️ SIMULATION — l'opération de Pâques, en bande. Textes de la « Bande
 * Pâques » de la maquette « Boutique pro » ; photo de banque (un nid
 * d’œufs, vérifiée à l’œil le 2026-09-24). Même statut que
 * {@link MOCK_SHELF_FEATURE} : disparaît quand l'opération existera au
 * référentiel.
 */
export const MOCK_SHELF_BAND: ShelfFeature = {
  badge: 'Pâques · J‑9',
  title: 'Le chocolat se travaille ici',
  lede: 'Œufs moulés, poules pralinées, friture de la vallée. Commande 48 h à l’avance, retrait comme le reste.',
  image:
    'https://images.unsplash.com/photo-1457301353672-324d6d14f471?fm=jpg&q=70&w=900&auto=format&fit=crop',
  // DOUBLURE : il n'y a pas de rayon Pâques. Pâtisseries tient le rôle pour
  // que l'action se voie ; le vrai rayon viendra avec l'opération.
  shelfId: 'cat_patis',
};

/**
 * ⚠️ SIMULATION — les mises en avant de « Tout », dans l'ordre de la grille.
 * Une liste vide est un état de première classe : hors période, rien.
 */
export const MOCK_SHELF_FEATURES: readonly PlacedShelfFeature[] = [
  { feature: MOCK_SHELF_FEATURE, format: 'wide' },
  { feature: MOCK_SHELF_BAND, format: 'band', bandSize: 'double' },
];
