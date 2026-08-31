import type {
  MercurialeBenchmarkView,
  PriceFloorView,
  PricingItemView,
  TemplateTierPayload,
} from '@lfd/contracts';

/**
 * **Une ligne de la grille mercuriale**, dérivée de bout en bout.
 *
 * Les colonnes se lisent de gauche à droite comme le prix se construit, exactement
 * comme sur la tarification générale : le tarif d'entrée, ce qu'on pose, ce qui
 * l'empêche de descendre, ce qui reste à lâcher, ce que ça coûte, et le prix final.
 *
 * **Le prix final n'est pas le prix saisi.** La mercuriale scelle la chaîne, donc
 * les étages suivants sont transparents — mais la limite, elle, s'applique après
 * TOUT : elle relève un prix négocié trop bas comme n'importe quel autre. Afficher
 * la saisie comme prix final laisserait annoncer au client un prix que la caisse
 * relèverait.
 */
export interface MercurialeRow {
  readonly sku: string;
  readonly name: string;
  /** Le tarif catalogue B2B — la colonne de référence. */
  readonly catalogCents: number;
  /** Ce qui est saisi, en centimes. `null` = pas de prix sur cet article. */
  readonly mercurialeCents: number | null;
  /** La limite qui vise l'article, en centimes. `null` = aucune n'est posée. */
  readonly floorMillicents: number | null;
  /** Le prix réellement facturé : la saisie, relevée par la limite. */
  readonly finalMillicents: number | null;
  /** La limite a-t-elle **relevé** le prix saisi ? */
  readonly floored: boolean;
  /** Ce qu'un commercial peut encore lâcher. `null` sans limite posée. */
  readonly roomCents: number | null;
  /** L'écart au tarif catalogue, en points de base. Positif = moins cher. */
  readonly impactBp: number | null;
  /** Ce que les autres clients paient déjà. `null` = aucune mercuriale en place. */
  readonly benchmark: MercurialeBenchmarkView | null;
  /**
   * Le prix saisi face à la médiane du marché : `under` = accordé moins cher que
   * la moitié des clients. Ce n'est **pas** un jugement — un gros volume mérite
   * de descendre — mais c'est le fait qu'on veut connaître avant de signer.
   */
  readonly versusMarket: 'under' | 'over' | 'at' | null;
}

/** La limite d'un article, en centimes, quelle que soit sa forme. */
export function floorCentsOf(
  floor: PriceFloorView | null,
  canonicalMillicents: number,
): number | null {
  if (floor === null) {
    return null;
  }
  return floor.mode === 'amount'
    ? floor.value
    : Math.round((canonicalMillicents * floor.value) / 10_000);
}

/** L'écart au tarif catalogue, signé — positif = moins cher que le catalogue. */
export function impactBp(catalogCents: number, finalMillicents: number): number | null {
  if (catalogCents <= 0) {
    return null;
  }
  return Math.round(((catalogCents - finalMillicents) / catalogCents) * 10_000);
}

/**
 * Une ligne complète, depuis l'article du tableau et le prix saisi.
 *
 * `mercurialeCents === null` — l'article que le gabarit ne tarife pas — laisse
 * **tout** à `null` plutôt que de retomber sur le catalogue : cette ligne ne
 * porte aucune décision, et afficher un prix final la ferait passer pour tarifée.
 */
export function mercurialeRow(
  item: Pick<PricingItemView, 'sku' | 'name' | 'canonicalMillicents' | 'effectiveFloor'>,
  mercurialeCents: number | null,
  benchmark: MercurialeBenchmarkView | null = null,
): MercurialeRow {
  const floorMillicents = floorCentsOf(item.effectiveFloor, item.canonicalMillicents);
  if (mercurialeCents === null) {
    return {
      sku: item.sku,
      name: item.name,
      catalogCents: item.canonicalMillicents,
      mercurialeCents: null,
      floorMillicents,
      finalMillicents: null,
      floored: false,
      roomCents: null,
      impactBp: null,
      benchmark,
      versusMarket: null,
    };
  }
  const floored = floorMillicents !== null && mercurialeCents < floorMillicents;
  const finalMillicents = floored && floorMillicents !== null ? floorMillicents : mercurialeCents;
  return {
    sku: item.sku,
    name: item.name,
    catalogCents: item.canonicalMillicents,
    mercurialeCents,
    floorMillicents,
    finalMillicents,
    floored,
    // Bornée à zéro : un prix déjà relevé au plancher n'a pas de marge négative,
    // il en a zéro — ce qui est une information, pas la même chose qu'une absence.
    roomCents: floorMillicents === null ? null : Math.max(0, finalMillicents - floorMillicents),
    impactBp: impactBp(item.canonicalMillicents, finalMillicents),
    benchmark,
    versusMarket: benchmark === null ? null : versus(finalMillicents, benchmark.medianMillicents),
  };
}

/** Le prix saisi, situé par rapport à la médiane du marché. */
function versus(finalMillicents: number, medianMillicents: number): 'under' | 'over' | 'at' {
  if (finalMillicents === medianMillicents) {
    return 'at';
  }
  return finalMillicents < medianMillicents ? 'under' : 'over';
}

/**
 * **Le prix d'entrée d'une grille de paliers** : celui du plus petit seuil.
 *
 * C'est lui qui alimente les colonnes de droite. Le prix du plus GROS palier
 * serait le plus flatteur, et c'est exactement pour ça qu'il ne convient pas :
 * la limite et la marge se jugent sur ce qu'un petit client paie.
 */
export function entryCents(tiers: readonly TemplateTierPayload[]): number | null {
  return tiers[0]?.unitPriceMillicents ?? null;
}

/** Ce que la grille pèse : combien d'articles tarifés, combien relevés au plancher. */
export function tally(rows: readonly MercurialeRow[]): {
  priced: number;
  floored: number;
  averageImpactBp: number | null;
} {
  const priced = rows.filter((row) => row.mercurialeCents !== null);
  const impacts = priced
    .map((row) => row.impactBp)
    .filter((impact): impact is number => impact !== null);
  return {
    priced: priced.length,
    floored: priced.filter((row) => row.floored).length,
    averageImpactBp:
      impacts.length === 0
        ? null
        : Math.round(impacts.reduce((sum, impact) => sum + impact, 0) / impacts.length),
  };
}

/**
 * **L'écart au catalogue, en toutes lettres.**
 *
 * Le signe est INVERSÉ par rapport aux points de base : un `impactBp` positif est
 * une baisse, et l'écrire « +5 % » ferait lire une hausse. C'est la convention de
 * cet écran, et elle vit avec le champ qu'elle met en forme plutôt que dans le
 * composant — sans quoi un second écran la réinventerait à l'envers.
 */
export function impactLabel(bp: number): string {
  return `${bp > 0 ? '−' : '+'}${(Math.abs(bp) / 100).toFixed(1).replace('.', ',')} %`;
}

/** Le SENS de l'écart, pour la couleur — jamais pour l'information seule. */
export function impactDirection(bp: number): 'down' | 'up' | 'flat' {
  if (bp === 0) {
    return 'flat';
  }
  return bp > 0 ? 'down' : 'up';
}
