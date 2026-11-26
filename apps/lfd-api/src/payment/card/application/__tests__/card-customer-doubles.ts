import type { Clock } from "../../../../platform/time/clock.js";
import { CardCustomerReader } from "../../domain/ports/card-customer.reader.js";
import {
  type CardCustomerLink,
  CardCustomerRecorder,
} from "../../domain/ports/card-customer.recorder.js";
import type { PaymentAccount } from "../../domain/value-objects/payment-account.js";
import { CardCustomerResolution } from "../card-customer-resolution.js";

/** La table `payment.card_customer` en mémoire : `(compte, personne) → client`. */
export class InMemoryCardCustomers extends CardCustomerReader {
  readonly rows = new Map<string, string>();

  static keyOf(account: string, userId: string): string {
    return `${account}|${userId}`;
  }

  find(account: PaymentAccount, userId: string): Promise<string | null> {
    return Promise.resolve(
      this.rows.get(InMemoryCardCustomers.keyOf(account.name, userId)) ?? null,
    );
  }
}

/** Son écriture : la première correspondance gagne, comme `ON CONFLICT DO NOTHING`. */
export class InMemoryCardCustomerRecorder extends CardCustomerRecorder {
  constructor(private readonly table: InMemoryCardCustomers) {
    super();
  }

  record(link: CardCustomerLink): Promise<string> {
    const key = InMemoryCardCustomers.keyOf(link.account.name, link.userId);
    const existing = this.table.rows.get(key);
    if (existing !== undefined) {
      return Promise.resolve(existing);
    }
    this.table.rows.set(key, link.customerRef);
    return Promise.resolve(link.customerRef);
  }
}

/** La résolution des clients sur une table en mémoire, rendue avec elle. */
export function inMemoryCustomerResolution(clock: Clock): {
  readonly table: InMemoryCardCustomers;
  readonly resolution: CardCustomerResolution;
} {
  const table = new InMemoryCardCustomers();
  return {
    table,
    resolution: new CardCustomerResolution(table, new InMemoryCardCustomerRecorder(table), clock),
  };
}
