import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import type {
  BillingAddressPayload,
  CompanyAddressesView,
  DeliveryAddressPayload,
} from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { DomainEventPublisher } from "../../../../../platform/events/domain-event-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { Company } from "../../../domain/entities/company.js";
import { DeliveryAddressBook } from "../../../domain/entities/delivery-address-book.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import { ContactDetails } from "../../../domain/value-objects/contact-details.js";
import {
  CompanyAdminRequiredError,
  CompanyNotFoundError,
} from "../../../domain/errors/account-errors.js";
import { CompanyAddressReader } from "../../../domain/ports/company-address.reader.js";
import { CompanyAddressRepository } from "../../../domain/ports/company-address.repository.js";
import { MembershipReader } from "../../../domain/ports/membership.reader.js";
import type { CompanyRole } from "../../../domain/value-objects/company-role.js";
import { ListCompanyAddressesQuery } from "../../queries/list-company-addresses.query.js";
import { ListCompanyAddressesHandler } from "../../queries/list-company-addresses.handler.js";
import { AddDeliveryAddressHandler } from "../add-delivery-address.handler.js";
import {
  AddDeliveryAddressCommand,
  RemoveDeliveryAddressCommand,
  SaveBillingAddressCommand,
  SetDefaultDeliveryAddressCommand,
  UpdateDeliveryAddressCommand,
} from "../address-commands.js";
import { RemoveDeliveryAddressHandler } from "../remove-delivery-address.handler.js";
import { SaveBillingAddressHandler } from "../save-billing-address.handler.js";
import { SetDefaultDeliveryAddressHandler } from "../set-default-delivery-address.handler.js";
import { UpdateDeliveryAddressHandler } from "../update-delivery-address.handler.js";

/** Publisher doublé : ignore (les étapes d'activation ne sont pas l'objet de ce spec). */
/** Fabrique un publisher doublé frais. */
function events(): DomainEventPublisher {
  return new RecordingPublisher();
}

const BILLING: BillingAddressPayload = {
  label: "Siège",
  ligne1: "18 rue des Archives",
  ligne2: "",
  codePostal: "75004",
  ville: "Paris",
  pays: "France",
};

const DELIVERY: DeliveryAddressPayload = {
  ...BILLING,
  label: "Boutique",
  isDefault: false,
  specs: {
    signatureRequired: false,
    note: "",
    slots: { mode: "everyday", slot: null },
    deliveryContact: null,
    gps: null,
  },
};

const EMPTY_VIEW: CompanyAddressesView = { billing: null, deliveries: [] };

interface Recorder {
  readonly writes: string[];
}

function membershipReturning(role: CompanyRole | null): MembershipReader {
  return { roleOf: () => Promise.resolve(role) };
}

/**
 * Carnet doublé, **partagé entre les appels** d'un même scénario : c'est ce qui
 * permet d'enchaîner ajout → modification → défaut → archivage sur le même état,
 * et donc de vérifier l'effet de chaque geste plutôt que le seul fait qu'une
 * méthode ait été appelée.
 */
function addressesRecorder(recorder: Recorder): CompanyAddressRepository {
  const book = DeliveryAddressBook.reconstitute({
    companyId: "c1",
    entries: [
      {
        id: "a1",
        lines: { ...BILLING },
        specs: DELIVERY.specs,
        createdAt: new Date("2026-01-01T08:00:00Z"),
        archivedAt: null,
      },
    ],
    defaultId: "a1",
  });
  return {
    saveBilling: () => {
      recorder.writes.push("billing");
      return Promise.resolve();
    },
    loadDeliveryBook: () => Promise.resolve(book),
    saveDeliveryBook: (saved) => {
      recorder.writes.push(`carnet:${saved.deliveries().length}`);
      return Promise.resolve();
    },
  };
}

/** Société doublée — l'archivage la relit pour nettoyer sa préférence. */
function companiesReturningSample(): CompanyRepository {
  const company = Company.reconstitute({
    id: "c1",
    raisonSociale: "PQ Marais",
    enseigne: "Le Pain Quotidien",
    formeJuridique: "SAS",
    siret: "81245678900021",
    vatNumber: "",
    contact: ContactDetails.create({
      firstName: "Camille",
      lastName: "Rousseau",
      fonction: "",
      email: "camille@pqmarais.fr",
      phone: "",
    }),
    grantedTerms: [],
    requestedTerm: null,
    status: "active",
    activatedAt: new Date("2026-01-05T09:00:00Z"),
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  });
  return {
    declareUnowned: () => Promise.resolve(""),
    saveKbisCertification: () => Promise.resolve(),
    existsBySiret: () => Promise.resolve(false),
    declareOwnedBy: () => Promise.resolve("company_new"),
    load: () => Promise.resolve(company),
    save: () => Promise.resolve(),
    saveKbisMetadata: () => Promise.resolve(),
    kbisLocation: () => Promise.resolve(null),
  };
}

/** L'horloge et la fabrique d'identifiants, gelées. */
function clock(): FixedClock {
  return new FixedClock(new Date("2026-02-03T10:00:00Z"));
}

function readerRecorder(recorder: Recorder): CompanyAddressReader {
  return {
    read: () => {
      recorder.writes.push("read");
      return Promise.resolve(EMPTY_VIEW);
    },
  };
}

/**
 * Écritures d'adresses : mur `owner`/`admin` (non-membre → 404, membre → 403,
 * gestionnaire → agit). Lecture : mur `member` (un simple membre lit, un
 * non-membre reçoit 404). Un refus ne doit **rien** toucher.
 */
describe("handlers d'adresses — les murs member / admin", () => {
  it("le gestionnaire enregistre la facturation", async () => {
    const recorder: Recorder = { writes: [] };
    await new SaveBillingAddressHandler(
      membershipReturning("owner"),
      addressesRecorder(recorder),
      events(),
    ).execute(new SaveBillingAddressCommand("u1", "c1", BILLING));
    expect(recorder.writes).toEqual(["billing"]);
  });

  it("un non-membre reçoit 404 et rien n'est écrit", async () => {
    const recorder: Recorder = { writes: [] };
    await expect(
      new AddDeliveryAddressHandler(
        membershipReturning(null),
        addressesRecorder(recorder),
        events(),
        new FixedIdGenerator("addr"),
        clock(),
      ).execute(new AddDeliveryAddressCommand("u1", "c1", DELIVERY)),
    ).rejects.toBeInstanceOf(CompanyNotFoundError);
    expect(recorder.writes).toEqual([]);
  });

  it("un simple membre reçoit 403 et rien n'est écrit", async () => {
    const recorder: Recorder = { writes: [] };
    await expect(
      new UpdateDeliveryAddressHandler(
        membershipReturning("orders"),
        addressesRecorder(recorder),
      ).execute(new UpdateDeliveryAddressCommand("u1", "c1", "a1", DELIVERY)),
    ).rejects.toBeInstanceOf(CompanyAdminRequiredError);
    expect(recorder.writes).toEqual([]);
  });

  it("le gestionnaire ajoute, modifie, définit le défaut et archive", async () => {
    const recorder: Recorder = { writes: [] };
    const admin = membershipReturning("owner");
    const repo = addressesRecorder(recorder);

    await new AddDeliveryAddressHandler(
      admin,
      repo,
      events(),
      new FixedIdGenerator("addr"),
      clock(),
    ).execute(new AddDeliveryAddressCommand("u1", "c1", DELIVERY));
    await new UpdateDeliveryAddressHandler(admin, repo).execute(
      new UpdateDeliveryAddressCommand("u1", "c1", "a1", DELIVERY),
    );
    await new SetDefaultDeliveryAddressHandler(admin, repo).execute(
      new SetDefaultDeliveryAddressCommand("u1", "c1", "a1"),
    );
    await new RemoveDeliveryAddressHandler(
      admin,
      repo,
      companiesReturningSample(),
      clock(),
      new DirectUnitOfWork(),
    ).execute(new RemoveDeliveryAddressCommand("u1", "c1", "a1"));

    // Le carnet compte deux adresses après l'ajout, et retombe à une seule
    // quand `a1` est archivée : chaque geste a bien porté, pas seulement été
    // appelé.
    expect(recorder.writes).toEqual(["carnet:2", "carnet:2", "carnet:2", "carnet:1"]);
  });

  it("un simple membre LIT les adresses ; un non-membre reçoit 404", async () => {
    const recorder: Recorder = { writes: [] };
    await new ListCompanyAddressesHandler(
      membershipReturning("orders"),
      readerRecorder(recorder),
    ).execute(new ListCompanyAddressesQuery("u1", "c1"));
    expect(recorder.writes).toEqual(["read"]);

    await expect(
      new ListCompanyAddressesHandler(membershipReturning(null), readerRecorder(recorder)).execute(
        new ListCompanyAddressesQuery("u1", "c1"),
      ),
    ).rejects.toBeInstanceOf(CompanyNotFoundError);
  });
});
