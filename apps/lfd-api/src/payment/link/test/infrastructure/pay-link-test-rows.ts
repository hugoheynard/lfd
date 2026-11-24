import { InvalidPayLinkTestError } from "../domain/errors/pay-link-test-errors.js";
import { isPayLinkTestState, PayLinkTest } from "../domain/pay-link-test.js";

/** Une ligne `payment.pay_link_test`, telle que Prisma la rend. */
export interface PayLinkTestRow {
  readonly id: string;
  readonly amountCents: number;
  readonly state: string;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
  readonly paidAt: Date | null;
  readonly refundedAt: Date | null;
}

/** @throws {InvalidPayLinkTestError} un état que le CHECK aurait dû refuser. */
export function toDomain(row: PayLinkTestRow): PayLinkTest {
  const { state } = row;
  if (!isPayLinkTestState(state)) {
    throw new InvalidPayLinkTestError(`l'état « ${state} » est inconnu`);
  }
  return PayLinkTest.rehydrate({ ...row, state });
}
