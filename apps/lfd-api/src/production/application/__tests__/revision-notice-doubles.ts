import { OrderRevisionNoticeLedger } from "../../domain/ports/order-revision-notice.ledger.js";
import { OrderRevisionNoticesReader } from "../../domain/ports/order-revision-notices.reader.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * Les notes de révision, en mémoire, avec la sémantique de la table : en ajout
 * seul, un numéro croissant par note. Lecture ET écriture sur la même mémoire.
 * `trace` reçoit les écritures, pour éprouver l'ordre avec les verrous.
 */
export class InMemoryRevisionNotices extends OrderRevisionNoticesReader {
  readonly rows: { id: number; day: string; orderId: string; revision: number }[] = [];

  markerOf(day: ServiceDay): Promise<number | null> {
    const ids = this.rows.filter((row) => row.day === day.value).map((row) => row.id);
    return Promise.resolve(ids.length === 0 ? null : Math.max(...ids));
  }
}

/** Le registre, écrit dans la même mémoire que {@link InMemoryRevisionNotices}. */
export class InMemoryRevisionNoticeLedger extends OrderRevisionNoticeLedger {
  constructor(
    private readonly notices: InMemoryRevisionNotices,
    private readonly trace: string[] = [],
  ) {
    super();
  }

  record(day: ServiceDay, orderId: string, revision: number): Promise<void> {
    this.trace.push(`note:${day.value}:${orderId}:r${String(revision)}`);
    this.notices.rows.push({ id: this.notices.rows.length + 1, day: day.value, orderId, revision });
    return Promise.resolve();
  }
}

/**
 * Le repère d'une journée, appel après appel : rend la suite qu'on lui
 * donne, puis répète la dernière valeur. Une suite `[null, 1]` dit « une
 * révision a été notée entre la lecture des commandes et le verrou ».
 */
export class SteppedRevisionNotices extends OrderRevisionNoticesReader {
  constructor(private readonly markers: readonly (number | null)[] = [null]) {
    super();
  }

  private calls = 0;

  markerOf(): Promise<number | null> {
    const index = Math.min(this.calls, this.markers.length - 1);
    this.calls += 1;
    return Promise.resolve(this.markers[index] ?? null);
  }
}
