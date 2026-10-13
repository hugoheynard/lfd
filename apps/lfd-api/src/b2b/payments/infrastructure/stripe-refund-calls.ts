import Stripe from "stripe";

import { PAYMENT_REFUND_STATUSES } from "../domain/payment-gateway.js";
import type {
  IssuedRefund,
  RefundIssuance,
  RefundLookup,
  RefundRequestParams,
} from "../domain/payment-refunder.js";

/**
 * Les options PAR REQUÊTE des appels de remboursement (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C4.7) : le client est
 * construit sans options (`new Stripe(secretKey)`), et le bail de
 * l'exécuteur (5 min) doit rester plus long que l'appel le plus long —
 * recherche puis création, chacune 3 × 20 s au pire.
 */
const REFUND_CALL_OPTIONS = { timeout: 20_000, maxNetworkRetries: 2 } as const;

/** La page de la recherche — le plafond de Stripe. */
const PAGE_SIZE = 100;

/** Stripe date ses objets en secondes Unix. */
const MS_PER_SECOND = 1000;

/** Les métadonnées posées sur un `re_…` que NOUS émettons. Valeurs stables. */
export const REFUND_METADATA = {
  request: "lfd_refund_request",
  generation: "lfd_generation",
  order: "lfd_order_id",
} as const;

/** Codes d'erreur Stripe (`StripeError.code`) lus par la traduction. */
const ALREADY_REFUNDED = "charge_already_refunded";
const KEY_IN_USE = "idempotency_key_in_use";
/** Un conflit (409) : une autre requête tient la clé. Jamais un refus définitif. */
const HTTP_CONFLICT = 409;

/** Un remboursement mort ne compte pas : « Relancer » doit en émettre un autre. */
const DEAD: ReadonlySet<string> = new Set(["failed", "canceled"]);

/**
 * **Les appels de remboursement**, sur un client Stripe donné — à part de
 * l'adaptateur Nest pour se laisser éprouver avec un faux transport HTTP.
 * Ne lève jamais.
 */
export class StripeRefundCalls {
  constructor(private readonly client: Stripe) {}

  async refundRemainder(params: RefundRequestParams): Promise<RefundIssuance> {
    const found = await this.findRefund(params);
    if (found.kind === "found") {
      return { kind: "issued", refund: found.refund };
    }
    if (found.kind === "unavailable") {
      return found;
    }
    try {
      // 🔴 Sans `amount` : Stripe rend le reste remboursable, jamais plus (C4.4).
      const refund = await this.client.refunds.create(
        {
          payment_intent: params.paymentIntentId,
          reason: "requested_by_customer",
          metadata: {
            [REFUND_METADATA.request]: params.requestId,
            [REFUND_METADATA.generation]: String(params.generation),
            [REFUND_METADATA.order]: params.requestId,
          },
        },
        { ...REFUND_CALL_OPTIONS, idempotencyKey: params.key },
      );
      const issued = issuedOf(refund);
      return issued === null
        ? {
            kind: "unavailable",
            reason: `statut de remboursement inconnu (${refund.status ?? "nul"})`,
          }
        : { kind: "issued", refund: issued };
    } catch (error) {
      return issuanceFromError(error);
    }
  }

  /**
   * Tous rounds confondus, toutes pages : c'est ce qui rend le rejeu sûr après
   * un `COMMIT` perdu, et au-delà des 24 h où Stripe garde une clé.
   */
  async findRefund(params: RefundRequestParams): Promise<RefundLookup> {
    try {
      const pages = this.client.refunds.list(
        { payment_intent: params.paymentIntentId, limit: PAGE_SIZE },
        REFUND_CALL_OPTIONS,
      );
      for await (const refund of pages) {
        const issued = isOurs(refund, params) ? issuedOf(refund) : null;
        if (issued !== null) {
          return { kind: "found", refund: issued };
        }
      }
      return { kind: "none" };
    } catch (error) {
      return { kind: "unavailable", reason: reasonOf(error) };
    }
  }
}

/** De cette demande, de cette génération, et vivant. */
function isOurs(refund: Stripe.Refund, params: RefundRequestParams): boolean {
  const metadata = refund.metadata ?? {};
  return (
    metadata[REFUND_METADATA.request] === params.requestId &&
    metadata[REFUND_METADATA.generation] === String(params.generation) &&
    !DEAD.has(refund.status ?? "")
  );
}

/** `null` : un statut que le port ne connaît pas — ne pas le faire passer pour un autre. */
function issuedOf(refund: Stripe.Refund): IssuedRefund | null {
  const status = PAYMENT_REFUND_STATUSES.find((known) => known === refund.status);
  if (status === undefined) {
    return null;
  }
  return {
    refundId: refund.id,
    amountCents: refund.amount,
    currency: refund.currency,
    status,
    createdAt: new Date(refund.created * MS_PER_SECOND),
  };
}

/**
 * Ce que `refunds.create` a levé (C4.7, 3) : tout rendu → `nothing_left` ;
 * clé en cours ou conflit → `unavailable`, JAMAIS `declined` ; un autre refus
 * de requête ou de carte → `declined` avec son code ; le reste (réseau, 5xx,
 * 429, authentification) → `unavailable`.
 */
export function issuanceFromError(error: unknown): RefundIssuance {
  if (!(error instanceof Stripe.errors.StripeError)) {
    return { kind: "unavailable", reason: reasonOf(error) };
  }
  if (error.code === ALREADY_REFUNDED) {
    return { kind: "nothing_left" };
  }
  if (
    error.code === KEY_IN_USE ||
    error.statusCode === HTTP_CONFLICT ||
    error instanceof Stripe.errors.StripeIdempotencyError
  ) {
    return { kind: "unavailable", reason: reasonOf(error) };
  }
  if (
    error instanceof Stripe.errors.StripeInvalidRequestError ||
    error instanceof Stripe.errors.StripeCardError
  ) {
    return { kind: "declined", code: error.code ?? error.type };
  }
  return { kind: "unavailable", reason: reasonOf(error) };
}

function reasonOf(error: unknown): string {
  if (error instanceof Stripe.errors.StripeError) {
    return `${error.type}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "erreur inconnue";
}
