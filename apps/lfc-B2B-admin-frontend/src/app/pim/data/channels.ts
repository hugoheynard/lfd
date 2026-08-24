import type { BoutiqueChannels, Category, Location, Product, SalesChannels } from './models';

/**
 * Aucun canal — le point de départ d'une fiche ou d'une famille qu'on crée.
 *
 * Une constante partagée plutôt qu'un littéral par appelant : `boutiques: {}`
 * et `b2b: false` sont la MÊME notion de « rien de coché », et deux copies
 * divergent le jour où la forme gagne un canal.
 */
export const NO_CHANNELS: SalesChannels = { boutiques: {}, b2b: false };

/**
 * Les **noms** des emplacements qui proposent un mode donné.
 *
 * Il lisait deux libellés codés en dur, dont l'un ne correspondait à aucun
 * location du référentiel : l'écran affichait une boutique qui n'existait
 * pas. Les noms viennent maintenant de la liste qu'on lui passe, et une clé
 * qui ne désigne plus rien est simplement ignorée.
 */
export function boutiquesWith(
  channels: SalesChannels,
  mode: keyof BoutiqueChannels,
  locations: readonly Location[],
): string[] {
  return locations
    .filter((location) => channels.boutiques[location.id]?.[mode] === true)
    .map((location) => location.name);
}

/** Un mode est-il vendu **quelque part** ? Le taux suit le mode, pas la boutique. */
export function sellsMode(channels: SalesChannels, mode: keyof BoutiqueChannels): boolean {
  return Object.values(channels.boutiques).some((modes) => modes[mode]);
}

/** `5.5` → « 5,5 % » ; `10` → « 10 % ». Affichage FR. */
export function formatPercent(percent: number): string {
  return `${percent.toString().replace('.', ',')} %`;
}

export interface ResolvedChannels {
  channels: SalesChannels;
  /** `true` = valeur héritée de la gamme ; `false` = override du produit. */
  isInherited: boolean;
}

/** Canaux effectifs d'un produit : son override, sinon le défaut de sa gamme. */
export function resolveChannels(product: Product, category: Category): ResolvedChannels {
  if (product.channelsOverride === null) {
    return { channels: category.channelPreset, isInherited: true };
  }
  return { channels: product.channelsOverride, isInherited: false };
}
