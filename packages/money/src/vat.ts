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
 * Le **taux normal** — celui de la livraison quand elle est taxée comme une
 * prestation à part (mode `standard`), et le repli d'un extra qui suit la
 * marchandise quand il n'y a aucune marchandise à suivre.
 *
 * Ce n'est plus « le taux du transport, point » : depuis la décision du
 * 2026-09-21 (plan `documentation/order/plan-tva-des-frais-de-port.md`), le
 * comptable peut décider que le port, accessoire de la vente, suit le taux de
 * ce qu'il transporte ({@link VatExtra} `followsGoods`). Le taux normal reste
 * une constante légale, pas une donnée par boutique.
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

/**
 * Un terme de panier **hors remise** (livraison, surtaxe) : soit il porte son
 * propre taux, soit il **suit la marchandise** — réparti au prorata de la base
 * hors taxe BRUTE de chaque taux.
 *
 * Un type distinct de {@link VatLine} parce qu'une marchandise ne peut pas
 * « suivre la marchandise » : rendre la forme inexprimable vaut mieux que la
 * refuser à l'exécution.
 */
export type VatExtra =
  | { readonly htCents: number; readonly vatRate: number }
  | { readonly htCents: number; readonly followsGoods: true };

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
   * par taux, plus une pour le transport ». Un extra qui suit la marchandise se
   * répartit entre les groupes présents.
   */
  readonly extras: readonly VatExtra[];
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
  const grossByRate = grossHtByRate(input.lines);
  for (const extra of input.extras) {
    addExtra(numByRate, extra, den, grossByRate);
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

/**
 * Un extra à taux propre entre dans son groupe ; un extra qui suit la
 * marchandise se répartit au prorata de la base BRUTE de chaque taux :
 * `extra × ht(taux) / sous-total`, sur le dénominateur commun — aucun arrondi
 * de plus, chaque groupe reste arrondi une fois.
 *
 * Brute et pas nette : quand la remise absorbe toute la marchandise (un bon qui
 * solde), les proportions nettes sont 0/0. Tant que le net est positif, la
 * remise est proratisée uniformément, et les deux proportions coïncident.
 * Sans marchandise du tout, l'extra prend le taux normal.
 */
function addExtra(
  byRate: Map<number, bigint>,
  extra: VatExtra,
  den: bigint,
  grossByRate: ReadonlyMap<number, bigint>,
): void {
  const ht = BigInt(Math.trunc(extra.htCents));
  if ("vatRate" in extra) {
    add(byRate, extra.vatRate, ht * den);
    return;
  }
  if (grossByRate.size === 0) {
    add(byRate, DELIVERY_VAT_RATE, ht * den);
    return;
  }
  for (const [rate, gross] of grossByRate) {
    add(byRate, rate, ht * gross);
  }
}

/** Le hors taxe brut de chaque taux, sans les groupes nuls. */
function grossHtByRate(lines: readonly VatLine[]): ReadonlyMap<number, bigint> {
  const byRate = new Map<number, bigint>();
  for (const line of lines) {
    add(byRate, line.vatRate, BigInt(Math.trunc(line.htCents)));
  }
  for (const [rate, gross] of byRate) {
    if (gross === 0n) {
      byRate.delete(rate);
    }
  }
  return byRate;
}

function sumHt(lines: readonly { readonly htCents: number }[]): number {
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

/**
 * **Un montant hors taxe → son taxe comprise**, par la chaîne de la CAISSE.
 *
 * 🔴 Ni une multiplication, ni un arrondi maison : {@link ventilateVat}, exactement
 * ce que le devis et la commande font. Un TTC calculé autrement serait plus juste
 * ou plus faux, peu importe — il serait **différent**, et l'étiquette du rayon
 * cesserait de valoir ce qu'on encaisse.
 *
 * ⚠️ **Elle prend des CENTIMES, pas des millicentimes**, et l'appelant passe donc
 * par `lineTotalCents` sous les yeux du lecteur. C'est `lint:money-units` qui l'a
 * exigé, et elle avait raison : l'arrondi au centime du total de ligne fait partie
 * du résultat, et une fonction qui l'avalait en cachait la moitié.
 *
 * ⚠️ **Appliquée ligne par ligne, la somme des TTC ne fait PAS le total TTC du
 * panier** — et ce n'est pas un défaut : `ventilateVat` arrondit **une fois par
 * taux** sur l'assiette entière, ce qu'une facture exige. Un écran qui affiche des
 * lignes TTC ne peut donc pas les additionner pour retrouver le total ; c'est le
 * serveur qui dit le total, et lui seul.
 *
 * Arrivée de `b2b/catalog/application/shop-catalogue-view.ts` le 2026-09-21, quand
 * le devis de la boutique en a eu besoin pour dire ses lignes en TTC : deux
 * définitions de « combien ça coûte taxe comprise » auraient divergé d'un centime
 * entre le rayon et le panier, ce qui est exactement l'écart qu'on répare.
 */
export function ttcCentsOf(htCents: number, vatRate: number): number {
  return ventilateVat({ lines: [{ htCents, vatRate }], discountCents: 0, extras: [] }).totalCents;
}
