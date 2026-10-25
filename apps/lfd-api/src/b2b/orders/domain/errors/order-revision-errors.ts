import {
  BusinessError,
  DomainError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";
import type { CancellationBlock } from "../services/order-cancellation.js";
import { voucherEuros } from "../services/order-cancellation-voucher.js";
import {
  CARD_SETTLED_REVISION_REFUSAL,
  NO_SALES_TERMS_REVISION_REFUSAL,
  type StandingRevisionBlock,
} from "../services/order-revisability.js";
import { revisionRefusalOf } from "../services/order-revision-refusal.js";

/**
 * Les refus de la **modification d'une commande** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M1). Lus par
 * l'équipe et par le client : chacun nomme le cas et le geste de sortie.
 */

/** §9 : M1 ne modifie pas une commande payable par carte — c'est le lot M2. */
export class CardOrderNotRevisableError extends BusinessError {
  constructor(readonly orderId: string) {
    super("orders.revise.card_settled", CARD_SETTLED_REVISION_REFUSAL);
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

/** §9, bon de fidélité : sa restitution partielle n'existe pas. */
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

/** §3 et §9 : une commande gratuite qui deviendrait payante se règle par carte — lot M2. */
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

/** Le refus du geste pour un blocage commun (R1, §9) — le verdict des vues, levé. */
export function standingRevisionErrorOf(
  orderId: string,
  block: StandingRevisionBlock,
): OrderNotRevisableError | CardOrderNotRevisableError | OrderWithoutSalesTermsError {
  switch (block.kind) {
    case "order":
      return new OrderNotRevisableError(orderId, block.block);
    case "card_settled":
      return new CardOrderNotRevisableError(orderId);
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
