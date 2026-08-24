import {
  CompanyAdminRequiredError,
  CompanyNotFoundError,
} from "../../../domain/errors/account-errors.js";
import { Company } from "../../../domain/entities/company.js";
import { CompanyContactRepository } from "../../../domain/ports/company-contact.repository.js";
import { CompanyMemberRepository } from "../../../domain/ports/company-member.repository.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import { MembershipReader } from "../../../domain/ports/membership.reader.js";
import type { CompanyRole } from "../../../domain/value-objects/company-role.js";
import { ContactDetails } from "../../../domain/value-objects/contact-details.js";
import { CompanyContactBook } from "../../services/company-contact-book.service.js";
import { AddCompanyContactHandler } from "../add-company-contact.handler.js";
import {
  AddCompanyContactCommand,
  RemoveCompanyContactCommand,
  UpdateCompanyContactCommand,
  UpdatePrimaryContactCommand,
} from "../contact-commands.js";
import { RemoveCompanyContactHandler } from "../remove-company-contact.handler.js";
import { UpdateCompanyContactHandler } from "../update-company-contact.handler.js";
import { UpdatePrimaryContactHandler } from "../update-primary-contact.handler.js";

/** Un interlocuteur du carnet — distinct du détenteur de la société témoin. */
const DETAILS = {
  firstName: "Karim",
  lastName: "Benali",
  fonction: "",
  email: "achats@pqmarais.fr",
  phone: "",
};

/** Le détenteur de la société témoin, aplati sur elle. */
const HOLDER = {
  firstName: "Camille",
  lastName: "Rousseau",
  fonction: "",
  email: "camille@pqmarais.fr",
  phone: "",
};

/** Journalise ce que chaque port a reçu, pour prouver ce qui a (ou non) été touché. */
interface Recorder {
  readonly writes: string[];
}

function membershipReturning(role: CompanyRole | null): MembershipReader {
  return { roleOf: () => Promise.resolve(role) };
}

/**
 * Le carnet, monté sur des ports doublés.
 *
 * Les handlers ne parlent plus au dépôt directement : ses deux règles (une
 * adresse, un rôle) valent des deux côtés du comptoir, elles vivent donc dans
 * le carnet. Le test garde la même question — le mur a-t-il laissé passer ? —
 * en observant ce qui a été écrit.
 */
function bookRecorder(recorder: Recorder): CompanyContactBook {
  return new CompanyContactBook(
    companiesRecorder(recorder),
    contactsRecorder(recorder),
    membersStub(),
  );
}

/** Aucun accès ouvert : le carnet n'a alors aucun rôle à aligner. */
function membersStub(): CompanyMemberRepository {
  return {
    rebindSubject: () => Promise.resolve(),
    findAccountByEmail: () => Promise.resolve(null),
    findOwner: () => Promise.resolve(null),
    createInvited: () => Promise.resolve("user_new"),
    attach: () => Promise.resolve(),
    alignRole: () => Promise.resolve(),
    findMember: () => Promise.resolve(null),
  };
}

function contactsRecorder(recorder: Recorder): CompanyContactRepository {
  return {
    add: () => {
      recorder.writes.push("add");
      return Promise.resolve("contact_new");
    },
    update: () => {
      recorder.writes.push("update");
      return Promise.resolve();
    },
    remove: () => {
      recorder.writes.push("remove");
      return Promise.resolve();
    },
  };
}

/** Une société reconstituée (l'agrégat que `load` rend au handler). */
function sampleCompany(): Company {
  return Company.reconstitute({
    id: "c1",
    raisonSociale: "PQ Marais",
    enseigne: "Le Pain Quotidien",
    formeJuridique: "SAS",
    siret: "81245678900021",
    vatNumber: "",
    contact: ContactDetails.create(HOLDER),
    grantedTerms: [],
    requestedTerm: null,
    status: "pending",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  });
}

function companiesRecorder(recorder: Recorder): CompanyRepository {
  return {
    declareUnowned: () => Promise.resolve(""),
    saveKbisCertification: () => Promise.resolve(),
    existsBySiret: () => Promise.resolve(false),
    declareOwnedBy: () => Promise.resolve("company_new"),
    load: () => Promise.resolve(sampleCompany()),
    save: () => {
      recorder.writes.push("primary");
      return Promise.resolve();
    },
    saveKbisMetadata: () => Promise.resolve(),
    kbisLocation: () => Promise.resolve(null),
  };
}

/**
 * Chaque handler de contact enchaîne toujours : lire le rôle → passer le mur →
 * agir. On vérifie les deux refus (non-membre, simple membre) et le passage du
 * gestionnaire, en s'assurant qu'un refus n'a **rien écrit**.
 */
describe("handlers de contacts — le mur owner/admin", () => {
  it("le gestionnaire édite le contact principal ; un refus n'écrit rien", async () => {
    const recorder: Recorder = { writes: [] };
    const handler = new UpdatePrimaryContactHandler(
      membershipReturning("owner"),
      companiesRecorder(recorder),
    );

    await handler.execute(new UpdatePrimaryContactCommand("u1", "c1", DETAILS));
    expect(recorder.writes).toEqual(["primary"]);
  });

  it("un non-membre reçoit 404 et rien n'est écrit", async () => {
    const recorder: Recorder = { writes: [] };
    const handler = new AddCompanyContactHandler(membershipReturning(null), bookRecorder(recorder));

    await expect(
      handler.execute(new AddCompanyContactCommand("u1", "c1", DETAILS, "orders")),
    ).rejects.toBeInstanceOf(CompanyNotFoundError);
    expect(recorder.writes).toEqual([]);
  });

  it("un simple membre reçoit 403 et rien n'est écrit", async () => {
    const recorder: Recorder = { writes: [] };
    const handler = new UpdateCompanyContactHandler(
      membershipReturning("orders"),
      bookRecorder(recorder),
    );

    await expect(
      handler.execute(new UpdateCompanyContactCommand("u1", "c1", "ct1", DETAILS, "orders")),
    ).rejects.toBeInstanceOf(CompanyAdminRequiredError);
    expect(recorder.writes).toEqual([]);
  });

  it("le gestionnaire ajoute, modifie et retire un contact", async () => {
    const recorder: Recorder = { writes: [] };
    const admin = membershipReturning("owner");
    const book = bookRecorder(recorder);

    await new AddCompanyContactHandler(admin, book).execute(
      new AddCompanyContactCommand("u1", "c1", DETAILS, "orders"),
    );
    await new UpdateCompanyContactHandler(admin, book).execute(
      new UpdateCompanyContactCommand("u1", "c1", "ct1", DETAILS, "orders"),
    );
    await new RemoveCompanyContactHandler(admin, contactsRecorder(recorder)).execute(
      new RemoveCompanyContactCommand("u1", "c1", "ct1"),
    );

    expect(recorder.writes).toEqual(["add", "update", "remove"]);
  });
});
