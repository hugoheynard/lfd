import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** Nom STABLE du fait durable — clé de routage vers ses abonnés. */
export const PERIOD_QUOTE_ISSUED = "period_quote.issued";

/**
 * **Un devis de période est rangé** (plan `plan-clients-publics-chorus.md`,
 * § 6 sexies, QD4) — écrit dans la boîte d'envoi, dans la transaction qui l'a
 * rangé : son abonné rend le PDF et l'envoie au contact facturation, et
 * seulement si le rangement est validé. `{ quoteId }`, rien d'autre : l'abonné
 * relit le devis. Clé : `period_quote.issued:<quoteId>` — une version ne naît
 * qu'une fois.
 */
export class PeriodQuoteIssuedFact implements DurableEvent {
  constructor(readonly quoteId: string) {}

  durableFact(): DurableFact {
    return {
      type: PERIOD_QUOTE_ISSUED,
      key: `${PERIOD_QUOTE_ISSUED}:${this.quoteId}`,
      payload: { quoteId: this.quoteId },
    };
  }

  /** @throws {PeriodQuoteIssuedPayloadError} */
  static fromPayload(payload: Readonly<Record<string, unknown>>): PeriodQuoteIssuedFact {
    const quoteId = payload["quoteId"];
    if (typeof quoteId !== "string" || quoteId.length === 0) {
      throw new PeriodQuoteIssuedPayloadError();
    }
    return new PeriodQuoteIssuedFact(quoteId);
  }
}

/** Un fait illisible : rien n'est envoyé, le message reste dans la boîte d'envoi. */
export class PeriodQuoteIssuedPayloadError extends TechnicalError {
  constructor() {
    super(
      "accounting.period_quote.issued_payload_invalid",
      "Le fait « devis de période rangé » est illisible (devis manquant) : personne n'a été prévenu. Corriger l'émetteur puis rejouer le message depuis la carte de santé.",
    );
  }
}
