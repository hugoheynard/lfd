import { Company } from "../../../domain/entities/company.js";
import { CompanyDeclaredEvent } from "../../../domain/events/company-declared.event.js";
import { CompanyNafWriter } from "../../../domain/ports/company-naf.writer.js";
import { EstablishmentDirectory } from "../../../domain/ports/establishment-directory.js";
import { CompanyRepository, type KbisLocation } from "../../../domain/ports/company.repository.js";
import { ContactDetails } from "../../../domain/value-objects/contact-details.js";
import { OnCompanyDeclaredResolveNaf } from "../on-company-declared-resolve-naf.handler.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";

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
    enseigne: "Le Pain Quotidien",
    formeJuridique: "SAS",
    siret: "81245678900021",
    vatNumber: "",
    contact: ContactDetails.create(CONTACT),
    grantedTerms: [],
    requestedTerm: null,
    status: "pending",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  });
}

/**
 * La « base » : une ligne d'état, rechargée en agrégat neuf à chaque `load` —
 * deux gestes concurrents voient donc chacun SA copie, comme en production.
 */
class StoredCompanies extends CompanyRepository {
  fullSaves = 0;
  private row: Company | null;

  constructor(initial: Company | null) {
    super();
    this.row = initial;
  }

  /** L'état persisté, tel qu'un lecteur suivant le relirait. */
  get stored(): Company | null {
    return this.row;
  }

  load(): Promise<Company | null> {
    return Promise.resolve(this.row === null ? null : copyOf(this.row));
  }

  save(company: Company): Promise<void> {
    this.fullSaves += 1;
    this.row = copyOf(company);
    return Promise.resolve();
  }

  /** L'écriture ciblée du NAF : ne remplace QUE cette colonne. */
  patchNaf(company: Company): void {
    if (this.row !== null) {
      this.row.assignNaf(company.nafCode);
    }
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
  kbisLocation(): Promise<KbisLocation | null> {
    throw new Error("non utilisé");
  }
}

class StoredNafWriter extends CompanyNafWriter {
  writes = 0;
  constructor(private readonly store: StoredCompanies) {
    super();
  }
  saveNaf(company: Company): Promise<void> {
    this.writes += 1;
    this.store.patchNaf(company);
    return Promise.resolve();
  }
}

/** Rejoue l'agrégat depuis son état persisté : une copie indépendante. */
function copyOf(company: Company): Company {
  const state = company.toPersistence();
  return Company.reconstitute({
    id: company.id ?? "company_1",
    raisonSociale: state.raisonSociale,
    enseigne: state.enseigne,
    formeJuridique: state.formeJuridique,
    siret: state.siret ?? "",
    vatNumber: state.vatNumber,
    contact: ContactDetails.create(CONTACT),
    grantedTerms: state.grantedTerms,
    requestedTerm: state.requestedTerm,
    status: state.status,
    activatedAt: state.activatedAt,
    activatedBy: state.activatedBy,
    suspensionCause: state.suspensionCause,
    nafCode: state.nafCode,
  });
}

/** L'API entreprises, retenue tant que le test ne la libère pas. */
class HeldDirectory extends EstablishmentDirectory {
  private release: ((naf: string | null) => void) | null = null;
  asked = false;

  resolveNaf(): Promise<string | null> {
    this.asked = true;
    return new Promise((resolve) => {
      this.release = resolve;
    });
  }

  answer(naf: string | null): void {
    this.release?.(naf);
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

const EVENT = new CompanyDeclaredEvent("company_1", "Le Pain Quotidien", "self", { id: "user_1" });

const STAFF = { staffUserId: "staff_1", name: "Jeanne Martin", role: "admin" };
const ACTIVATED_AT = new Date("2026-08-11T10:00:00.000Z");

function handlerOn(
  store: StoredCompanies,
  directory: EstablishmentDirectory,
  work: BackgroundWork,
) {
  const writer = new StoredNafWriter(store);
  return { writer, handler: new OnCompanyDeclaredResolveNaf(store, writer, directory, work) };
}

describe("OnCompanyDeclaredResolveNaf", () => {
  const work = new BackgroundWork();

  /**
   * Régression (2026-10-01) : la société activée et créditée PENDANT l'appel à
   * l'API entreprises retombait `pending`, sans terme, au `save` du NAF.
   */
  it("n'efface ni l'activation ni le terme posés pendant l'attente de l'API entreprises", async () => {
    const store = new StoredCompanies(reconstituted());
    const directory = new HeldDirectory();
    const { handler } = handlerOn(store, directory, work);

    handler.handle(EVENT);
    await Promise.resolve();
    await Promise.resolve();
    expect(directory.asked).toBe(true);

    // Le staff active et accorde un terme pendant que l'API ne répond pas.
    const meanwhile = await store.load();
    meanwhile?.activate(ACTIVATED_AT, true, STAFF);
    meanwhile?.grantTerms(["monthly"]);
    if (meanwhile !== null) {
      await store.save(meanwhile);
    }

    directory.answer("56.10A");
    await work.whenIdle();

    expect(store.stored?.status).toBe("active");
    expect(store.stored?.grantedTerms).toEqual(["monthly"]);
    expect(store.stored?.nafCode).toBe("56.10A");
    expect(store.fullSaves).toBe(1);
  });

  it("résout le NAF depuis le SIRET et le persiste sur la société", async () => {
    const store = new StoredCompanies(reconstituted());
    const { handler, writer } = handlerOn(store, new FakeDirectory("56.10A"), work);

    handler.handle(EVENT);
    await work.whenIdle();

    expect(store.stored?.nafCode).toBe("56.10A");
    expect(writer.writes).toBe(1);
    expect(store.fullSaves).toBe(0);
  });

  it("ne touche à rien si le SIRET est introuvable (best-effort)", async () => {
    const store = new StoredCompanies(reconstituted());
    const { handler, writer } = handlerOn(store, new FakeDirectory(null), work);

    handler.handle(EVENT);
    await work.whenIdle();

    expect(writer.writes).toBe(0);
    expect(store.fullSaves).toBe(0);
  });

  it("no-op si la société n'existe pas", async () => {
    const store = new StoredCompanies(null);
    const { handler, writer } = handlerOn(store, new FakeDirectory("56.10A"), work);

    handler.handle(EVENT);
    await work.whenIdle();

    expect(writer.writes).toBe(0);
  });
});
