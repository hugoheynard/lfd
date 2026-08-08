import { Company } from "../../../domain/entities/company.js";
import { CompanyDeclaredEvent } from "../../../domain/events/company-declared.event.js";
import { EstablishmentDirectory } from "../../../domain/ports/establishment-directory.js";
import { CompanyRepository, type KbisLocation } from "../../../domain/ports/company.repository.js";
import { ContactDetails } from "../../../domain/value-objects/contact-details.js";
import { OnCompanyDeclaredResolveNaf } from "../on-company-declared-resolve-naf.handler.js";

const CONTACT = {
  firstName: "Marie",
  lastName: "Blanc",
  fonction: "",
  email: "marie@example.fr",
  phone: "",
};

/** Société persistée (a un id) au NAF encore vide. */
function reconstituted(): Company {
  return Company.reconstitute({
    id: "company_1",
    raisonSociale: "Le Génépi",
    enseigne: "",
    formeJuridique: "SAS",
    siret: "81245678900021",
    tvaIntracom: "",
    contact: ContactDetails.create(CONTACT),
    paymentTerm: "per_order",
    requestedPaymentTerm: null,
    status: "pending",
    activatedAt: null,
    nafCode: "",
  });
}

/** Double d'écriture : ne sert que `load`/`save`, le reste n'est jamais appelé. */
class FakeCompanyRepository extends CompanyRepository {
  saved: Company | null = null;

  constructor(private readonly stored: Company | null) {
    super();
  }

  load(): Promise<Company | null> {
    return Promise.resolve(this.stored);
  }

  save(company: Company): Promise<void> {
    this.saved = company;
    return Promise.resolve();
  }

  existsBySiret(): Promise<boolean> {
    throw new Error("non utilisé");
  }
  declareOwnedBy(): Promise<string> {
    throw new Error("non utilisé");
  }
  declareUnowned(): Promise<string> {
    throw new Error("non utilisé");
  }
  saveKbisMetadata(): Promise<void> {
    throw new Error("non utilisé");
  }
  kbisLocation(): Promise<KbisLocation | null> {
    throw new Error("non utilisé");
  }
}

class FakeDirectory extends EstablishmentDirectory {
  constructor(private readonly naf: string | null) {
    super();
  }
  resolveNaf(): Promise<string | null> {
    return Promise.resolve(this.naf);
  }
}

const EVENT = new CompanyDeclaredEvent("company_1", "self", "user_1");

describe("OnCompanyDeclaredResolveNaf", () => {
  it("résout le NAF depuis le SIRET et le persiste sur la société", async () => {
    const repo = new FakeCompanyRepository(reconstituted());
    const handler = new OnCompanyDeclaredResolveNaf(repo, new FakeDirectory("56.10A"));

    await handler.handle(EVENT);

    expect(repo.saved?.nafCode).toBe("56.10A");
  });

  it("ne touche à rien si le SIRET est introuvable (best-effort)", async () => {
    const repo = new FakeCompanyRepository(reconstituted());
    const handler = new OnCompanyDeclaredResolveNaf(repo, new FakeDirectory(null));

    await handler.handle(EVENT);

    expect(repo.saved).toBeNull();
  });

  it("no-op si la société n'existe pas", async () => {
    const repo = new FakeCompanyRepository(null);
    const handler = new OnCompanyDeclaredResolveNaf(repo, new FakeDirectory("56.10A"));

    await handler.handle(EVENT);

    expect(repo.saved).toBeNull();
  });
});
