import type { BillingAddressPayload, DeliveryAddressPayload } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { Company } from "../../../domain/entities/company.js";
import { CompanyAddressRepository } from "../../../domain/ports/company-address.repository.js";
import { CompanyContactRepository } from "../../../domain/ports/company-contact.repository.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import { ContactDetails } from "../../../domain/value-objects/contact-details.js";
import {
  AddDeliveryAddressByStaffCommand,
  GrantTermsCommand,
  SaveBillingAddressByStaffCommand,
} from "../admin-company-commands.js";
import {
  AddDeliveryAddressByStaffHandler,
  SaveBillingAddressByStaffHandler,
} from "../admin-address.handlers.js";
import { GrantTermsHandler } from "../admin-company.handlers.js";
import { RemoveContactByStaffCommand } from "../admin-contact-commands.js";
import { RemoveContactByStaffHandler } from "../admin-contact.handlers.js";
import { ChangeCompanyStatusCommand } from "../change-company-status.command.js";
import { ChangeCompanyStatusHandler } from "../change-company-status.handler.js";

/**
 * **Ce que le staff inscrit quand il touche au compte d'un client.**
 *
 * Ce qu'on tient ici n'est pas « le handler appelle le journal » — la
 * transaction et le port s'en chargent — mais **ce qu'il affirme**, et surtout
 * ce qu'il n'affirme pas : un acte nommé, une charge utile qui suffit à relire,
 * et aucune donnée personnelle versée dans un flux qu'on garde des années.
 */
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

function sampleCompany(): Company {
  return Company.reconstitute({
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
}

function companies(): CompanyRepository {
  return {
    declareUnowned: () => Promise.resolve(""),
    saveKbisCertification: () => Promise.resolve(),
    existsBySiret: () => Promise.resolve(false),
    declareOwnedBy: () => Promise.resolve("company_new"),
    load: () => Promise.resolve(sampleCompany()),
    save: () => Promise.resolve(),
    saveKbisMetadata: () => Promise.resolve(),
    kbisLocation: () => Promise.resolve(null),
  };
}

function addresses(): CompanyAddressRepository {
  return {
    saveBilling: () => Promise.resolve(),
    addDelivery: () => Promise.resolve("addr_7"),
    updateDelivery: () => Promise.resolve(),
    setDefaultDelivery: () => Promise.resolve(),
    archiveDelivery: () => Promise.resolve(),
  };
}

function contacts(): CompanyContactRepository {
  return {
    add: () => Promise.resolve("contact_new"),
    update: () => Promise.resolve(),
    remove: () => Promise.resolve(),
  };
}

describe("Les actes du staff au journal", () => {
  it("nomme le délai de paiement accordé, et porte la liste ENTIÈRE", async () => {
    const events = new RecordingPublisher();

    await new GrantTermsHandler(companies(), events, new DirectUnitOfWork()).execute(
      new GrantTermsCommand("c1", ["monthly"]),
    );

    expect(events.factTypes()).toEqual(["company.payment_terms_granted"]);
    // La liste entière, pas le delta : un retrait est le même geste qu'un ajout,
    // et une liste vide est une décision lisible — « plus aucun délai ».
    expect(events.traced[0]?.journalFact().payload).toEqual({ terms: ["monthly"] });
  });

  it("nomme la suspension — c'est le fait dont on demande l'auteur le jour même", async () => {
    const events = new RecordingPublisher();

    await new ChangeCompanyStatusHandler(companies(), events, new DirectUnitOfWork()).execute(
      new ChangeCompanyStatusCommand("c1", "suspend", "impayés répétés"),
    );

    expect(events.factTypes()).toEqual(["company.status_changed"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({ action: "suspend" });
  });

  /**
   * Deux natures dans le même geste : l'acte du staff est TRACÉ (bloquant), la
   * pièce d'activation reste un fait d'entonnoir publié best-effort. Les
   * confondre ferait échouer une saisie d'adresse sur une statistique.
   */
  it("sépare l'acte tracé de la pièce d'activation, qui reste best-effort", async () => {
    const events = new RecordingPublisher();

    await new SaveBillingAddressByStaffHandler(addresses(), events, new DirectUnitOfWork()).execute(
      new SaveBillingAddressByStaffCommand("c1", BILLING),
    );

    expect(events.factTypes()).toEqual(["company.billing_address_saved"]);
    expect(events.published).toHaveLength(2);
  });

  it("emporte le LIEU d'une adresse, jamais l'adresse entière", async () => {
    const events = new RecordingPublisher();

    const addressId = await new AddDeliveryAddressByStaffHandler(
      addresses(),
      events,
      new DirectUnitOfWork(),
    ).execute(new AddDeliveryAddressByStaffCommand("c1", DELIVERY));

    // L'identifiant rendu est bien celui qui part au journal : sans lui, on
    // saurait qu'une adresse a été ajoutée sans savoir laquelle.
    expect(addressId).toBe("addr_7");
    expect(events.traced[0]?.journalFact().payload).toEqual({
      addressId: "addr_7",
      ville: "Paris",
      codePostal: "75004",
    });
  });

  /**
   * Le journal se relit largement et se garde longtemps : y verser les
   * coordonnées d'une personne en ferait un annuaire parallèle, que rien
   * n'effacerait le jour où le contact demande à disparaître.
   */
  it("ne verse aucune coordonnée personnelle dans un fait de contact", async () => {
    const events = new RecordingPublisher();

    await new RemoveContactByStaffHandler(contacts(), events, new DirectUnitOfWork()).execute(
      new RemoveContactByStaffCommand("c1", "contact_9"),
    );

    expect(events.factTypes()).toEqual(["company.contact_removed"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({ contactId: "contact_9" });
  });
});
