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
 * 2026-09-21 (plan `documentation/commandes/bon-et-pieces/architecture-tva-des-frais-de-port.md`), le
 * comptable peut décider que le port, accessoire de la vente, suit le taux de
 * ce qu'il transporte ({@link VatExtra} `followsGoods`). Le taux normal reste
 * une constante légale, pas une donnée par boutique.
 *
 * Elle vivait dans le domaine `orders`, et une copie littérale vivait dans le
 * front. Deux définitions d'un taux légal, c'est une de trop.
 */
export const DELIVERY_VAT_RATE = 20;

/**
 * Un montant **hors taxe** en centimes et le taux qui le frappe, en pourcent.
 *
 * `discountEligible` dit si la ligne entre dans l'assiette de la remise
 * **restreinte** ({@link VatVentilationInput.eligibleDiscountCents}) — la remise
 * d'un point de retrait, dont certaines catégories ou produits sont exclus
 * (`documentation/livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md`, R1).
 * Absent = éligible : c'est ce qu'étaient toutes les lignes avant les exclusions.
 */
export interface VatLine {
  readonly htCents: number;
  readonly vatRate: number;
  readonly discountEligible?: boolean | undefined;
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
  /** Les marchandises — les seules que les remises touchent. */
  readonly lines: readonly VatLine[];
  /**
   * La remise d'assiette **restreinte**, POSITIVE : retranchée des seules lignes
   * éligibles, au prorata de chacune — la remise du point de retrait (R1 du plan
   * des exclusions). Appliquée AVANT {@link discountCents}, bornée au hors taxe
   * des lignes éligibles. Absent = `0`.
   *
   * 🔴 Pourquoi une assiette à part : une remise sur le pain à 5,5 % ventilée au
   * prorata de tout le panier retrancherait une part de la base à 20 % d'une
   * boisson exclue — la TVA serait fausse, sur le bon comme sur la facture.
   */
  readonly eligibleDiscountCents?: number | undefined;
  /**
   * La remise sur **toutes** les lignes, POSITIVE (le bon de fidélité) —
   * retranchée APRÈS la remise restreinte, au prorata du net qu'elle a laissé.
   */
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
  // Les remises sont bornées à leur assiette : au-delà, elles rendraient une
  // base négative, donc une TVA négative — un avoir déguisé en commande. La
  // restreinte d'abord (le point de retrait), celle de toutes les lignes
  // ensuite (le bon), sur ce que la première a laissé.
  const net = netOfDiscounts(input.lines, [
    { cents: input.eligibleDiscountCents ?? 0, appliesTo: isDiscountEligible },
    { cents: input.discountCents, appliesTo: () => true },
  ]);
  const discountCents = net.appliedCents;
  const netHtCents = subtotalHtCents - discountCents;

  // Un dénominateur commun à toutes les parts : celui des remises, multiplié
  // par le sous-total que le prorata des extras qui suivent la marchandise
  // demande. Aucun arrondi avant le dernier, un par taux.
  const subtotal = BigInt(subtotalHtCents === 0 ? 1 : subtotalHtCents);
  const den = net.den * subtotal;
  const numByRate = new Map<number, bigint>();
  input.lines.forEach((line, index) => {
    add(numByRate, line.vatRate, (net.nums[index] ?? 0n) * subtotal);
  });
  const grossByRate = grossHtByRate(input.lines);
  for (const extra of input.extras) {
    addExtra(numByRate, extra, { den, netDen: net.den }, grossByRate);
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

function isDiscountEligible(line: VatLine): boolean {
  return line.discountEligible !== false;
}

/** Une remise et son assiette. */
interface DiscountStep {
  readonly cents: number;
  readonly appliesTo: (line: VatLine) => boolean;
}

/** Le net de chaque ligne, exact : `nums[i] / den`, et ce que les remises ont retranché. */
interface NetLines {
  readonly nums: readonly bigint[];
  readonly den: bigint;
  readonly appliedCents: number;
}

/**
 * Retranche les remises l'une après l'autre, chacune au prorata du net des
 * lignes de son assiette.
 *
 * Une seule remise sur toutes les lignes rend `ht × (S − d) / S` — exactement
 * l'ancien calcul. Deux remises sur toutes les lignes rendent la même fraction
 * que leur somme : séquentielles ou additionnées, elles ventilent pareil.
 *
 * Chaque remise est bornée, en centimes entiers, au net restant de son
 * assiette ; une assiette vide ou soldée la laisse sans effet.
 */
function netOfDiscounts(lines: readonly VatLine[], steps: readonly DiscountStep[]): NetLines {
  let nums = lines.map((line) => BigInt(Math.trunc(line.htCents)));
  let den = 1n;
  let appliedCents = 0;
  for (const step of steps) {
    const inScope = lines.map(step.appliesTo);
    const base = nums.reduce((sum, num, index) => (inScope[index] ? sum + num : sum), 0n);
    const available = base / den;
    const applied = BigInt(Math.min(Math.max(0, Math.trunc(step.cents)), Number(available)));
    if (applied === 0n || base === 0n) {
      continue;
    }
    const kept = base - applied * den;
    nums = nums.map((num, index) => (inScope[index] ? num * kept : num * base));
    den *= base;
    appliedCents += Number(applied);
  }
  return { nums, den, appliedCents };
}

/**
 * Un extra à taux propre entre dans son groupe ; un extra qui suit la
 * marchandise se répartit au prorata de la base BRUTE de chaque taux :
 * `extra × ht(taux) / sous-total`, sur le dénominateur commun — aucun arrondi
 * de plus, chaque groupe reste arrondi une fois.
 *
 * Brute et pas nette : quand la remise absorbe toute la marchandise (un bon qui
 * solde), les proportions nettes sont 0/0. Tant que les remises portent sur
 * toutes les lignes, les deux proportions coïncident.
 *
 * ⚠️ Une remise **restreinte** les ferait diverger, et ce cas n'existe pas :
 * la remise restreinte est celle du point de retrait, et une commande retirée
 * n'a pas de port. L'agrégat `Order` refuse une remise de retrait hors d'un
 * retrait ou à côté de frais de livraison (`MisplacedPickupDiscountError`, V5
 * du plan des exclusions — vérifié le 2026-10-22). La surtaxe, elle, porte son propre taux.
 * Sans marchandise du tout, l'extra prend le taux normal.
 */
function addExtra(
  byRate: Map<number, bigint>,
  extra: VatExtra,
  dens: { readonly den: bigint; readonly netDen: bigint },
  grossByRate: ReadonlyMap<number, bigint>,
): void {
  const ht = BigInt(Math.trunc(extra.htCents));
  if ("vatRate" in extra) {
    add(byRate, extra.vatRate, ht * dens.den);
    return;
  }
  if (grossByRate.size === 0) {
    add(byRate, DELIVERY_VAT_RATE, ht * dens.den);
    return;
  }
  for (const [rate, gross] of grossByRate) {
    add(byRate, rate, ht * gross * dens.netDen);
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
