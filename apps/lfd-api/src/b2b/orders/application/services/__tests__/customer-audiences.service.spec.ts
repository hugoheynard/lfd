import {
  CompanyStatusReader,
  type OrderCompanyStatus,
} from "../../../domain/ports/company-status.reader.js";
import { CustomerAudiences } from "../customer-audiences.service.js";

/** Un lecteur de statut qui compte ses lectures : le visiteur ne doit rien coûter. */
class StatusReader extends CompanyStatusReader {
  reads = 0;

  constructor(private readonly status: OrderCompanyStatus | null) {
    super();
  }

  companyStatusOf(): Promise<OrderCompanyStatus | null> {
    this.reads += 1;
    return Promise.resolve(this.status);
  }
}

/**
 * La clientèle d'une requête — B2B pour une société ACTIVE seulement (Hugo,
 * 2026-09-15, Q3 du plan `remise-et-livraison-par-clientele`).
 */
describe("CustomerAudiences", () => {
  it("un visiteur ou l'espace perso est B2C, sans lire la base", async () => {
    const reader = new StatusReader("active");

    expect(await new CustomerAudiences(reader).of(null)).toBe("b2c");
    expect(reader.reads).toBe(0);
  });

  it("une société active est B2B", async () => {
    expect(await new CustomerAudiences(new StatusReader("active")).of("co_1")).toBe("b2b");
  });

  /**
   * Déclarer une société ne demande aucune vérification : une remise « pros
   * seulement » ne doit pas s'obtenir en tapant un SIRET.
   */
  it.each<OrderCompanyStatus>(["pending", "suspended", "terminated"])(
    "une société %s suit les règles B2C",
    async (status) => {
      expect(await new CustomerAudiences(new StatusReader(status)).of("co_1")).toBe("b2c");
    },
  );

  it("une société introuvable suit les règles B2C", async () => {
    expect(await new CustomerAudiences(new StatusReader(null)).of("co_absente")).toBe("b2c");
  });
});
