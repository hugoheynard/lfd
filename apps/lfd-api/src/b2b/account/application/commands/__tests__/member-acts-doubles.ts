import type { BillingAddressPayload, DeliveryAddressPayload } from "@lfd/contracts";

import { Company } from "../../../domain/entities/company.js";
import { DeliveryAddressBook } from "../../../domain/entities/delivery-address-book.js";
import { CompanyAddressRepository } from "../../../domain/ports/company-address.repository.js";
import { CompanyAddressReader } from "../../../domain/ports/company-address.reader.js";
import { CompanyContactRepository } from "../../../domain/ports/company-contact.repository.js";
import {
  CompanyMemberRepository,
  type CompanyMemberRecord,
  type KnownAccount,
} from "../../../domain/ports/company-member.repository.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import { MembershipReader } from "../../../domain/ports/membership.reader.js";
import type { CompanyRole } from "../../../domain/value-objects/company-role.js";
import { ContactDetails } from "../../../domain/value-objects/contact-details.js";

/**
 * Les doubles des gestes du client sur son compte — des classes qui héritent
 * du port, pour que le compilateur les tienne alignés sur lui.
 *
 * Les coordonnées semées ici (rue, e-mail, téléphone) sont celles que les
 * specs cherchent ensuite dans les faits, et ne doivent jamais y trouver.
 */
export const STREET = "18 rue des Archives";
export const EMAIL = "achats@pqmarais.fr";
export const PHONE = "06 11 22 33 44";

export const BILLING: BillingAddressPayload = {
  label: "Siège",
  ligne1: STREET,
  ligne2: "",
  codePostal: "75004",
  ville: "Paris",
  pays: "France",
};

export const DELIVERY: DeliveryAddressPayload = {
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

/** Le gestionnaire de la société : tous les murs le laissent passer. */
export class OwnerMembership extends MembershipReader {
  roleOf(): Promise<CompanyRole | null> {
    return Promise.resolve("owner");
  }
}

/** Une société témoin, identité légale encore incomplète. */
export function sampleCompany(): Company {
  return Company.reconstitute({
    id: "c1",
    raisonSociale: "PQ Marais",
    enseigne: "Le Pain Quotidien",
    formeJuridique: "",
    siret: "",
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
    status: "pending",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  });
}

/** La société, chargée une fois et gardée : deux gestes successifs voient le même état. */
export class InMemoryCompanies extends CompanyRepository {
  readonly saved: Company[] = [];
  private readonly company = sampleCompany();

  existsBySiret(): Promise<boolean> {
    return Promise.resolve(false);
  }
  load(): Promise<Company | null> {
    return Promise.resolve(this.company);
  }
  save(company: Company): Promise<void> {
    this.saved.push(company);
    return Promise.resolve();
  }
  declareOwnedBy(): Promise<string> {
    return Promise.resolve("company_new");
  }
  declareUnowned(): Promise<string> {
    return Promise.resolve("company_new");
  }
  kbisLocation(): Promise<null> {
    return Promise.resolve(null);
  }
}

/** Un carnet d'adresses qui porte déjà `a1`, et garde son état entre deux gestes. */
export class InMemoryAddresses extends CompanyAddressRepository {
  readonly writes: string[] = [];
  private readonly book = DeliveryAddressBook.reconstitute({
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

  saveBilling(): Promise<void> {
    this.writes.push("billing");
    return Promise.resolve();
  }
  loadDeliveryBook(): Promise<DeliveryAddressBook> {
    return Promise.resolve(this.book);
  }
  saveDeliveryBook(): Promise<void> {
    this.writes.push("book");
    return Promise.resolve();
  }
}

/** La lecture des adresses : `a1` seule, pour la règle de rattachement de la préférence. */
export class AddressReaderWithA1 extends CompanyAddressReader {
  read() {
    return Promise.resolve({
      billing: null,
      deliveries: [
        {
          id: "a1",
          ...BILLING,
          isDefault: true,
          specs: DELIVERY.specs,
          procedureStepCount: 0,
        },
      ],
    });
  }
}

export class InMemoryContacts extends CompanyContactRepository {
  readonly writes: string[] = [];
  add(): Promise<string> {
    this.writes.push("add");
    return Promise.resolve("contact_new");
  }
  update(): Promise<void> {
    this.writes.push("update");
    return Promise.resolve();
  }
  remove(): Promise<void> {
    this.writes.push("remove");
    return Promise.resolve();
  }
}

/** Aucun compte connu : le carnet de contacts n'a aucun accès à aligner. */
export class NoKnownMembers extends CompanyMemberRepository {
  findAccountByEmail(): Promise<KnownAccount | null> {
    return Promise.resolve(null);
  }
  createInvited(): Promise<string> {
    return Promise.resolve("user_new");
  }
  rebindSubject(): Promise<void> {
    return Promise.resolve();
  }
  attach(): Promise<void> {
    return Promise.resolve();
  }
  alignRole(): Promise<void> {
    return Promise.resolve();
  }
  findMember(): Promise<CompanyMemberRecord | null> {
    return Promise.resolve(null);
  }
  findOwner(): Promise<KnownAccount | null> {
    return Promise.resolve(null);
  }
}
