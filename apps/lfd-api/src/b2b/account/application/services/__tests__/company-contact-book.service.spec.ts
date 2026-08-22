import { Company } from "../../../domain/entities/company.js";
import {
  CompanyNotFoundError,
  ContactAlreadyExistsError,
} from "../../../domain/errors/account-errors.js";
import { CompanyContactRepository } from "../../../domain/ports/company-contact.repository.js";
import {
  CompanyMemberRepository,
  type KnownAccount,
} from "../../../domain/ports/company-member.repository.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import type { AssignableRole, CompanyRole } from "../../../domain/value-objects/company-role.js";
import { ContactDetails } from "../../../domain/value-objects/contact-details.js";
import { CompanyContactBook } from "../company-contact-book.service.js";

/** Le détenteur de la société témoin — il vit aplati sur elle, pas dans le carnet. */
const HOLDER = {
  firstName: "Camille",
  lastName: "Rousseau",
  fonction: "Gérante",
  email: "camille@halles.fr",
  phone: "0600000000",
};

/** Un interlocuteur ordinaire du carnet. */
const KARIM = ContactDetails.create({
  firstName: "Karim",
  lastName: "Benali",
  fonction: "Réception",
  email: "achats@halles.fr",
  phone: "",
});

function sampleCompany(): Company {
  return Company.reconstitute({
    id: "cmp_1",
    raisonSociale: "Café des Halles SAS",
    enseigne: "Le Comptoir",
    formeJuridique: "SAS",
    siret: "81245678900021",
    tvaIntracom: "",
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

/** Ce que le carnet a écrit — coordonnées d'un côté, rôle de l'accès de l'autre. */
interface Written {
  readonly contacts: { readonly role: AssignableRole }[];
  readonly alignedRoles: CompanyRole[];
}

function bookWith(
  known: KnownAccount | null,
  company: Company | null = sampleCompany(),
): { readonly book: CompanyContactBook; readonly written: Written } {
  const written: Written = { contacts: [], alignedRoles: [] };

  const companies: CompanyRepository = {
    saveKbisCertification: () => Promise.resolve(),
    existsBySiret: () => Promise.resolve(false),
    declareOwnedBy: () => Promise.resolve("cmp_1"),
    declareUnowned: () => Promise.resolve("cmp_1"),
    load: () => Promise.resolve(company),
    save: () => Promise.resolve(),
    saveKbisMetadata: () => Promise.resolve(),
    kbisLocation: () => Promise.resolve(null),
  };

  const contacts: CompanyContactRepository = {
    add: (_companyId, _details, role) => {
      written.contacts.push({ role });
      return Promise.resolve("ct_1");
    },
    update: (_companyId, _contactId, _details, role) => {
      written.contacts.push({ role });
      return Promise.resolve();
    },
    remove: () => Promise.resolve(),
  };

  const members: CompanyMemberRepository = {
    rebindSubject: () => Promise.resolve(),
    findAccountByEmail: () => Promise.resolve(known),
    findOwner: () => Promise.resolve(null),
    createInvited: () => Promise.resolve("user_new"),
    attach: () => Promise.resolve(),
    alignRole: (_userId, _companyId, role) => {
      written.alignedRoles.push(role);
      return Promise.resolve();
    },
    findMember: () => Promise.resolve(null),
  };

  return { book: new CompanyContactBook(companies, contacts, members), written };
}

describe("CompanyContactBook — une adresse, un interlocuteur", () => {
  it("REFUSE d'ajouter le détenteur au carnet", async () => {
    // Il y figure déjà, en tête de la fiche. L'ajouter une seconde fois ferait
    // deux cartes pour une personne, avec deux rôles dont un seul s'applique.
    const { book, written } = bookWith(null);

    await expect(book.add("cmp_1", ContactDetails.create(HOLDER), "orders")).rejects.toBeInstanceOf(
      ContactAlreadyExistsError,
    );
    expect(written.contacts).toEqual([]);
  });

  it("refuse aussi quand la casse diffère", async () => {
    // `Camille@Halles.fr` est la même boîte : comparer les chaînes telles
    // quelles laisserait passer le doublon qu'on vient d'interdire.
    const { book } = bookWith(null);
    const shouting = ContactDetails.create({ ...HOLDER, email: "CAMILLE@HALLES.FR" });

    await expect(book.add("cmp_1", shouting, "billing")).rejects.toBeInstanceOf(
      ContactAlreadyExistsError,
    );
  });

  it("laisse passer un interlocuteur ordinaire", async () => {
    const { book, written } = bookWith(null);

    await expect(book.add("cmp_1", KARIM, "orders")).resolves.toBe("ct_1");
    expect(written.contacts).toEqual([{ role: "orders" }]);
  });

  it("refuse d'écrire dans le carnet d'une société inconnue", async () => {
    const { book } = bookWith(null, null);

    await expect(book.add("fantome", KARIM, "orders")).rejects.toBeInstanceOf(CompanyNotFoundError);
  });
});

describe("CompanyContactBook — un rôle, pas deux", () => {
  it("aligne les droits réels sur le rôle affiché", async () => {
    // Le rôle affiché est celui du contact ; les droits vivent sur le
    // rattachement. Les laisser diverger, c'est montrer « Facturation » à
    // quelqu'un qui administre l'espace.
    const { book, written } = bookWith({
      userId: "user_1",
      subject: "auth0|1",
      firstName: "Camille",
      status: "active",
    });

    await book.replace("cmp_1", "ct_1", KARIM, "admin");

    expect(written.alignedRoles).toEqual(["admin"]);
  });

  it("n'OUVRE aucun accès à qui n'en a pas", async () => {
    // Noter un interlocuteur et lui donner les clés restent deux décisions :
    // le responsable réception qu'on vient d'ajouter n'a rien à se connecter.
    const { book, written } = bookWith(null);

    await book.add("cmp_1", KARIM, "orders");

    expect(written.alignedRoles).toEqual([]);
  });
});
