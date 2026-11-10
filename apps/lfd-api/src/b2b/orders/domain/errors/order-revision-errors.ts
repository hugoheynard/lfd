import {
  BusinessError,
  DomainError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";
import type { CancellationBlock } from "../../cancellation/domain/services/order-cancellation.js";
import { voucherEuros } from "../../cancellation/domain/services/order-cancellation-voucher.js";
import {
  CARD_SETTLED_REVISION_REFUSAL,
  NO_SALES_TERMS_REVISION_REFUSAL,
  type StandingRevisionBlock,
} from "../services/order-revisability.js";
import { revisionRefusalOf } from "../services/order-revision-refusal.js";

/**
 * Les refus de la **modification d'une commande** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification »). Lus par
 * l'équipe et par le client : chacun nomme le cas et le geste de sortie.
 */

/**
 * Pourquoi une révision carte n'a pas de chemin (plan S2, R2 bis, R15 ; plan
 * S1, R2, R12) : un premier paiement pas encore encaissé, une carte déjà
 * rendue en entier, une hausse — que M1 ne fait pas (elle passe par un projet
 * de complément) —, ou une hausse composée par l'équipe (Q3 a). Un total
 * égal se règle comme la commande (`same_settlement`).
 */
export type CardRevisionRefusal = "unsettled" | "refunded" | "increase" | "increase_by_staff";

/**
 * R15 (plan S2, Q3 a) : la hausse composée par l'équipe nomme son geste de
 * sortie. Les autres raisons gardent la phrase d'aujourd'hui (§2.9) : le
 * client qui augmente passe par le complément, et l'écran le dira (S2.d).
 */
const STAFF_INCREASE_REFUSAL =
  "Cette commande est payée par carte : l'équipe ne peut pas l'augmenter. " +
  "Demandez au client de modifier sa commande, ou passez une seconde commande.";

/** Plan S1, R1, R2 : tout est déjà rendu — il n'y a plus rien à modifier ni à rendre. */
const REFUNDED_REVISION_REFUSAL =
  "Cette commande a déjà été remboursée en entier : elle ne se modifie plus. " +
  "Passez une nouvelle commande si besoin.";

/** La phrase d'une raison de refus carte, lue par l'équipe sous le bouton grisé. */
export function cardRevisionRefusalWords(reason: CardRevisionRefusal | null): string {
  switch (reason) {
    case "increase_by_staff":
      return STAFF_INCREASE_REFUSAL;
    case "refunded":
      return REFUNDED_REVISION_REFUSAL;
    default:
      return CARD_SETTLED_REVISION_REFUSAL;
  }
}

/**
 * § 2.7 : M1 ne modifie pas une commande payable par carte. `reason` : le tri de
 * l'agrégat (plan S2, R2 bis, R15), `null` quand le refus tombe avant la
 * composition (la frontière commune, `card_settled`, sur le chemin d'une
 * DEMANDE). Le code ne change pas : les écrans qui le lisent le gardent
 * (§2.9) ; la phrase ne change que pour l'équipe qui augmente (R15).
 */
export class CardOrderNotRevisableError extends BusinessError {
  constructor(
    readonly orderId: string,
    readonly reason: CardRevisionRefusal | null = null,
  ) {
    super("orders.revise.card_settled", cardRevisionRefusalWords(reason));
  }
}

/** R1 : la même frontière que l'annulation — annulée, prête, inscrite, engagée… */
export class OrderNotRevisableError extends BusinessError {
  constructor(
    readonly orderId: string,
    readonly block: CancellationBlock,
  ) {
    super(`orders.revise.${block.kind}`, revisionRefusalOf(block));
  }
}

/** R7 : la révision portée n'est plus la courante. */
export class OrderRevisedElsewhereError extends BusinessError {
  constructor(
    readonly orderId: string,
    readonly expectedRevision: number,
  ) {
    super(
      "orders.revise.stale_revision",
      "La commande a été modifiée ailleurs entre-temps : rechargez-la, puis refaites la modification.",
    );
  }
}

/** R6 : une modification qui ne change rien ne crée pas de révision vide. */
export class UnchangedOrderRevisionError extends DomainError {
  constructor(readonly orderId: string) {
    super(
      "orders.revise.unchanged",
      "La modification ne change rien à la commande : rien n'a été enregistré.",
    );
  }
}

/** § 2.3 (R4), bon de fidélité : sa restitution partielle n'existe pas. */
export class RevisionBelowVoucherError extends BusinessError {
  constructor(
    readonly orderId: string,
    readonly voucherAppliedCents: number,
  ) {
    super(
      "orders.revise.below_voucher",
      `La commande modifiée descendrait sous le bon de fidélité déjà déduit (${voucherEuros(voucherAppliedCents)} HT) : ` +
        "retirez moins d'articles, ou annulez et recommandez.",
    );
  }
}

/** § 2.3 (refus de règlement) : une commande gratuite qui deviendrait payante se règle par carte — lot M2. */
export class RevisionRequiresPaymentError extends BusinessError {
  constructor(
    readonly orderId: string,
    readonly totalCents: number,
  ) {
    super(
      "orders.revise.requires_payment",
      `Cette commande ne coûtait rien ; modifiée, elle coûterait ${voucherEuros(totalCents)} à régler par carte, ` +
        "ce qui ne se fait pas encore par une modification : annulez-la et recommandez, ou demandez au commerce.",
    );
  }
}

/**
 * Une commande au compte qui tomberait à zéro quitterait le prélèvement : M1
 * ne sait pas fermer sa ligne d'encaissement autrement que par l'annulation.
 */
export class RevisionFreesAccountOrderError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.revise.would_be_free",
      "Modifiée ainsi, cette commande au compte ne coûterait plus rien : annulez-la plutôt, et recommandez si besoin.",
    );
  }
}

/** Une révision ne déplace pas une commande vers une journée dont le plan est arrêté. */
export class RevisionIntoClosedDayError extends BusinessError {
  constructor(readonly serviceDay: string) {
    const [, month = "", day = ""] = serviceDay.split("-");
    super(
      "orders.revise.closed_day",
      `Le plan du fournil est déjà arrêté pour le ${day}/${month} : la commande ne peut pas y être déplacée. ` +
        "Choisissez un autre jour.",
    );
  }
}

/** R3, tenu par l'agrégat : une ligne déjà présente n'a pas gardé son prix figé. */
export class FrozenLinePriceChangedError extends DomainError {
  constructor(readonly sku: string) {
    super(
      "orders.revise.frozen_price_changed",
      `La ligne ${sku} était déjà dans la commande : elle doit garder son prix d'origine. ` +
        "Rien n'a été modifié ; signalez-le à l'équipe technique.",
    );
  }
}

/** Une commande d'avant les CGV figées n'a pas de quoi être recomposée. */
export class OrderWithoutSalesTermsError extends TechnicalError {
  constructor(readonly orderId: string) {
    super("orders.revise.no_sales_terms", NO_SALES_TERMS_REVISION_REFUSAL);
  }
}

/** Le refus du geste pour un blocage commun (R1, § 2.3) — le verdict des vues, levé. */
export function standingRevisionErrorOf(
  orderId: string,
  block: StandingRevisionBlock,
): OrderNotRevisableError | CardOrderNotRevisableError | OrderWithoutSalesTermsError {
  switch (block.kind) {
    case "order":
      return new OrderNotRevisableError(orderId, block.block);
    case "card_settled":
      return new CardOrderNotRevisableError(orderId, block.unsettled ? "unsettled" : null);
    case "without_sales_terms":
      return new OrderWithoutSalesTermsError(orderId);
  }
}

/** E6b, plan § 12.2 : la décision et la commande ne divergent jamais. */
export class ShortfallDecidedRevisionError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.revise.shortfall_decided",
      "Le départ incomplet de cette commande est décidé : elle ne se modifie plus, pour que la décision et la commande disent la même chose. " +
        "Pour ajouter des articles, passez une nouvelle commande.",
    );
  }
}

/**
 * Plan A2, § 7 : après l'arrêt du plan, une révision ne change que des
 * quantités — ni date, ni acheminement, ni note, ni article.
 */
export class QuantitiesOnlyAfterArrestError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.revise.quantities_only",
      "Le plan du fournil est arrêté pour cette commande : seules les quantités des articles déjà commandés se modifient, " +
        "et chacune reste d'au moins 1. Remettez la date, l'acheminement, la note et les articles tels qu'ils étaient, " +
        "ou annulez la commande.",
    );
  }
}

/**
 * Plan A2, § 7, B2 : la feuille du colisage n'est pas encore écrite — la
 * fenêtre entre l'arrêt et la livraison de la liste dure quelques secondes.
 */
export class PackingSheetNotYetDrawnError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.revise.packing_not_drawn",
      "Le colisage n'a pas encore reçu cette commande, qui vient d'être inscrite au plan : rien n'a été modifié. " +
        "Réessayez dans quelques secondes.",
    );
  }
}
