import type { SitePaletteEntryView } from '@lfd/contracts';

/**
 * **La catégorie logistique d'une commande, et sa couleur** (plan
 * `documentation/commandes/plan-tri-depart-et-couleurs.md`, §4, L1b).
 *
 * Côté back-office et pas dans `@lfd/contracts` : la boutique ne s'en sert
 * pas, et le baril pèse sur son budget (§4).
 *
 * 🔴 **La couleur se LIT à l'affichage, jamais figée** (Hugo, 2026-10-13) :
 * la commande porte son mode, sa clientèle et son site ; la palette se lit au
 * site — un changement en Réglages › Sites se voit partout au prochain
 * affichage.
 *
 * | Commande                         | Couleur                                     |
 * | -------------------------------- | ------------------------------------------- |
 * | livraison                        | livraison du site de DÉPART, par clientèle  |
 * | retrait                          | retrait de SON site, par clientèle          |
 * | clientèle inconnue, retrait sans site, site inconnu, couleur non posée | neutre |
 *
 * Jamais une couleur inventée : une commande qu'on ne sait pas ranger est
 * NEUTRE, et le dit.
 */

/** Ce qu'on sait d'une commande pour la ranger — tel que les vues le servent. */
export interface LogisticsOrderFacts {
  readonly fulfillmentMethod: 'pickup' | 'delivery';
  /** `null` ou absent : clientèle inconnue. */
  readonly clientele?: 'pro' | 'public' | null | undefined;
  /** Le site d'un retrait ; `null` ou absent : sans site (d'avant S2). */
  readonly siteId?: string | null | undefined;
}

/** Une catégorie : de quoi grouper, titrer et peindre. */
export interface LogisticsCategory {
  /** Stable d'un affichage à l'autre — deux commandes de même clé vont ensemble. */
  readonly key: string;
  /** « Livraison pro », « Retrait particulier Adroit », « Transfert Val Village · pro »… */
  readonly label: string;
  /** `#rrggbb`, ou `null` : la teinte neutre. */
  readonly color: string | null;
}

const CLIENTELE_WORDS: Readonly<Record<'pro' | 'public', string>> = {
  pro: 'pro',
  public: 'particulier',
};

/** La catégorie d'une commande, d'après la palette lue à l'instant. */
export function logisticsCategoryOf(
  order: LogisticsOrderFacts,
  palette: readonly SitePaletteEntryView[],
): LogisticsCategory {
  const clientele = order.clientele ?? null;
  return order.fulfillmentMethod === 'delivery'
    ? deliveryCategory(clientele, palette.find((site) => site.isDeparture) ?? null)
    : pickupCategory(clientele, palette.find((site) => site.id === order.siteId) ?? null);
}

function deliveryCategory(
  clientele: 'pro' | 'public' | null,
  departure: SitePaletteEntryView | null,
): LogisticsCategory {
  if (clientele === null) {
    return { key: 'delivery', label: 'Livraison', color: null };
  }
  const color =
    departure === null
      ? null
      : clientele === 'pro'
        ? departure.deliveryColorB2b
        : departure.deliveryColorB2c;
  return {
    key: `delivery:${clientele}`,
    label: `Livraison ${CLIENTELE_WORDS[clientele]}`,
    color,
  };
}

function pickupCategory(
  clientele: 'pro' | 'public' | null,
  site: SitePaletteEntryView | null,
): LogisticsCategory {
  if (site === null) {
    return { key: 'pickup', label: 'Retrait', color: null };
  }
  const place = site.supply === 'transfer' ? `Transfert ${site.label}` : `Retrait ${site.label}`;
  if (clientele === null) {
    return { key: `pickup:${site.id}`, label: place, color: null };
  }
  const word = CLIENTELE_WORDS[clientele];
  return {
    key: `pickup:${site.id}:${clientele}`,
    label:
      site.supply === 'transfer'
        ? `Transfert ${site.label} · ${word}`
        : `Retrait ${word} ${site.label}`,
    color: clientele === 'pro' ? site.pickupColorB2b : site.pickupColorB2c,
  };
}

/** L'encre lisible sur une couleur : `dark` sur une teinte claire, `light` sur une sombre. */
export type SwatchInk = 'dark' | 'light';

/**
 * Seuil de luminance relative (WCAG) au-dessus duquel le noir contraste mieux
 * que le blanc : c'est le point où les deux rapports de contraste s'égalent,
 * √(1,05 × 0,05) − 0,05 ≈ 0,179.
 */
const INK_THRESHOLD = 0.179;
const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu;
const CHANNEL_MAX = 255;

/**
 * L'encre d'une couleur LIBRE (Hugo, 2026-10-13 : aucune teinte refusée) —
 * sans quoi un jaune saisi serait illisible sous un texte blanc. Une forme
 * illisible prend l'encre sombre : celle de la teinte neutre.
 */
export function inkOn(color: string): SwatchInk {
  const match = HEX.exec(color);
  if (match === null) {
    return 'dark';
  }
  const [red, green, blue] = [match[1], match[2], match[3]].map((part) =>
    linear(Number.parseInt(part ?? '0', 16) / CHANNEL_MAX),
  );
  const luminance = 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
  return luminance > INK_THRESHOLD ? 'dark' : 'light';
}

/** Un canal sRGB ramené à sa valeur linéaire (formule de la luminance relative WCAG). */
function linear(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}
