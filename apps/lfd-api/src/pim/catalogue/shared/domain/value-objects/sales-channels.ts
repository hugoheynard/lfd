/**
 * Les modes qu'un point de vente propose.
 *
 * ⚠️ `emporter` et `surPlace` restent français, et ce n'est pas un oubli : ce
 * sont des **clés de données**. Elles vivent dans le `jsonb` de
 * `category.channel_preset`, et dans `sales_context.key`. Les renommer est une
 * migration — étendre, basculer, resserrer — pas un renommage
 * (`documentation/langue-du-code.md`, palier 4).
 *
 * À ne pas confondre avec `Location.eatIn`, qui a bien été traduit : là-bas
 * c'est un identifiant que le `@map` découple de sa colonne, donc gratuit. Ici
 * la valeur EST en base.
 */
export interface ShopChannels {
  readonly emporter: boolean;
  readonly surPlace: boolean;
}

/**
 * Où et comment une gamme se vend.
 *
 * ## Les emplacements sont une DONNÉE, plus des clés
 *
 * C'était `{ b1: …, b2: … }` — deux boutiques nommées en dur dans un type, avec
 * leurs libellés dans une constante du front. Ouvrir un troisième point de
 * vente demandait une migration, un changement de type et une visite de tous
 * les lecteurs. Et le nom affiché avait divergé du réel : l'écran proposait
 * « Ardroit » pour un emplacement qui s'appelle « Labo » en base.
 *
 * La grille est donc indexée par **identifiant d'emplacement**. Un emplacement
 * de plus est une ligne de plus dans `pim.location`, et rien d'autre.
 *
 * ## Le B2B reste à part
 *
 * Un booléen, pas une entrée de la carte : la plateforme n'est pas un
 * emplacement, et un professionnel qui commande en gros ne consomme ni sur
 * place ni à emporter. L'y ranger obligerait à lui inventer deux modes.
 *
 * ⚠️ Ceci reste une **intention** héritée par les fiches. Le fait qu'un produit
 * SOIT publié sur la plateforme vit dans `b2b_channel_binding`, avec sa date et
 * son auteur.
 */
export interface SalesChannels {
  /** Par location, clé = son identifiant. Une clé absente = rien n'y est vendu. */
  readonly boutiques: Readonly<Record<string, ShopChannels>>;
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
  const boutiques: Record<string, ShopChannels> = {};
  for (const [id, modes] of Object.entries(channels.boutiques)) {
    if (modes.emporter || modes.surPlace) {
      boutiques[id] = { emporter: modes.emporter, surPlace: modes.surPlace };
    }
  }
  return { boutiques, b2b: channels.b2b };
}

/** Un mode est-il vendu **quelque part** ? Le taux suit le mode, pas la boutique. */
export function sellsMode(channels: SalesChannels, mode: keyof ShopChannels): boolean {
  return Object.values(channels.boutiques).some((modes) => modes[mode]);
}

/** Les identifiants d'emplacement que cette grille référence. */
export function referencedLocations(channels: SalesChannels): string[] {
  return Object.keys(channels.boutiques);
}

/**
 * Un canal **vendu** : un contexte, et le lieu depuis lequel il se vend.
 *
 * `locationId === null` = contexte sans lieu (le B2B aujourd'hui). Ce n'est pas
 * une absence de donnée, c'est la donnée.
 *
 * C'est la forme CIBLE de la matrice (C0-d) : un ensemble de paires, où lire
 * « ce contexte est-il vendu ? » ne demande aucune branche — et où une clé
 * étrangère peut porter ce qu'aucun `jsonb` ne pouvait tenir.
 */
export interface SoldChannel {
  readonly locationId: string | null;
  readonly context: string;
}

/**
 * Déplie la matrice en paires.
 *
 * ⚠️ Code de TRANSITION (C0-d, tranche d-1) : il lit l'ANCIENNE forme, où les
 * modes d'un lieu sont deux clés nommées et le B2B un drapeau. C'est le dernier
 * endroit du référentiel qui connaît ces trois noms ; la bascule d-2 lit les
 * paires directement, et d-3 supprime cette fonction avec la colonne.
 *
 * Un faux ne produit pas de paire : l'absence EST la donnée.
 */
export function soldChannels(channels: SalesChannels): SoldChannel[] {
  const sold: SoldChannel[] = [];
  for (const [locationId, modes] of Object.entries(channels.boutiques)) {
    if (modes.emporter) {
      sold.push({ locationId, context: "emporter" });
    }
    if (modes.surPlace) {
      sold.push({ locationId, context: "surPlace" });
    }
  }
  if (channels.b2b) {
    sold.push({ locationId: null, context: "b2b" });
  }
  return sold;
}
