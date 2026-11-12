import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { TablePickupPointNames } from "../../../domain/ports/__tests__/table-pickup-point-names.js";
import { CompanyContactBook } from "../../services/company-contact-book.service.js";
import {
  SaveBillingAddressCommand,
  SetDefaultDeliveryAddressCommand,
  UpdateDeliveryAddressCommand,
} from "../address-commands.js";
import {
  PreferFulfillmentCommand,
  RequestPaymentTermCommand,
} from "../company-settings-commands.js";
import { UpdateCompanyContactCommand, UpdatePrimaryContactCommand } from "../contact-commands.js";
import { GrantTermsCommand } from "../grant-terms.command.js";
import { GrantTermsHandler } from "../grant-terms.handler.js";
import { PreferFulfillmentByStaffCommand } from "../prefer-fulfillment-by-staff.command.js";
import { PreferFulfillmentByStaffHandler } from "../prefer-fulfillment-by-staff.handler.js";
import { PreferFulfillmentHandler } from "../prefer-fulfillment.handler.js";
import { RequestPaymentTermHandler } from "../request-payment-term.handler.js";
import { RevokeKbisCertificationCommand } from "../revoke-kbis-certification.command.js";
import { RevokeKbisCertificationHandler } from "../revoke-kbis-certification.handler.js";
import { SaveBillingAddressByStaffCommand } from "../save-billing-address-by-staff.command.js";
import { SaveBillingAddressByStaffHandler } from "../save-billing-address-by-staff.handler.js";
import { SaveBillingAddressHandler } from "../save-billing-address.handler.js";
import { SetDefaultDeliveryAddressHandler } from "../set-default-delivery-address.handler.js";
import { SetDefaultDeliveryByStaffCommand } from "../set-default-delivery-by-staff.command.js";
import { SetDefaultDeliveryByStaffHandler } from "../set-default-delivery-by-staff.handler.js";
import { UpdateCompanyContactHandler } from "../update-company-contact.handler.js";
import { UpdateContactByStaffCommand } from "../update-contact-by-staff.command.js";
import { UpdateContactByStaffHandler } from "../update-contact-by-staff.handler.js";
import { UpdateDeliveryAddressByStaffCommand } from "../update-delivery-address-by-staff.command.js";
import { UpdateDeliveryAddressByStaffHandler } from "../update-delivery-address-by-staff.handler.js";
import { UpdateDeliveryAddressHandler } from "../update-delivery-address.handler.js";
import { UpdateIdentityByStaffCommand } from "../update-identity-by-staff.command.js";
import { UpdateIdentityByStaffHandler } from "../update-identity-by-staff.handler.js";
import { UpdatePrimaryContactByStaffCommand } from "../update-primary-contact-by-staff.command.js";
import { UpdatePrimaryContactByStaffHandler } from "../update-primary-contact-by-staff.handler.js";
import { UpdatePrimaryContactHandler } from "../update-primary-contact.handler.js";
import {
  AddressReaderWithA1,
  BILLING,
  DELIVERY,
  InMemoryAddresses,
  InMemoryCompanies,
  InMemoryContacts,
  journalNames,
  NoKnownMembers,
  OwnerMembership,
} from "./member-acts-doubles.js";
import { silentGestures } from "./site-gesture-doubles.js";

/**
 * Régression : rejoué (double clic, onglet qui renvoie sa requête), chacun de
 * ces gestes réécrivait sa ligne et journalisait un fait à chaque appel. Le
 * premier appel porte un vrai changement ; le second, identique, n'écrit rien
 * et n'inscrit rien.
 */
function build() {
  const events = new RecordingPublisher();
  const uow = new DirectUnitOfWork();
  const member = new OwnerMembership();
  const companies = new InMemoryCompanies();
  const addresses = new InMemoryAddresses();
  const contacts = new InMemoryContacts();
  const book = new CompanyContactBook(companies, contacts, new NoKnownMembers());
  const names = journalNames(companies, addresses);
  return { events, uow, member, companies, addresses, contacts, book, names };
}

type Built = ReturnType<typeof build>;

/** Joue le geste deux fois : le premier écrit et journalise, le second rien. */
async function expectReplayIsNoop(b: Built, act: () => Promise<unknown>): Promise<void> {
  await act();
  const traced = b.events.traced.length;
  const published = b.events.published.length;
  const writes = [...b.addresses.writes, ...b.contacts.writes].length;
  const saved = b.companies.saved.length;
  expect(traced).toBeGreaterThan(0);

  await act();

  expect(b.events.traced).toHaveLength(traced);
  expect(b.events.published).toHaveLength(published);
  expect([...b.addresses.writes, ...b.contacts.writes]).toHaveLength(writes);
  expect(b.companies.saved).toHaveLength(saved);
}

const HOLDER = {
  firstName: "Camille",
  lastName: "Rousseau",
  fonction: "Gérante",
  email: "camille@pqmarais.fr",
  phone: "06 11 22 33 44",
};
const HOLDER_2 = { ...HOLDER, email: "karim@pqmarais.fr", firstName: "Karim" };
const CORRECTED = { ...DELIVERY, ligne2: "Bâtiment B" };
const PREFERENCE = {
  method: "delivery" as const,
  pickupAddressId: null,
  deliveryAddressId: "a1",
  signatureRequired: true,
};

describe("rejouer un geste du client qui ne change rien", () => {
  it("le contact principal", async () => {
    const b = build();
    const handler = new UpdatePrimaryContactHandler(
      b.member,
      b.companies,
      b.events,
      b.uow,
      silentGestures(),
    );
    await expectReplayIsNoop(b, () =>
      handler.execute(new UpdatePrimaryContactCommand("u1", "c1", HOLDER)),
    );
  });

  it("un contact du carnet", async () => {
    const b = build();
    const handler = new UpdateCompanyContactHandler(
      b.member,
      b.book,
      b.events,
      b.uow,
      b.names,
      silentGestures(),
    );
    await expectReplayIsNoop(b, () =>
      handler.execute(new UpdateCompanyContactCommand("u1", "c1", "ct_1", HOLDER_2, "admin")),
    );
  });

  it("l'adresse de facturation (ni fait, ni étape d'activation)", async () => {
    const b = build();
    const handler = new SaveBillingAddressHandler(b.member, b.addresses, b.events, b.uow, b.names);
    await expectReplayIsNoop(b, () =>
      handler.execute(new SaveBillingAddressCommand("u1", "c1", BILLING)),
    );
  });

  it("une adresse de livraison, puis l'adresse par défaut", async () => {
    const b = build();
    const update = new UpdateDeliveryAddressHandler(
      b.member,
      b.addresses,
      b.events,
      b.uow,
      b.names,
      silentGestures(),
    );
    await expectReplayIsNoop(b, () =>
      update.execute(new UpdateDeliveryAddressCommand("u1", "c1", "a1", CORRECTED)),
    );
    const before = b.events.traced.length;
    await new SetDefaultDeliveryAddressHandler(
      b.member,
      b.addresses,
      b.events,
      b.uow,
      b.names,
      silentGestures(),
    ).execute(new SetDefaultDeliveryAddressCommand("u1", "c1", "a1"));
    // `a1` est déjà l'adresse par défaut du carnet semé.
    expect(b.events.traced).toHaveLength(before);
    expect(b.addresses.writes).toEqual(["book"]);
  });

  it("la préférence d'acheminement et la demande de délai", async () => {
    const b = build();
    const prefer = new PreferFulfillmentHandler(
      b.member,
      b.companies,
      new AddressReaderWithA1(),
      new TablePickupPointNames(),
      b.events,
      b.uow,
    );
    await expectReplayIsNoop(b, () =>
      prefer.execute(new PreferFulfillmentCommand("u1", "c1", PREFERENCE)),
    );
    const request = new RequestPaymentTermHandler(b.member, b.companies, b.events, b.uow);
    await expectReplayIsNoop(b, () =>
      request.execute(new RequestPaymentTermCommand("u1", "c1", "monthly")),
    );
  });
});

describe("rejouer un geste du staff qui ne change rien", () => {
  it("le contact principal et un contact du carnet", async () => {
    const b = build();
    const primary = new UpdatePrimaryContactByStaffHandler(
      b.companies,
      b.events,
      b.uow,
      silentGestures(),
    );
    await expectReplayIsNoop(b, () =>
      primary.execute(new UpdatePrimaryContactByStaffCommand("c1", HOLDER)),
    );
    const contact = new UpdateContactByStaffHandler(
      b.book,
      b.events,
      b.uow,
      b.names,
      silentGestures(),
    );
    await expectReplayIsNoop(b, () =>
      contact.execute(new UpdateContactByStaffCommand("c1", "ct_1", HOLDER_2, "orders")),
    );
  });

  it("la facturation, une adresse de livraison, l'adresse par défaut", async () => {
    const b = build();
    const billing = new SaveBillingAddressByStaffHandler(b.addresses, b.events, b.uow, b.names);
    await expectReplayIsNoop(b, () =>
      billing.execute(new SaveBillingAddressByStaffCommand("c1", BILLING)),
    );
    const update = new UpdateDeliveryAddressByStaffHandler(
      b.addresses,
      b.events,
      b.uow,
      b.names,
      silentGestures(),
    );
    await expectReplayIsNoop(b, () =>
      update.execute(new UpdateDeliveryAddressByStaffCommand("c1", "a1", CORRECTED)),
    );
    const before = b.events.traced.length;
    await new SetDefaultDeliveryByStaffHandler(
      b.addresses,
      b.events,
      b.uow,
      b.names,
      silentGestures(),
    ).execute(new SetDefaultDeliveryByStaffCommand("c1", "a1"));
    expect(b.events.traced).toHaveLength(before);
  });

  it("l'identité, la préférence, les délais accordés", async () => {
    const b = build();
    const identity = new UpdateIdentityByStaffHandler(b.companies, b.events, b.uow);
    const payload = {
      enseigne: "Marais Café",
      vatNumber: "",
      raisonSociale: "PQ Marais SAS",
      formeJuridique: "SAS",
      siret: "",
      siren: "",
    };
    await expectReplayIsNoop(b, () =>
      identity.execute(new UpdateIdentityByStaffCommand("c1", payload)),
    );
    const prefer = new PreferFulfillmentByStaffHandler(
      b.companies,
      new AddressReaderWithA1(),
      new TablePickupPointNames(),
      b.events,
      b.uow,
    );
    await expectReplayIsNoop(b, () =>
      prefer.execute(new PreferFulfillmentByStaffCommand("c1", PREFERENCE)),
    );
    const grant = new GrantTermsHandler(b.companies, b.events, b.uow);
    await expectReplayIsNoop(b, () => grant.execute(new GrantTermsCommand("c1", ["monthly"])));
  });

  it("décertifier un extrait qui ne l'est pas n'écrit ni ne journalise rien", async () => {
    const b = build();
    await new RevokeKbisCertificationHandler(
      b.companies,
      new FixedClock(new Date("2026-06-01T08:00:00.000Z")),
      b.events,
      b.uow,
    ).execute(new RevokeKbisCertificationCommand("c1"));

    expect(b.events.traced).toHaveLength(0);
    expect(b.companies.saved).toHaveLength(0);
  });
});
