import { BusinessError, TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import { RevisionIntoClosedDayError } from "./order-revision-errors.js";
import { ProductionPlanClosedError } from "./production-plan-closed.error.js";

/**
 * Les refus de l'**application d'une hausse payée** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.5) — chacun
 * devient le `refusal` du projet, et le complément est rendu (R8). Lus au
 * journal par l'équipe, et par le client dans son e-mail : ils nomment le cas.
 */

/** Le code d'un plan arrêté, quel que soit le garde qui l'a vu (R6). */
const PLAN_CLOSED = "plan_closed";

/**
 * R6 (Q5) : le plan de la journée est arrêté — refusé pour TOUS les auteurs,
 * l'équipe comprise : un complément payé ne fait pas entrer une hausse « hors
 * plan » au fournil sans que personne la voie.
 */
export class CardIncreasePlanClosedError extends BusinessError {
  /** Le code écrit dans `order_revision_proposal.refusal` (§2.6). */
  readonly refusal = PLAN_CLOSED;

  constructor(
    readonly orderId: string,
    readonly day: string,
  ) {
    super(
      "orders.card_increase.plan_closed",
      `Le fournil a arrêté la production du ${day} pendant le paiement du complément : la modification ` +
        "n'est plus possible, la commande garde sa composition et le complément est rendu sur la carte.",
    );
  }
}

/**
 * R7 : le total recomposé n'est plus le total payé — un prix, une promotion
 * ou un bon a bougé. Aucune variation n'est absorbée, même favorable.
 */
export class CardIncreaseTotalChangedError extends BusinessError {
  /** Le code écrit dans `order_revision_proposal.refusal` (§2.6). */
  readonly refusal = "total_changed";

  constructor(
    readonly orderId: string,
    readonly paidCents: number,
    readonly nowCents: number,
  ) {
    super(
      "orders.card_increase.total_changed",
      `Le total de la modification a changé depuis le paiement (${String(paidCents)} → ${String(nowCents)} centimes) : ` +
        "elle n'est pas appliquée, la commande garde sa composition et le complément est rendu sur la carte.",
    );
  }
}

/** « Relancer » sans complément en panne : rien à relancer. */
export class NoStalledComplementError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.card_increase.nothing_to_relaunch",
      "Aucun complément en panne n'attend d'être relancé sur cette commande : il a été appliqué, refusé ou " +
        "repris entre-temps. Rechargez la fiche pour voir où il en est.",
    );
  }
}

/** Sous le verrou, le projet relu `ready` n'a pas pu s'écrire : la base et le code divergent. */
export class CardIncreaseNotWrittenError extends TechnicalError {
  constructor(proposalId: string, gesture: string) {
    super(
      "orders.card_increase.not_written",
      `Le projet de hausse ${proposalId} relu sous verrou n'a pas pu être ${gesture} : la base et le code divergent. ` +
        "Le balayage le reprendra ; s'il reste bloqué, signaler l'incohérence à l'équipe technique.",
    );
  }
}

/**
 * Le refus métier qui devient le `refusal` du projet : un code court, ou le
 * code de l'erreur. Un plan arrêté se dit `plan_closed` qu'il soit vu par la
 * garde propre au projet ou, pour un client, déjà par la recomposition
 * (`ensureDayOpen`, `holdDay`) : c'est le même cas (R6, Q5).
 */
export function increaseRefusalOf(error: { readonly code: string }): string {
  if (
    error instanceof CardIncreasePlanClosedError ||
    error instanceof CardIncreaseTotalChangedError
  ) {
    return error.refusal;
  }
  if (error instanceof ProductionPlanClosedError || error instanceof RevisionIntoClosedDayError) {
    return PLAN_CLOSED;
  }
  return error.code;
}
