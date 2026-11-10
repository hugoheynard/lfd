import { freeDeliveryOf, type FreeDelivery } from "../value-objects/free-delivery.js";

/**
 * Ce que le jugement du franco lit d'un panier déjà chiffré : le seuil de la
 * route, la base, et le frais que la zone facturerait.
 */
export interface FreeDeliveryJudgementInput {
  /** Le seuil HT de la route ; `null` = pas de franco. */
  readonly thresholdCents: number | null;
  /**
   * **La base du seuil** (Hugo, 2026-11-05) : les marchandises HT, APRÈS les
   * remises (articles et panier), AVANT le bon de fidélité — le bon est un
   * moyen de paiement, il ne fait pas perdre le franco.
   */
  readonly goodsNetHtCents: number;
  /**
   * La même base en TTC — commande `exact_ht` seulement (lignes composées
   * moins les remises composées), `null` sinon. Ne sert qu'au manque « environ
   * » du particulier (Hugo, 2026-11-05) ; le seuil reste jugé en HT.
   */
  readonly goodsNetTtcCents: number | null;
  /** Le frais que le barème produit, HT. */
  readonly feeHtCents: number;
  /** Le même TTC — commande `exact_ht` seulement, `null` sinon. */
  readonly feeTtcCents: number | null;
}

/**
 * **Le franco est-il atteint ?** (plan `plan-livraison-offerte.md`, 1b) —
 * « dès 80 € » : atteint quand la base vaut le seuil ou plus.
 *
 * Rend `null` sans seuil, sous le seuil, ou quand la livraison ne coûte rien :
 * offrir zéro ne serait pas un cadeau, et la commande resterait identique à
 * ce qu'elle était avant le franco. Fonction pure, appelée par `priceBasket`
 * seul (« une seule arithmétique ») ; l'agrégat en revérifie la forme.
 */
export function judgedFreeDelivery(input: FreeDeliveryJudgementInput): FreeDelivery | null {
  const { thresholdCents } = input;
  if (thresholdCents === null || input.goodsNetHtCents < thresholdCents) {
    return null;
  }
  if (input.feeHtCents === 0 && (input.feeTtcCents ?? 0) === 0) {
    return null;
  }
  return freeDeliveryOf({
    thresholdCents,
    waivedCents: input.feeHtCents,
    waivedTtcCents: input.feeTtcCents,
  });
}

/**
 * **Où en est le panier du franco** (plan `plan-livraison-offerte.md`, 1c) —
 * ce que le devis dit au client : la livraison offerte, ou ce qu'il manque
 * pour l'obtenir (« Plus que 12 € pour la livraison offerte »).
 *
 * Servi par le serveur, jamais recalculé à l'écran : la base du seuil n'existe
 * qu'ici (« une seule arithmétique »). Tout est HT, comme le seuil (Hugo,
 * 2026-11-05). Offert se dit sans montant (« Coursier offert », Hugo,
 * 2026-11-05).
 */
export type FreeDeliveryProgress =
  | { readonly status: "offered" }
  | {
      readonly status: "short";
      /** Ce qu'il manque à la base pour atteindre le seuil, HT, strictement positif. */
      readonly remainingCents: number;
      /**
       * Le même manque, TTC « environ » — commande `exact_ht` seulement
       * (particulier, Hugo, 2026-11-05) ; absent en `line_ht` ou sans base.
       * Cf. {@link remainingTtcCentsOf}.
       */
      readonly remainingTtcCents?: number;
    };

/**
 * L'avancement vers le franco, à partir du jugement déjà rendu. `null` sans
 * seuil, et quand la livraison ne coûte rien : promettre d'offrir zéro
 * n'aurait pas de sens.
 */
export function freeDeliveryProgressOf(
  input: FreeDeliveryJudgementInput,
  judged: FreeDelivery | null,
): FreeDeliveryProgress | null {
  if (judged !== null) {
    return { status: "offered" };
  }
  const { thresholdCents } = input;
  if (thresholdCents === null || (input.feeHtCents === 0 && (input.feeTtcCents ?? 0) === 0)) {
    return null;
  }
  const remainingCents = thresholdCents - input.goodsNetHtCents;
  const remainingTtcCents =
    input.goodsNetTtcCents === null
      ? null
      : remainingTtcCentsOf(remainingCents, input.goodsNetHtCents, input.goodsNetTtcCents);
  return {
    status: "short",
    remainingCents,
    ...(remainingTtcCents === null ? {} : { remainingTtcCents }),
  };
}

/**
 * **Le manque en TTC, « environ »** (Hugo, 2026-11-05) : le manque HT au
 * rapport TTC/HT des marchandises DÉJÀ au panier, sur la même base (après
 * remises, avant le bon) — `ceil(manque × TTC / HT)`, arrondi au centime
 * SUPÉRIEUR pour ne jamais annoncer un manque trop petit. Ce que le client
 * ajoutera n'aura pas forcément ce taux : d'où « environ ».
 *
 * Arithmétique entière (argent en centimes). `null` sans base positive : on
 * n'invente pas de taux.
 */
export function remainingTtcCentsOf(
  remainingHtCents: number,
  goodsNetHtCents: number,
  goodsNetTtcCents: number,
): number | null {
  if (goodsNetHtCents <= 0 || goodsNetTtcCents < 0) {
    return null;
  }
  const scaled = remainingHtCents * goodsNetTtcCents;
  return Math.floor((scaled + goodsNetHtCents - 1) / goodsNetHtCents);
}
