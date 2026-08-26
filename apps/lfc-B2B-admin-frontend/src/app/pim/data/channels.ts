import type { Category, Location, Product, SalesChannels } from './models';

/**
 * Aucun canal — le point de départ d'une fiche ou d'une famille qu'on crée.
 *
 * Une constante partagée plutôt qu'un littéral par appelant : « rien de coché »
 * est la même notion partout, et deux copies divergent le jour où la forme
 * change.
 */
export const NO_CHANNELS: SalesChannels = [];

/**
 * Les **noms** des points de vente qui vendent un contexte donné.
 *
 * Il lisait deux libellés codés en dur, dont l'un ne correspondait à aucun
 * emplacement du référentiel : l'écran affichait une boutique qui n'existait
 * pas. Les noms viennent de la liste qu'on lui passe, et une clé qui ne
 * désigne plus rien est simplement ignorée.
 */
export function locationsSelling(
  channels: SalesChannels,
  contextKey: string,
  locations: readonly Location[],
): string[] {
  const ids = new Set(
    channels
      .filter((channel) => channel.context === contextKey && channel.locationId !== null)
      .map((channel) => channel.locationId),
  );
  return locations.filter((location) => ids.has(location.id)).map((location) => location.name);
}

/**
 * Ce contexte est-il vendu **quelque part** ? Aucune branche : la fonction ne
 * sait pas lequel des contextes a besoin d'un lieu.
 */
export function sellsContext(channels: SalesChannels, contextKey: string): boolean {
  return channels.some((channel) => channel.context === contextKey);
}

/** Ce lieu vend-il ce contexte ? La question de la grille, case par case. */
export function sellsAt(
  channels: SalesChannels,
  locationId: string | null,
  contextKey: string,
): boolean {
  return channels.some(
    (channel) => channel.locationId === locationId && channel.context === contextKey,
  );
}

/** Coche ou décoche une case, et rend la matrice résultante. */
export function withCell(
  channels: SalesChannels,
  locationId: string | null,
  contextKey: string,
  sold: boolean,
): SalesChannels {
  const without = channels.filter(
    (channel) => !(channel.locationId === locationId && channel.context === contextKey),
  );
  return sold ? [...without, { locationId, context: contextKey }] : without;
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
