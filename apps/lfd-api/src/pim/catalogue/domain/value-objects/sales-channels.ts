/**
 * Où et comment une gamme se vend — matrice **boutiques × modes**. Chaque boutique
 * décline indépendamment « à emporter » et « sur place ». Le labo ne vend pas : il
 * est absent de la grille. Portée par la catégorie (`channelPreset`), héritée par
 * ses produits sauf override.
 */
export interface BoutiqueChannels {
  readonly emporter: boolean;
  readonly surPlace: boolean;
}

export interface SalesChannels {
  readonly b1: BoutiqueChannels;
  readonly b2: BoutiqueChannels;
}

/** Défaut d'une gamme nouvellement créée : rien n'est vendu tant qu'on ne l'a pas dit. */
export function defaultSalesChannels(): SalesChannels {
  return {
    b1: { emporter: false, surPlace: false },
    b2: { emporter: false, surPlace: false },
  };
}

/**
 * Reconstruit un objet **propre** aux seules clés attendues — barrière avant
 * persistance : ni clé parasite ni forme partielle ne franchit le domaine.
 */
export function normalizeSalesChannels(channels: SalesChannels): SalesChannels {
  return {
    b1: { emporter: channels.b1.emporter, surPlace: channels.b1.surPlace },
    b2: { emporter: channels.b2.emporter, surPlace: channels.b2.surPlace },
  };
}
