import type { MercurialeBenchmarkView, PricingItemView, TemplateTierPayload } from '@lfd/contracts';
import { gapBp } from '@lfd/money';

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
  readonly catalogMillicents: number;
  /** Ce qui est saisi, en centimes. `null` = pas de prix sur cet article. */
  readonly mercurialeMillicents: number | null;
  /** La limite qui vise l'article, en centimes. `null` = aucune n'est posée. */
  readonly floorMillicents: number | null;
  /** Le prix réellement facturé : la saisie, relevée par la limite. */
  readonly finalMillicents: number | null;
  /** La limite a-t-elle **relevé** le prix saisi ? */
  readonly floored: boolean;
  /** Ce qu'un commercial peut encore lâcher. `null` sans limite posée. */
  readonly roomMillicents: number | null;
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

/**
 * **La limite d'un article — LUE, jamais recalculée.**
 *
 * `negotiationRoom.floorMillicents` est le plancher **appliqué**, ramené en
 * centimes sur cet article par la même arithmétique exacte que la caisse.
 * `null` quand aucune limite ne vise l'article — il n'y a alors rien à afficher.
 *
 * ## 🔴 Ce que ce champ répare, et qui n'était pas qu'un arrondi
 *
 * Cette fonction calculait `Math.round((canonique × floor.value) / 10_000)` à
 * partir d'`effectiveFloor` — la formule que `resolve-floor.ts` interdit
 * **nommément** (« les deux divergeraient d'un centime sur certaines valeurs, et
 * l'écran promettrait alors une marge que la caisse refuserait »).
 *
 * Le défaut était plus grave que l'arrondi. `PriceFloorView.mode/value` porte le
 * **mur dur** ; la porte dynamique vit dans son champ `dynamic`. Sur un article
 * dont la porte s'ouvre, la grille annonçait donc le MUR là où la caisse
 * applique la PORTE, c'est-à-dire une limite plus haute que la vraie : elle
 * disait au commercial qu'il pouvait moins lâcher qu'il ne pouvait, sur l'écran
 * où il décide de signer (corrigé le 2026-09-09, R23).
 */
export function floorMillicentsOf(item: Pick<PricingItemView, 'negotiationRoom'>): number | null {
  return item.negotiationRoom?.floorMillicents ?? null;
}

/**
 * Une ligne complète, depuis l'article du tableau et le prix saisi.
 *
 * `mercurialeMillicents === null` — l'article que le gabarit ne tarife pas — laisse
 * **tout** à `null` plutôt que de retomber sur le catalogue : cette ligne ne
 * porte aucune décision, et afficher un prix final la ferait passer pour tarifée.
 */
export function mercurialeRow(
  item: Pick<PricingItemView, 'sku' | 'name' | 'canonicalMillicents' | 'negotiationRoom'>,
  mercurialeMillicents: number | null,
  benchmark: MercurialeBenchmarkView | null = null,
): MercurialeRow {
  const floorMillicents = floorMillicentsOf(item);
  if (mercurialeMillicents === null) {
    return {
      sku: item.sku,
      name: item.name,
      catalogMillicents: item.canonicalMillicents,
      mercurialeMillicents: null,
      floorMillicents,
      finalMillicents: null,
      floored: false,
      roomMillicents: null,
      impactBp: null,
      benchmark,
      versusMarket: null,
    };
  }
  const floored = floorMillicents !== null && mercurialeMillicents < floorMillicents;
  const finalMillicents =
    floored && floorMillicents !== null ? floorMillicents : mercurialeMillicents;
  return {
    sku: item.sku,
    name: item.name,
    catalogMillicents: item.canonicalMillicents,
    mercurialeMillicents,
    floorMillicents,
    finalMillicents,
    floored,
    // Bornée à zéro : un prix déjà relevé au plancher n'a pas de marge négative,
    // il en a zéro — ce qui est une information, pas la même chose qu'une absence.
    roomMillicents:
      floorMillicents === null ? null : Math.max(0, finalMillicents - floorMillicents),
    // `gapBp` et non une formule locale : c'était la SIXIÈME copie de la même
    // division, et `@lfd/money/gap.ts` existe parce que les cinq précédentes
    // donnaient trois réponses différentes au cas du canonique nul. Pas
    // `discountBp`, qui borne à zéro : cette colonne montre aussi les articles
    // devenus plus CHERS, et l'écran en affiche la direction (R23, 2026-09-09).
    impactBp: gapBp(item.canonicalMillicents, finalMillicents),
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
export function entryMillicents(tiers: readonly TemplateTierPayload[]): number | null {
  return tiers[0]?.unitPriceMillicents ?? null;
}

/** Ce que la grille pèse : combien d'articles tarifés, combien relevés au plancher. */
export function tally(rows: readonly MercurialeRow[]): {
  priced: number;
  floored: number;
  averageImpactBp: number | null;
} {
  const priced = rows.filter((row) => row.mercurialeMillicents !== null);
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
