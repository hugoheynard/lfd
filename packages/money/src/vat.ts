import { fractionByBasisPoints, roundToCents, type Exact } from "./exact.js";

/**
 * **La ventilation de TVA** — une part par taux, sur des montants hors taxe.
 *
 * ## Pourquoi ici, et pas dans le domaine d'un contexte
 *
 * Cette règle a été écrite **trois fois** : dans le domaine `orders` du backend,
 * dans le panier de la boutique, et une troisième dans le front hérité qui
 * portait en JSDoc l'aveu de la copie. Les trois calculaient la même chose et
 * n'en tiraient pas les mêmes nombres — le panier ne taxait pas le coursier, et
 * annonçait donc quatre euros de moins que la caisse sur des frais de vingt.
 *
 * Un synonyme d'arithmétique d'argent est exactement ce que ce paquet existe
 * pour supprimer (cf. l'en-tête de `exact.ts`). La ventilation y descend donc,
 * comme les rationnels avant elle : une feuille du graphe, sans dépendance, que
 * chacun tient sans posséder.
 *
 * ## Ce que la fonction fait, et ce qu'elle ne fait pas
 *
 * Elle regroupe **par taux**, retranche la remise au prorata du poids hors taxe
 * de chaque groupe, et arrondit **une fois par groupe**. C'est la base légale :
 * une facture porte une ligne par taux, calculée sur l'assiette totale de ce
 * taux — pas la somme d'arrondis article par article.
 *
 * Elle ne connaît **aucune** règle de facturation : qui a droit à une remise,
 * si une surtaxe s'applique, quel taux porte une prestation — tout cela est
 * décidé par l'appelant et arrive ici en montants et en taux.
 */

/**
 * Le taux de la prestation de **livraison** (transport) — le taux normal.
 *
 * Une **constante**, et pas une donnée : le taux d'une prestation de transport
 * ne se paramètre pas par boutique. Les taux des marchandises, eux, sont de la
 * donnée — ils viennent du référentiel, article par article.
 *
 * Elle vivait dans le domaine `orders`, et une copie littérale vivait dans le
 * front. Deux définitions d'un taux légal, c'est une de trop.
 */
export const DELIVERY_VAT_RATE = 20;

/** Un montant **hors taxe** en centimes et le taux qui le frappe, en pourcent. */
export interface VatLine {
  readonly htCents: number;
  readonly vatRate: number;
}

/** La TVA d'un taux, telle qu'une facture la porte. */
export interface VatShare {
  readonly rate: number;
  /** En centimes, entier. */
  readonly amountCents: number;
}

/** Entrées de {@link ventilateVat}. Tout est **hors taxe**, en centimes. */
export interface VatVentilationInput {
  /** Les marchandises — les seules que la remise touche. */
  readonly lines: readonly VatLine[];
  /** La remise, POSITIVE, retranchée des marchandises au prorata de chaque taux. */
  readonly discountCents: number;
  /**
   * Les termes de panier taxés **hors remise** : livraison, surtaxe de retard.
   *
   * Ils entrent dans le groupe de leur taux, avec les marchandises qui portent
   * le même — c'est ce qui rend « une ligne par taux » vrai, et pas « une ligne
   * par taux, plus une pour le transport ».
   */
  readonly extras: readonly VatLine[];
}

/** Le décompte complet, en centimes entiers. */
export interface VatVentilation {
  /** Les marchandises hors taxe, **avant** remise. */
  readonly subtotalHtCents: number;
  /** La remise réellement appliquée — bornée au sous-total. */
  readonly discountCents: number;
  /** Les termes hors remise, hors taxe. */
  readonly extrasHtCents: number;
  /** Une part par taux **réellement présent**, du plus bas au plus haut. */
  readonly vat: readonly VatShare[];
  readonly vatTotalCents: number;
  /** `(sous-total − remise) + extras + TVA` — le **TTC**. */
  readonly totalCents: number;
}

/**
 * Ventile la TVA d'un panier ou d'une commande.
 *
 * 🔴 **Un seul arrondi par taux.** Arrondir article par article puis sommer
 * jetterait jusqu'à un demi-centime par ligne, et une facture de trente lignes
 * ne retomberait plus sur elle-même. C'est le même raisonnement que
 * `lineTotalCents`, un cran plus haut.
 *
 * ⚠️ Une part **nulle** ne sort pas : une ligne « TVA 10 % — 0,00 € » fait
 * douter du calcul au lieu de rassurer. Le total, lui, ne change pas.
 */
export function ventilateVat(input: VatVentilationInput): VatVentilation {
  const subtotalHtCents = sumHt(input.lines);
  const extrasHtCents = sumHt(input.extras);
  // La remise est bornée au sous-total : au-delà, elle rendrait une assiette
  // négative, donc une TVA négative — un avoir déguisé en commande. Le total
  // fait la même borne, et les deux doivent la faire au même endroit.
  const discountCents = Math.min(Math.max(0, input.discountCents), subtotalHtCents);
  const netHtCents = subtotalHtCents - discountCents;

  // Tous les numérateurs partagent le sous-total pour dénominateur : le prorata
  // s'accumule alors en entiers, sans que les fractions se multiplient à chaque
  // ligne ajoutée.
  const den = BigInt(subtotalHtCents === 0 ? 1 : subtotalHtCents);
  const numByRate = new Map<number, bigint>();
  for (const line of input.lines) {
    add(numByRate, line.vatRate, BigInt(Math.trunc(line.htCents)) * BigInt(netHtCents));
  }
  for (const extra of input.extras) {
    add(numByRate, extra.vatRate, BigInt(Math.trunc(extra.htCents)) * den);
  }

  const vat = [...numByRate.entries()]
    .map(([rate, num]) => ({ rate, amountCents: taxOf({ num, den }, rate) }))
    .filter((share) => share.amountCents !== 0)
    .sort((left, right) => left.rate - right.rate);

  const vatTotalCents = vat.reduce((sum, share) => sum + share.amountCents, 0);

  return {
    subtotalHtCents,
    discountCents,
    extrasHtCents,
    vat,
    vatTotalCents,
    totalCents: netHtCents + extrasHtCents + vatTotalCents,
  };
}

function sumHt(lines: readonly VatLine[]): number {
  return lines.reduce((sum, line) => sum + Math.trunc(line.htCents), 0);
}

function add(byRate: Map<number, bigint>, rate: number, numerator: bigint): void {
  byRate.set(rate, (byRate.get(rate) ?? 0n) + numerator);
}

/**
 * Le taux passe en points de base **par un arrondi**, jamais par `rate * 100`
 * nu : `4.85 * 100` vaut `484.99999999999994` en binaire, et un taux
 * parfaitement légitime se ferait alors décaler d'un point de base.
 */
function taxOf(base: Exact, rate: number): number {
  return roundToCents(fractionByBasisPoints(base, Math.round(rate * 100)));
}
