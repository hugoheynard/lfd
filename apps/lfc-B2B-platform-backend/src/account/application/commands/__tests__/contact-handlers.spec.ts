import {
  CompanyAdminRequiredError,
  CompanyNotFoundError,
} from "../../../domain/errors/account-errors.js";
import { Company } from "../../../domain/entities/company.js";
import { CompanyContactRepository } from "../../../domain/ports/company-contact.repository.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import { MembershipReader } from "../../../domain/ports/membership.reader.js";
import type { CompanyRole } from "../../../domain/value-objects/company-role.js";
import { ContactDetails } from "../../../domain/value-objects/contact-details.js";
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

const DETAILS = {
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
    tvaIntracom: "",
    contact: ContactDetails.create(DETAILS),
    paymentTerm: "per_order",
    requestedPaymentTerm: null,
    status: "pending",
    activatedAt: null,
    nafCode: "",
  });
}

function companiesRecorder(recorder: Recorder): CompanyRepository {
  return {
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
    const handler = new AddCompanyContactHandler(
      membershipReturning(null),
      contactsRecorder(recorder),
    );

    await expect(
      handler.execute(new AddCompanyContactCommand("u1", "c1", DETAILS)),
    ).rejects.toBeInstanceOf(CompanyNotFoundError);
    expect(recorder.writes).toEqual([]);
  });

  it("un simple membre reçoit 403 et rien n'est écrit", async () => {
    const recorder: Recorder = { writes: [] };
    const handler = new UpdateCompanyContactHandler(
      membershipReturning("member"),
      contactsRecorder(recorder),
    );

    await expect(
      handler.execute(new UpdateCompanyContactCommand("u1", "c1", "ct1", DETAILS)),
    ).rejects.toBeInstanceOf(CompanyAdminRequiredError);
    expect(recorder.writes).toEqual([]);
  });

  it("le gestionnaire ajoute, modifie et retire un contact", async () => {
    const recorder: Recorder = { writes: [] };
    const admin = membershipReturning("owner");
    const contacts = contactsRecorder(recorder);

    await new AddCompanyContactHandler(admin, contacts).execute(
      new AddCompanyContactCommand("u1", "c1", DETAILS),
    );
    await new UpdateCompanyContactHandler(admin, contacts).execute(
      new UpdateCompanyContactCommand("u1", "c1", "ct1", DETAILS),
    );
    await new RemoveCompanyContactHandler(admin, contacts).execute(
      new RemoveCompanyContactCommand("u1", "c1", "ct1"),
    );

    expect(recorder.writes).toEqual(["add", "update", "remove"]);
  });
});
