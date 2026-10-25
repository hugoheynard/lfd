import { OrderInscriptionReader } from "../../channels/commerce/order-inscription.reader.js";
import { OrderWithdrawalLedger } from "../../domain/ports/order-withdrawal.ledger.js";
import { OrderWithdrawalsReader } from "../../domain/ports/order-withdrawals.reader.js";
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

/** Les inscriptions du fournil, données d'avance : commande → jour. */
export class FixedInscriptions extends OrderInscriptionReader {
  constructor(
    private readonly inscribed: ReadonlyMap<string, string> = new Map(),
    private readonly trace: string[] = [],
  ) {
    super();
  }

  inscribedDayOf(orderId: string): Promise<string | null> {
    this.trace.push(`inscription:${orderId}`);
    return Promise.resolve(this.inscribed.get(orderId) ?? null);
  }
}
