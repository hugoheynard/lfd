import { OrderInscriptionReader } from "../order-inscription.reader.js";

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
