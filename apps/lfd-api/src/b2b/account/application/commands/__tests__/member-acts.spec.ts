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
  COMPANY_LABEL,
  DELIVERY,
  EMAIL,
  InMemoryAddresses,
  InMemoryCompanies,
  InMemoryContacts,
  NoKnownMembers,
  OwnerMembership,
  journalNames,
  PHONE,
  STREET,
} from "./member-acts-doubles.js";

/**
 * **Ce que le client inscrit quand il touche au compte de sa société** (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, tranche
 * (c), 2026-09-19) : le même nom de fait que le geste staff jumeau, et jamais
 * une coordonnée de personne — une adresse par la charge du staff (id, ville,
 * code postal ; alignée le 2026-09-19, décision de Hugo), un contact par son id.
 *
 * Lot B du plan des phrases (même jour) : chaque fait nomme la société au
 * moment du geste, et cite l'adresse ou le contact avec son nom du moment.
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
  const names = journalNames(companies, addresses);
  return { events, uow, member, addresses, companies, contacts, book, clock, names };
}

/** Aucune coordonnée semée — ni la rue et son numéro, ni l'e-mail, ni le téléphone — n'apparaît dans les faits écrits. */
function expectNoContactDetails(events: RecordingPublisher): void {
  const written = JSON.stringify(events.traced.map((event) => event.journalFact()));
  for (const secret of [STREET, EMAIL, PHONE]) {
    expect(written).not.toContain(secret);
  }
}

/** Ce que le journal garde d'une adresse semée : où, pas à quel numéro de quelle rue. */
const PLACE = { ville: BILLING.ville, codePostal: BILLING.codePostal };

describe("les adresses, par le client", () => {
  it("facturation, ajout, correction, défaut, archivage : un fait chacun, la ville et le code postal sans la rue", async () => {
    const { events, uow, member, addresses, companies, clock, names } = build();

    await new SaveBillingAddressHandler(member, addresses, events, uow, names).execute(
      new SaveBillingAddressCommand("u1", "c1", BILLING),
    );
    const added = await new AddDeliveryAddressHandler(
      member,
      addresses,
      events,
      new FixedIdGenerator("addr"),
      clock,
      uow,
      names,
    ).execute(new AddDeliveryAddressCommand("u1", "c1", DELIVERY));
    await new UpdateDeliveryAddressHandler(member, addresses, events, uow, names).execute(
      new UpdateDeliveryAddressCommand("u1", "c1", added, DELIVERY),
    );
    await new SetDefaultDeliveryAddressHandler(member, addresses, events, uow, names).execute(
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
      fact("company.billing_address_saved", PLACE),
      fact("company.delivery_address_added", { address: placed(added) }),
      fact("company.delivery_address_updated", { address: placed(added) }),
      fact("company.default_delivery_set", { address: placed(added) }),
      // Lue AVANT l'archivage : après, le carnet ne la porte plus.
      fact("company.delivery_address_removed", { address: placed("a1") }),
    ]);
    expectNoContactDetails(events);
    // Régression (lot B, 2026-09-19) : l'adresse était citée par son LIBELLÉ,
    // texte libre du client ; Hugo avait tranché pour la ville et le code
    // postal, comme le staff (`a151ccee`).
    const addressFacts = JSON.stringify(events.traced.slice(1).map((e) => e.journalFact()));
    expect(addressFacts).not.toContain(DELIVERY.label);
    expect(addressFacts).not.toContain(BILLING.label);
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
      fact("company.fulfillment_preference_set", {
        method: "delivery",
        pickupAddressId: null,
        deliveryAddress: placed("a1"),
        signatureRequired: false,
      }),
    ]);
  });
});

describe("les contacts, par le client", () => {
  it("ajout, correction, retrait, principal : l'id, le nom et le rôle, jamais l'e-mail ni le téléphone", async () => {
    const { events, uow, member, companies, contacts, book, names } = build();
    const details = {
      firstName: "Karim",
      lastName: "Benali",
      fonction: "",
      email: EMAIL,
      phone: PHONE,
    };

    const contactId = await new AddCompanyContactHandler(member, book, events, uow, names).execute(
      new AddCompanyContactCommand("u1", "c1", details, "orders"),
    );
    await new UpdateCompanyContactHandler(member, book, events, uow, names).execute(
      new UpdateCompanyContactCommand("u1", "c1", contactId, details, "admin"),
    );
    await new RemoveCompanyContactHandler(member, contacts, events, uow, names).execute(
      new RemoveCompanyContactCommand("u1", "c1", contactId),
    );
    await new UpdatePrimaryContactHandler(member, companies, events, uow).execute(
      new UpdatePrimaryContactCommand("u1", "c1", details),
    );

    expect(events.traced.map((event) => event.journalFact())).toEqual([
      fact("company.contact_added", { contact: karim(contactId), role: "orders" }),
      fact("company.contact_updated", { contact: karim(contactId), role: "admin" }),
      // Le retrait ne relit pas la fiche qu'il efface : l'id seul.
      fact("company.contact_removed", { contact: { id: contactId } }),
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
      subjectLabel: COMPANY_LABEL,
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

/** Un fait sur la société témoin : son nom du moment d'abord, puis la charge du geste. */
function fact(type: string, payload: Record<string, unknown>) {
  return {
    type,
    subjectType: "company",
    subjectId: "c1",
    payload: { subjectLabel: COMPANY_LABEL, ...payload },
  };
}

/** Une adresse de livraison semée, citée par son lieu — jamais par son libellé. */
function placed(id: string) {
  return { id, ...PLACE };
}

/** Le contact semé, nommé — son nom n'est pas une coordonnée. */
function karim(id: string) {
  return { id, name: "Karim Benali" };
}
