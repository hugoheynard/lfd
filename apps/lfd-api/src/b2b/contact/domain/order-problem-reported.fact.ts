import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const ORDER_PROBLEM_REPORTED = "order.problem_reported";

/** La société au nom de laquelle le problème est signalé, figée au geste. */
export interface ReportingSite {
  readonly companyId: string;
  /** Son nom d'usage au moment du geste. */
  readonly name: string;
  /**
   * Le principal COPIÉ sur la commande à sa passation
   * (`orders.principal_company_id`), ou `null` : aucun, ou commande d'avant
   * la copie. Jamais relu dans la hiérarchie.
   */
  readonly principalCompanyId: string | null;
}

/**
 * **Un client a signalé un problème sur une commande d'entreprise** — écrit
 * par `contact/` dans la transaction qui range la demande
 * (`plan-notifications-sous-comptes.md`, N4a). Le contexte ne sait pas qui
 * l'écoute.
 *
 * La charge porte ce qu'il faut pour agir sans rouvrir la base : la commande
 * par son numéro, le site et son principal FIGÉS au geste, l'auteur. Jamais
 * le motif, le message ni les photos : la demande s'anonymise à douze mois,
 * la boîte d'envoi ne doit pas en garder une copie.
 *
 * Clé : `order.problem_reported:<requestId>` — un fait par signalement.
 * Deux signalements de la même commande font deux faits.
 */
export class OrderProblemReportedFact implements DurableEvent {
  constructor(
    readonly requestId: string,
    readonly orderId: string,
    readonly orderNumber: string,
    readonly site: ReportingSite,
    /** Le client qui signale. Un signalement n'a pas de geste équipe (vérifié le 2026-10-20). */
    readonly authorUserId: string,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_PROBLEM_REPORTED,
      key: `${ORDER_PROBLEM_REPORTED}:${this.requestId}`,
      payload: {
        requestId: this.requestId,
        orderId: this.orderId,
        orderNumber: this.orderNumber,
        siteCompanyId: this.site.companyId,
        siteName: this.site.name,
        principalCompanyId: this.site.principalCompanyId,
        authorUserId: this.authorUserId,
      },
    };
  }

  /** @throws {OrderProblemReportedPayloadError} charge hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderProblemReportedFact {
    const { requestId, orderId, orderNumber, siteCompanyId, siteName, principalCompanyId } =
      payload;
    const { authorUserId } = payload;
    if (
      !isText(requestId) ||
      !isText(orderId) ||
      !isText(orderNumber) ||
      !isText(siteCompanyId) ||
      !isText(siteName) ||
      !isText(authorUserId) ||
      !(principalCompanyId === null || isText(principalCompanyId))
    ) {
      throw new OrderProblemReportedPayloadError();
    }
    return new OrderProblemReportedFact(
      requestId,
      orderId,
      orderNumber,
      { companyId: siteCompanyId, name: siteName, principalCompanyId },
      authorUserId,
    );
  }
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Un fait « problème signalé » illisible : personne n'est prévenu, le message reste visible. */
export class OrderProblemReportedPayloadError extends TechnicalError {
  constructor() {
    super(
      "order_problem_reported.payload_invalid",
      "Le fait « problème de commande signalé » est illisible : le principal du site n'a pas " +
        "été prévenu. La demande elle-même est bien enregistrée. Le message reste dans la boîte " +
        "d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
