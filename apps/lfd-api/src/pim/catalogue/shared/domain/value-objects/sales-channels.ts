/** Les modes qu'un emplacement propose pour une gamme. */
export interface BoutiqueChannels {
  readonly emporter: boolean;
  readonly surPlace: boolean;
}

/**
 * Où et comment une gamme se vend.
 *
 * ## Les locations sont une DONNÉE, plus des clés
 *
 * C'était `{ b1: …, b2: … }` — deux boutiques nommées en dur dans un type, avec
 * leurs libellés dans une constante du front. Ouvrir un troisième point de
 * vente demandait une migration, un changement de type et une visite de tous
 * les lecteurs. Et le nom affiché avait divergé du réel : l'écran proposait
 * « Ardroit » pour un emplacement qui s'appelle « Labo » en base.
 *
 * La grille est donc indexée par **identifiant d'emplacement**. Un location
 * de plus est une ligne de plus dans `pim.location`, et rien d'autre.
 *
 * ## Le B2B reste à part
 *
 * Un booléen, pas une entrée de la carte : la plateforme n'est pas un
 * location, et un professionnel qui commande en gros ne consomme ni sur
 * place ni à emporter. L'y ranger obligerait à lui inventer deux modes.
 *
 * ⚠️ Ceci reste une **intention** héritée par les fiches. Le fait qu'un produit
 * SOIT publié sur la plateforme vit dans `b2b_channel_binding`, avec sa date et
 * son auteur.
 */
export interface SalesChannels {
  /** Par location, clé = son identifiant. Une clé absente = rien n'y est vendu. */
  readonly boutiques: Readonly<Record<string, BoutiqueChannels>>;
  readonly b2b: boolean;
}

/** Défaut d'une gamme nouvellement créée : rien n'est vendu tant qu'on ne l'a pas dit. */
export function defaultSalesChannels(): SalesChannels {
  return { boutiques: {}, b2b: false };
}

/**
 * Reconstruit un objet **propre** aux seules formes attendues — barrière avant
 * persistance : ni clé parasite ni forme partielle ne franchit le domaine.
 *
 * Les entrées **entièrement fausses sont retirées** plutôt que gardées à zéro :
 * la carte dit ce qui est vendu, et une clé qui ne vend rien est du bruit qui
 * ferait grossir la colonne à chaque emplacement décoché.
 */
export function normalizeSalesChannels(channels: SalesChannels): SalesChannels {
  const boutiques: Record<string, BoutiqueChannels> = {};
  for (const [id, modes] of Object.entries(channels.boutiques)) {
    if (modes.emporter || modes.surPlace) {
      boutiques[id] = { emporter: modes.emporter, surPlace: modes.surPlace };
    }
  }
  return { boutiques, b2b: channels.b2b };
}

/** Un mode est-il vendu **quelque part** ? Le taux suit le mode, pas la boutique. */
export function sellsMode(channels: SalesChannels, mode: keyof BoutiqueChannels): boolean {
  return Object.values(channels.boutiques).some((modes) => modes[mode]);
}

/** Les identifiants d'emplacement que cette grille référence. */
export function referencedLocations(channels: SalesChannels): string[] {
  return Object.keys(channels.boutiques);
}
