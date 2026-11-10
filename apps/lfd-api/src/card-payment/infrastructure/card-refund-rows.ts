import { TechnicalError } from "../../platform/shared/errors/app-error.js";
import type { CardRefundLine } from "../domain/entities/card-refund-ledger.js";
import { CardRefundRequest } from "../domain/entities/card-refund-request.js";
import {
  CARD_REFUND_FORMS,
  CARD_REFUND_NATURES,
  CARD_REFUND_REQUEST_STATES,
  CARD_REFUND_SOURCES,
  CARD_REFUND_STATUSES,
  oneOfValues,
} from "../domain/value-objects/card-refund-values.js";

/** La ligne de `card_payment.refund_request` telle que Prisma la rend — confinée à `infrastructure/`. */
export interface CardRefundRequestRow {
  readonly id: string;
  readonly paymentId: string;
  readonly form: string;
  readonly amountCents: number | null;
  readonly nature: string;
  readonly reason: string;
  readonly state: string;
  readonly announcedCents: number;
  readonly issuedCents: number | null;
  readonly requestedAt: Date;
  readonly requestedBy: string | null;
  readonly generation: number;
  readonly round: number;
  readonly attempts: number;
  readonly providerRef: string | null;
  readonly issuedAt: Date | null;
  readonly lastFailure: string | null;
  readonly lastAttemptAt: Date | null;
  readonly claimedUntil: Date | null;
  readonly claimToken: string | null;
  readonly nextAttemptAt: Date | null;
  readonly settledByStaffId: string | null;
  readonly settledReason: string | null;
}

/** La ligne de `card_payment.refund` telle que Prisma la rend. */
export interface CardRefundRow {
  readonly id: string;
  readonly paymentId: string;
  readonly requestId: string | null;
  readonly nature: string | null;
  readonly source: string;
  readonly providerRef: string | null;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: string;
  readonly refundedAt: Date;
  readonly recordedAt: Date;
  readonly updatedAt: Date;
}

/** Une valeur d'enum que ce binaire ne connaît pas : un schéma en avance, pas une donnée à deviner. */
export class UnknownCardRefundValueError extends TechnicalError {
  constructor(column: string, value: string) {
    super(
      "card_payment.refund_row.unknown_value",
      `card_payment.${column} vaut « ${value} », que ce binaire ne connaît pas : ` +
        "le schéma est en avance sur le code déployé.",
    );
  }
}

function known<T extends string>(values: readonly T[], raw: string, column: string): T {
  const value = oneOfValues(values, raw);
  if (value === null) {
    throw new UnknownCardRefundValueError(column, raw);
  }
  return value;
}

/** Ligne → agrégat. */
export function requestOf(row: CardRefundRequestRow): CardRefundRequest {
  return CardRefundRequest.rehydrate({
    ...row,
    form: known(CARD_REFUND_FORMS, row.form, "refund_request.form"),
    nature: known(CARD_REFUND_NATURES, row.nature, "refund_request.nature"),
    state: known(CARD_REFUND_REQUEST_STATES, row.state, "refund_request.state"),
  });
}

/** Ligne → ligne du carnet. */
export function lineOf(row: CardRefundRow): CardRefundLine {
  return {
    id: row.id,
    requestId: row.requestId,
    nature: row.nature === null ? null : known(CARD_REFUND_NATURES, row.nature, "refund.nature"),
    source: known(CARD_REFUND_SOURCES, row.source, "refund.source"),
    providerRef: row.providerRef,
    amountCents: row.amountCents,
    currency: row.currency,
    status: known(CARD_REFUND_STATUSES, row.status, "refund.status"),
    refundedAt: row.refundedAt,
    recordedAt: row.recordedAt,
    updatedAt: row.updatedAt,
  };
}
