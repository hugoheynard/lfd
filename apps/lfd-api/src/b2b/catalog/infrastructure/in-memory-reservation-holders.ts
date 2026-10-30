import type { ReservationHolders } from "../../shared/company-standing/domain/reservation-holders.js";
import { ReservationHoldersReader } from "../domain/ports/reservation-holders.reader.js";

/**
 * **Les principaux actifs en mémoire**, pour les suites d'application : une
 * société sans entrée n'a pas de principal actif. Un double, pas une source —
 * la source est `PrismaReservationHoldersReader`.
 */
export class InMemoryReservationHolders extends ReservationHoldersReader {
  readonly asked: string[] = [];

  constructor(private readonly activePrincipals: ReadonlyMap<string, string> = new Map()) {
    super();
  }

  holdersOf(companyId: string): Promise<ReservationHolders> {
    this.asked.push(companyId);
    return Promise.resolve({
      companyId,
      activePrincipalId: this.activePrincipals.get(companyId) ?? null,
    });
  }
}
