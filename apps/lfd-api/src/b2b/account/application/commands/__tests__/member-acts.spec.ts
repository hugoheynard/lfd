import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CompanyContactBook } from "../../services/company-contact-book.service.js";
import { AddCompanyContactHandler } from "../add-company-contact.handler.js";
import { AddDeliveryAddressHandler } from "../add-delivery-address.handler.js";
import {
  AddDeliveryAddressCommand,
  RemoveDeliveryAddressCommand,
  SaveBillingAddressCommand,
  SetDefaultDeliveryAddressCommand,
  UpdateDeliveryAddressCommand,
} from "../address-commands.js";
import {
  PreferFulfillmentCommand,
  RequestPaymentTermCommand,
  UpdateCompanyIdentityCommand,
} from "../company-settings-commands.js";
import {
  AddCompanyContactCommand,
  RemoveCompanyContactCommand,
  UpdateCompanyContactCommand,
  UpdatePrimaryContactCommand,
} from "../contact-commands.js";
import { PreferFulfillmentHandler } from "../prefer-fulfillment.handler.js";
import { RemoveCompanyContactHandler } from "../remove-company-contact.handler.js";
import { RemoveDeliveryAddressHandler } from "../remove-delivery-address.handler.js";
import { RequestPaymentTermHandler } from "../request-payment-term.handler.js";
import { SaveBillingAddressHandler } from "../save-billing-address.handler.js";
import { SetDefaultDeliveryAddressHandler } from "../set-default-delivery-address.handler.js";
import { UpdateCompanyContactHandler } from "../update-company-contact.handler.js";
import { UpdateCompanyIdentityHandler } from "../update-company-identity.handler.js";
import { UpdateDeliveryAddressHandler } from "../update-delivery-address.handler.js";
import { UpdatePrimaryContactHandler } from "../update-primary-contact.handler.js";
import {
  AddressReaderWithA1,
  BILLING,
  DELIVERY,
  EMAIL,
  InMemoryAddresses,
  InMemoryCompanies,
  InMemoryContacts,
  NoKnownMembers,
  OwnerMembership,
  PHONE,
  STREET,
} from "./member-acts-doubles.js";

/**
 * **Ce que le client inscrit quand il touche au compte de sa société** (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, tranche
 * (c), 2026-09-19) : le même nom de fait que le geste staff jumeau, et jamais
 * une coordonnée — une adresse par son id et son libellé, un contact par son id.
 */
function build() {
  const events = new RecordingPublisher();
  const uow = new DirectUnitOfWork();
  const member = new OwnerMembership();
  const addresses = new InMemoryAddresses();
  const companies = new InMemoryCompanies();
  const contacts = new InMemoryContacts();
  const book = new CompanyContactBook(companies, contacts, new NoKnownMembers());
  const clock = new FixedClock(new Date("2026-02-03T10:00:00Z"));
  return { events, uow, member, addresses, companies, contacts, book, clock };
}

/** Aucune coordonnée semée n'apparaît dans les faits écrits. */
function expectNoContactDetails(events: RecordingPublisher): void {
  const written = JSON.stringify(events.traced.map((event) => event.journalFact()));
  for (const secret of [STREET, EMAIL, PHONE, BILLING.ville, BILLING.codePostal]) {
    expect(written).not.toContain(secret);
  }
}

describe("les adresses, par le client", () => {
  it("facturation, ajout, correction, défaut, archivage : un fait chacun, sans l'adresse", async () => {
    const { events, uow, member, addresses, companies, clock } = build();

    await new SaveBillingAddressHandler(member, addresses, events, uow).execute(
      new SaveBillingAddressCommand("u1", "c1", BILLING),
    );
    const added = await new AddDeliveryAddressHandler(
      member,
      addresses,
      events,
      new FixedIdGenerator("addr"),
      clock,
      uow,
    ).execute(new AddDeliveryAddressCommand("u1", "c1", DELIVERY));
    await new UpdateDeliveryAddressHandler(member, addresses, events, uow).execute(
      new UpdateDeliveryAddressCommand("u1", "c1", added, DELIVERY),
    );
    await new SetDefaultDeliveryAddressHandler(member, addresses, events, uow).execute(
      new SetDefaultDeliveryAddressCommand("u1", "c1", added),
    );
    await new RemoveDeliveryAddressHandler(
      member,
      addresses,
      companies,
      clock,
      events,
      uow,
    ).execute(new RemoveDeliveryAddressCommand("u1", "c1", "a1"));

    expect(events.traced.map((event) => event.journalFact())).toEqual([
      fact("company.billing_address_saved", { label: "Siège" }),
      fact("company.delivery_address_added", { addressId: added, label: "Boutique" }),
      fact("company.delivery_address_updated", { addressId: added, label: "Boutique" }),
      fact("company.default_delivery_set", { addressId: added }),
      fact("company.delivery_address_removed", { addressId: "a1" }),
    ]);
    expectNoContactDetails(events);
  });

  it("la préférence d'acheminement garde les champs du staff — aucun n'est une coordonnée", async () => {
    const { events, uow, member, companies } = build();
    const preference = {
      method: "delivery" as const,
      pickupAddressId: null,
      deliveryAddressId: "a1",
      signatureRequired: false,
    };

    await new PreferFulfillmentHandler(
      member,
      companies,
      new AddressReaderWithA1(),
      events,
      uow,
    ).execute(new PreferFulfillmentCommand("u1", "c1", preference));

    expect(events.traced.map((event) => event.journalFact())).toEqual([
      fact("company.fulfillment_preference_set", preference),
    ]);
  });
});

describe("les contacts, par le client", () => {
  it("ajout, correction, retrait, principal : l'id et le rôle, jamais l'e-mail ni le téléphone", async () => {
    const { events, uow, member, companies, contacts, book } = build();
    const details = {
      firstName: "Karim",
      lastName: "Benali",
      fonction: "",
      email: EMAIL,
      phone: PHONE,
    };

    const contactId = await new AddCompanyContactHandler(member, book, events, uow).execute(
      new AddCompanyContactCommand("u1", "c1", details, "orders"),
    );
    await new UpdateCompanyContactHandler(member, book, events, uow).execute(
      new UpdateCompanyContactCommand("u1", "c1", contactId, details, "admin"),
    );
    await new RemoveCompanyContactHandler(member, contacts, events, uow).execute(
      new RemoveCompanyContactCommand("u1", "c1", contactId),
    );
    await new UpdatePrimaryContactHandler(member, companies, events, uow).execute(
      new UpdatePrimaryContactCommand("u1", "c1", details),
    );

    expect(events.traced.map((event) => event.journalFact())).toEqual([
      fact("company.contact_added", { contactId, role: "orders" }),
      fact("company.contact_updated", { contactId, role: "admin" }),
      fact("company.contact_removed", { contactId }),
      fact("company.primary_contact_changed", {}),
    ]);
    expectNoContactDetails(events);
  });
});

describe("l'identité et le délai, par le client", () => {
  const IDENTITY = {
    raisonSociale: "",
    enseigne: "Le Pain Quotidien",
    formeJuridique: "SAS",
    siret: "",
    siren: "",
    vatNumber: "FR40812456789",
  };

  it("l'identité éditée nomme les champs changés, sans leurs valeurs", async () => {
    const { events, uow, member, companies } = build();

    await new UpdateCompanyIdentityHandler(member, companies, events, uow).execute(
      new UpdateCompanyIdentityCommand("u1", "c1", IDENTITY),
    );

    expect(events.factTypes()).toEqual(["company.identity_edited"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      fields: ["vatNumber", "formeJuridique"],
    });
    expect(JSON.stringify(events.traced[0]?.journalFact())).not.toContain("FR40812456789");
  });

  it("un envoi qui ne change rien n'écrit aucun fait", async () => {
    const { events, uow, member, companies } = build();
    const handler = new UpdateCompanyIdentityHandler(member, companies, events, uow);
    await handler.execute(new UpdateCompanyIdentityCommand("u1", "c1", IDENTITY));

    await handler.execute(new UpdateCompanyIdentityCommand("u1", "c1", IDENTITY));

    expect(events.factTypes()).toEqual(["company.identity_edited"]);
  });

  it("le délai demandé dit la demande d'avant et celle d'après", async () => {
    const { events, uow, member, companies } = build();

    await new RequestPaymentTermHandler(member, companies, events, uow).execute(
      new RequestPaymentTermCommand("u1", "c1", "monthly"),
    );

    expect(events.traced.map((event) => event.journalFact())).toEqual([
      fact("company.payment_term_requested", { before: null, after: "monthly" }),
    ]);
  });
});

function fact(type: string, payload: Record<string, unknown>) {
  return { type, subjectType: "company", subjectId: "c1", payload };
}
