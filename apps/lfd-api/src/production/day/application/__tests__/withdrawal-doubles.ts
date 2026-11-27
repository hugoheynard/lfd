import { OrderWithdrawalLedger } from "../../domain/ports/order-withdrawal.ledger.js";
import { OrderWithdrawalsReader } from "../../domain/ports/order-withdrawals.reader.js";
import {
  type WithdrawalAfterInscription,
  WithdrawalsAfterInscriptionReader,
} from "../../domain/ports/withdrawals-after-inscription.reader.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * Les retraits d'une journée, en mémoire, avec la sémantique de la table :
 * une ligne par commande, un second retrait n'écrit rien. Lecture ET écriture
 * sur la même mémoire, pour qu'un test voie le retrait qu'il vient de poser.
 * `trace` reçoit les lectures, pour éprouver l'ordre avec le verrou.
 */
export class InMemoryWithdrawals extends OrderWithdrawalsReader {
  readonly rows = new Map<
    string,
    { readonly day: string; readonly at: Date; readonly afterInscription: boolean }
  >();

  constructor(private readonly trace: string[] = []) {
    super();
  }

  withdrawnOn(day: ServiceDay): Promise<ReadonlySet<string>> {
    this.trace.push(`withdrawals:${day.value}`);
    const ids = [...this.rows.entries()]
      .filter(([, row]) => row.day === day.value)
      .map(([orderId]) => orderId);
    return Promise.resolve(new Set(ids));
  }
}

/** Le registre, écrit dans la même mémoire que {@link InMemoryWithdrawals}. */
export class InMemoryWithdrawalLedger extends OrderWithdrawalLedger {
  constructor(
    private readonly withdrawals: InMemoryWithdrawals,
    private readonly trace: string[] = [],
  ) {
    super();
  }

  record(day: ServiceDay, orderId: string, at: Date, afterInscription: boolean): Promise<void> {
    this.trace.push(`record:${orderId}`);
    if (!this.withdrawals.rows.has(orderId)) {
      this.withdrawals.rows.set(orderId, { day: day.value, at, afterInscription });
    }
    return Promise.resolve();
  }
}

/** Les retraits après inscription, lus dans la même mémoire que {@link InMemoryWithdrawals}. */
export class InMemoryWithdrawalsAfterInscription extends WithdrawalsAfterInscriptionReader {
  constructor(private readonly withdrawals: InMemoryWithdrawals) {
    super();
  }

  afterInscriptionOn(day: ServiceDay): Promise<readonly WithdrawalAfterInscription[]> {
    return Promise.resolve(
      [...this.withdrawals.rows.entries()]
        .filter(([, row]) => row.day === day.value && row.afterInscription)
        .map(([orderId, row]) => ({ orderId, at: row.at })),
    );
  }
}
