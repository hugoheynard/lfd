import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { CardPayment } from "../domain/entities/card-payment.js";
import {
  cardPaymentRoleOf,
  cardPaymentStateOf,
} from "../domain/value-objects/card-payment-state.js";

/** La ligne de `payment.card_payment` telle que Prisma la rend — confinée à `infrastructure/`. */
export interface CardPaymentRow {
  readonly id: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly account: string;
  readonly providerRef: string | null;
  readonly role: string;
  readonly amountCents: number;
  readonly state: string;
  readonly createdAt: Date;
  readonly paidAt: Date | null;
  readonly payLinkId: string | null;
}

/** Une valeur d'enum que ce binaire ne connaît pas : un schéma en avance, pas une donnée à deviner. */
export class UnknownCardPaymentValueError extends TechnicalError {
  constructor(column: string, value: string) {
    super(
      "payment.card_payment_row.unknown_value",
      `payment.card_payment.${column} vaut « ${value} », que ce binaire ne connaît pas : ` +
        "le schéma est en avance sur le code déployé.",
    );
  }
}

/** Ligne → agrégat ; ses value objects revalident. */
export function toDomain(row: CardPaymentRow): CardPayment {
  const state = cardPaymentStateOf(row.state);
  if (state === null) {
    throw new UnknownCardPaymentValueError("state", row.state);
  }
  const role = cardPaymentRoleOf(row.role);
  if (role === null) {
    throw new UnknownCardPaymentValueError("role", row.role);
  }
  return CardPayment.rehydrate({ ...row, state, role });
}
