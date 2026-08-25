import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import type {
  BillingAddressPayload,
  CompanyAddressesView,
  DeliveryAddressPayload,
} from "@lfd/contracts";

import { DomainEventPublisher } from "../../../../../platform/events/domain-event-publisher.js";
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

function addressesRecorder(recorder: Recorder): CompanyAddressRepository {
  return {
    saveBilling: () => {
      recorder.writes.push("billing");
      return Promise.resolve();
    },
    addDelivery: () => {
      recorder.writes.push("add");
      return Promise.resolve("addr_new");
    },
    updateDelivery: () => {
      recorder.writes.push("update");
      return Promise.resolve();
    },
    archiveDelivery: () => {
      recorder.writes.push("archive");
      return Promise.resolve();
    },
    setDefaultDelivery: () => {
      recorder.writes.push("default");
      return Promise.resolve();
    },
  };
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

    await new AddDeliveryAddressHandler(admin, repo, events()).execute(
      new AddDeliveryAddressCommand("u1", "c1", DELIVERY),
    );
    await new UpdateDeliveryAddressHandler(admin, repo).execute(
      new UpdateDeliveryAddressCommand("u1", "c1", "a1", DELIVERY),
    );
    await new SetDefaultDeliveryAddressHandler(admin, repo).execute(
      new SetDefaultDeliveryAddressCommand("u1", "c1", "a1"),
    );
    await new RemoveDeliveryAddressHandler(admin, repo).execute(
      new RemoveDeliveryAddressCommand("u1", "c1", "a1"),
    );

    expect(recorder.writes).toEqual(["add", "update", "default", "archive"]);
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
