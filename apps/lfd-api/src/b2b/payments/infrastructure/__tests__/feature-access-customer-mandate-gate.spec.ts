import { FeatureLevelResolver } from "../../../feature-access/application/feature-level.resolver.js";
import { FeatureLevelLookup } from "../../../feature-access/domain/ports/feature-level.lookup.js";
import { FeatureAccessCustomerMandateGate } from "../feature-access-customer-mandate-gate.js";

/** Une base en mémoire : une dérogation par clé, et des adresses exemptées partout. */
class StubLookup extends FeatureLevelLookup {
  constructor(private readonly override: string | null) {
    super();
  }

  storedOverride(): Promise<string | null> {
    return Promise.resolve(this.override);
  }

  isExempt(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

function gate(override: string | null): FeatureAccessCustomerMandateGate {
  return new FeatureAccessCustomerMandateGate(new FeatureLevelResolver(new StubLookup(override)));
}

describe("FeatureAccessCustomerMandateGate — le drapeau du mandat client", () => {
  it("est fermé par défaut, même quand toutes les adresses seraient exemptées", async () => {
    await expect(gate(null).isOpen()).resolves.toBe(false);
  });

  it("s'ouvre sur la dérogation « open » posée pour tous", async () => {
    await expect(gate("open").isOpen()).resolves.toBe(true);
  });

  it("reste fermé sur une valeur qui n'est pas un niveau de la clé", async () => {
    await expect(gate("visible").isOpen()).resolves.toBe(false);
  });
});
