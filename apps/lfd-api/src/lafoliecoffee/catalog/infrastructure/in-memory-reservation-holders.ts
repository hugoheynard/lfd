import type {
  HoldersWithMenu,
  MenuReading,
} from "../../shared/company-standing/domain/sub-account-menu-reading.js";
import { ReservationHoldersReader } from "../domain/ports/reservation-holders.reader.js";

/**
 * **Les principaux actifs en mémoire**, pour les suites d'application : une
 * société sans entrée n'a pas de principal actif. Un double, pas une source —
 * la source est `PrismaReservationHoldersReader`.
 */
export class InMemoryReservationHolders extends ReservationHoldersReader {
  readonly asked: string[] = [];

  constructor(
    private readonly activePrincipals: ReadonlyMap<string, string> = new Map(),
    /** La carte qui COMPTE, par société — déjà jugée « principal actif » par la suite. */
    private readonly menus: ReadonlyMap<string, MenuReading> = new Map(),
  ) {
    super();
  }

  holdersOf(companyId: string): Promise<HoldersWithMenu> {
    this.asked.push(companyId);
    return Promise.resolve({
      companyId,
      activePrincipalId: this.activePrincipals.get(companyId) ?? null,
      menu: this.menus.get(companyId) ?? null,
    });
  }
}
