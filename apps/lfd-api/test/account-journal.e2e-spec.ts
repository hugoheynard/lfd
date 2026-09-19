/**
 * E2E : **les gestes sur un compte client entrent au journal** — ceux du client
 * sur sa propre société comme ceux du staff qui ouvrent un accès (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, tranche
 * (c), 2026-09-19).
 *
 * Ce que seule cette suite prouve : le fait est écrit dans la VRAIE table, sous
 * le VRAI auteur — l'id `users` du client, ou la fiche staff, jamais un `sub` —,
 * aucune ligne du journal ne porte l'e-mail, le téléphone ni la rue semés — une
 * adresse y est sa ville et son code postal, comme chez le staff —, et
 * un journal qui refuse d'écrire annule le geste. La panne est posée comme dans
 * `order-waivers-journal` : une contrainte SQL qui refuse le fait attendu.
 *
 * Frontières doublées : la signature du jeton staff et le fournisseur
 * d'identité (Auth0). Tout le reste — gardes, bus, domaine, SQL — est réel.
 *
 * Lot B du plan des phrases (2026-09-19) : chaque fait nomme la société ou la
 * personne au moment du geste, et cite l'adresse ou le contact avec son nom du
 * moment — un renommage après coup ne réécrit pas la ligne.
 */
import { CustomerIdentityPort } from "../src/b2b/account/domain/ports/customer-identity.port.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole, UserStatus } from "../src/platform/database/client/client.js";
import type { ProvisionedIdentity } from "../src/platform/shared/identity/provisioned-identity.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const OWNER = "auth0|gerant-journal";
const REFUSAL = "e2e_journal_comptes_en_panne";
const STREET = "9 rue de la Roquette";
const EMAIL = "karim.benali@exemple.fr";
const PHONE = "06 12 34 56 78";
const NEW_EMAIL = "camille.nouvelle@exemple.fr";
const PDF = Buffer.from("%PDF-1.4\nfake kbis", "latin1");
/** Le nom de la société semée — sa raison sociale, faute d'enseigne. */
const COMPANY_NAME = "Café de Test SAS";

/** Le fournisseur d'identité : il accepte tout, sauf quand un test l'arme pour refuser. */
class IdentityDouble extends CustomerIdentityPort {
  refuses = false;
  changeEmail(): Promise<void> {
    return this.refuses
      ? Promise.reject(new Error("Auth0 indisponible (double e2e)"))
      : Promise.resolve();
  }
  provision(): Promise<ProvisionedIdentity> {
    return Promise.resolve({
      subject: "auth0|invite-journal",
      passwordSetupUrl: "https://exemple.test/mdp",
    });
  }
  issuePasswordLink(): Promise<string> {
    return Promise.resolve("https://exemple.test/lien-secret");
  }
}

const identity = new IdentityDouble();
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;
let ownerId: string;
let companyId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CustomerIdentityPort, value: identity },
    ],
  });
});

afterAll(async () => {
  await repairJournal();
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await repairJournal();
  identity.refuses = false;
  ownerId = (await createUser(ctx.prisma, { auth0Sub: OWNER, email: "camille@ancienne.fr" })).id;
  companyId = (await createCompany(ctx.prisma)).id;
  await attachTo(ctx.prisma, ownerId, companyId, CustomerRole.owner);
});

const owner = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(OWNER);
const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Le lieu d'une adresse, tel que le journal le retient : ni rue, ni numéro, ni libellé. */
const PARIS = { ville: "Paris", codePostal: "75011" };

function delivery(
  label: string,
  place: { readonly ville: string; readonly codePostal: string } = PARIS,
): Record<string, unknown> {
  return {
    label,
    ligne1: STREET,
    ligne2: "",
    codePostal: place.codePostal,
    ville: place.ville,
    pays: "France",
    isDefault: false,
    specs: {
      signatureRequired: false,
      note: "",
      slots: { mode: "everyday", slot: null },
      deliveryContact: null,
      gps: null,
    },
  };
}

const CONTACT = {
  firstName: "Karim",
  lastName: "Benali",
  fonction: "",
  email: EMAIL,
  phone: PHONE,
};

async function breakJournal(type: string): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(
    `ALTER TABLE growth.activity_events
       ADD CONSTRAINT ${REFUSAL} CHECK (type <> '${type}') NOT VALID`,
  );
}

async function repairJournal(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(
    `ALTER TABLE growth.activity_events DROP CONSTRAINT IF EXISTS ${REFUSAL}`,
  );
}

async function facts(type: string) {
  return ctx.prisma.activityEvent.findMany({
    where: { type },
    orderBy: { id: "asc" },
    select: { subjectType: true, subjectId: true, actorType: true, actorId: true, payload: true },
  });
}

/** Toutes les lignes du journal, en texte : ce qu'un lecteur du journal pourrait y trouver. */
async function journalText(): Promise<string> {
  const rows = await ctx.prisma.$queryRawUnsafe<{ line: string }[]>(
    `SELECT row_to_json(e)::text AS line FROM growth.activity_events e`,
  );
  return rows.map((row) => row.line).join("\n");
}

async function addAddress(label: string): Promise<string> {
  const response = await owner()
    .post(`/companies/${companyId}/delivery-addresses`)
    .send(delivery(label))
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

describe("le client, sur le compte de sa société", () => {
  it("ses adresses : un fait par geste, sous son id `users`, citées par ville et code postal", async () => {
    const addressId = await addAddress("Boutique");
    await owner()
      .patch(`/companies/${companyId}/delivery-addresses/${addressId}`)
      .send(delivery("Atelier"))
      .expect(204);
    await owner()
      .patch(`/companies/${companyId}/delivery-addresses/${addressId}/default`)
      .expect(204);

    const byClient = {
      subjectType: "company",
      subjectId: companyId,
      actorType: "customer",
      actorId: ownerId,
    };
    // Jamais le libellé (« Boutique », « Atelier ») : un texte libre du
    // client (lot B, décision de Hugo du 2026-09-19, `a151ccee`).
    const cited = { subjectLabel: COMPANY_NAME, address: { id: addressId, ...PARIS } };
    expect(await facts("company.delivery_address_added")).toEqual([
      { ...byClient, payload: cited },
    ]);
    expect(await facts("company.delivery_address_updated")).toEqual([
      { ...byClient, payload: cited },
    ]);
    expect(await facts("company.default_delivery_set")).toEqual([{ ...byClient, payload: cited }]);
  });

  it("ses contacts : l'id, le nom et le rôle, jamais l'e-mail ni le téléphone", async () => {
    const created = await owner()
      .post(`/companies/${companyId}/contacts`)
      .send({ ...CONTACT, role: "orders" })
      .expect(201);
    const contactId = jsonBody<{ id: string }>(created).id;
    await owner().delete(`/companies/${companyId}/contacts/${contactId}`).expect(204);

    expect(await facts("company.contact_added")).toEqual([
      {
        subjectType: "company",
        subjectId: companyId,
        actorType: "customer",
        actorId: ownerId,
        payload: {
          subjectLabel: COMPANY_NAME,
          contact: { id: contactId, name: "Karim Benali" },
          role: "orders",
        },
      },
    ]);
    expect((await facts("company.contact_removed"))[0]?.payload).toEqual({
      subjectLabel: COMPANY_NAME,
      contact: { id: contactId },
    });
  });

  it("son identité et le délai demandé : les champs changés, la demande d'avant et d'après", async () => {
    await owner()
      .patch(`/companies/${companyId}/identity`)
      .send({ enseigne: "Le Comptoir", vatNumber: "FR40812456789" })
      .expect(204);
    await owner()
      .patch(`/companies/${companyId}/payment-term`)
      .send({ paymentTerm: "monthly" })
      .expect(204);

    // Le nom APRÈS le geste : la nouvelle enseigne est celle du moment.
    expect((await facts("company.identity_edited"))[0]).toMatchObject({
      actorId: ownerId,
      payload: { subjectLabel: "Le Comptoir", fields: ["enseigne", "vatNumber"] },
    });
    expect((await facts("company.payment_term_requested"))[0]?.payload).toEqual({
      subjectLabel: "Le Comptoir",
      before: null,
      after: "monthly",
    });
  });

  it("son profil : les champs changés, écrits après Auth0 — jamais la nouvelle adresse", async () => {
    await owner()
      .patch("/me/profile")
      .send({ firstName: "Camille", lastName: "Durand", email: NEW_EMAIL, phone: PHONE })
      .expect(200);

    expect(await facts("user.profile_updated")).toEqual([
      {
        subjectType: "user",
        subjectId: ownerId,
        actorType: "customer",
        actorId: ownerId,
        payload: { subjectLabel: "Camille Durand", fields: ["email", "phone"] },
      },
    ]);
  });

  it("aucune ligne du journal ne porte l'e-mail, le téléphone, la rue ni le sub — la ville et le code postal, si", async () => {
    await addAddress("Boutique");
    await owner()
      .patch(`/companies/${companyId}/billing-address`)
      .send({
        label: "Siège",
        ligne1: STREET,
        ligne2: "",
        codePostal: "75011",
        ville: "Paris",
        pays: "France",
      })
      .expect(204);
    await owner()
      .post(`/companies/${companyId}/contacts`)
      .send({ ...CONTACT, role: "orders" })
      .expect(201);
    await owner().patch(`/companies/${companyId}/contact`).send(CONTACT).expect(200);
    await owner()
      .patch("/me/profile")
      .send({ firstName: "Camille", lastName: "Durand", email: NEW_EMAIL, phone: PHONE })
      .expect(200);
    await ctx.drain();

    const text = await journalText();
    expect(text).toContain("company.billing_address_saved");
    expect((await facts("company.billing_address_saved"))[0]?.payload).toEqual({
      subjectLabel: COMPANY_NAME,
      ville: "Paris",
      codePostal: "75011",
    });
    for (const secret of [EMAIL, NEW_EMAIL, PHONE, STREET, "Roquette", OWNER]) {
      expect(text).not.toContain(secret);
    }
  });
});

/**
 * D5 et D6 du plan des phrases : le journal dit ce qui était vrai QUAND c'est
 * arrivé. Renommer l'adresse et la société après coup ne réécrit pas la ligne.
 */
describe("les noms du moment", () => {
  it("une adresse déplacée et une société renommée depuis se lisent comme elles étaient", async () => {
    const addressId = await addAddress("Boutique");

    await owner()
      .patch(`/companies/${companyId}/delivery-addresses/${addressId}`)
      .send(delivery("Atelier", { ville: "Lyon", codePostal: "69001" }))
      .expect(204);
    await owner()
      .patch(`/companies/${companyId}/identity`)
      .send({ enseigne: "Le Comptoir", vatNumber: "" })
      .expect(204);

    expect((await facts("company.delivery_address_added"))[0]?.payload).toMatchObject({
      subjectLabel: COMPANY_NAME,
      address: { id: addressId, ...PARIS },
    });
    expect((await facts("company.delivery_address_updated"))[0]?.payload).toMatchObject({
      subjectLabel: COMPANY_NAME,
      address: { id: addressId, ville: "Lyon", codePostal: "69001" },
    });
    expect((await facts("company.identity_edited"))[0]?.payload).toMatchObject({
      subjectLabel: "Le Comptoir",
    });
  });
});

/**
 * Le KBIS et la procédure de livraison écrivent le MÊME fait que chez le staff
 * (`company.kbis_uploaded`, `company.delivery_procedure_edited`, renommés le
 * 2026-09-19) : un geste, un nom, l'auteur de la ligne les distingue.
 */
describe("le client, sur ses pièces et ses consignes", () => {
  it("déposer son KBIS : le fait du staff, sous l'id `users` du client", async () => {
    await owner().put(`/companies/${companyId}/kbis`).attach("file", PDF, "kbis.pdf").expect(204);

    expect(await facts("company.kbis_uploaded")).toEqual([
      {
        subjectType: "company",
        subjectId: companyId,
        actorType: "customer",
        actorId: ownerId,
        payload: { subjectLabel: COMPANY_NAME, fileName: "kbis.pdf" },
      },
    ]);
  });

  it("une étape de livraison refusée par le journal n'est pas écrite", async () => {
    const addressId = await addAddress("Boutique");
    await breakJournal("company.delivery_procedure_edited");

    const response = await owner()
      .post(`/companies/${companyId}/delivery-addresses/${addressId}/procedure/steps`)
      .field("title", "Portail")
      .field("body", "Code 1234");

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await ctx.prisma.deliveryProcedureStep.count()).toBe(0);
  });
});

describe("le staff, sur l'accès d'un client", () => {
  it("inviter un membre : `company.access_opened` sous la fiche staff, la personne par son id", async () => {
    await staff()
      .post(`/admin/companies/${companyId}/members`)
      .send({ email: EMAIL, firstName: "Karim", lastName: "Benali", phone: PHONE, role: "orders" })
      .expect(201);

    const invited = await ctx.prisma.user.findFirstOrThrow({ where: { email: EMAIL } });
    expect(await facts("company.access_opened")).toEqual([
      {
        subjectType: "company",
        subjectId: companyId,
        actorType: "staff",
        actorId: E2E_STAFF_ID,
        payload: {
          subjectLabel: COMPANY_NAME,
          person: { id: invited.id, name: "Karim Benali" },
          role: "orders",
        },
      },
    ]);
    expect(await journalText()).not.toContain(EMAIL);
  });

  it("remettre un lien de mot de passe : le geste, jamais le lien", async () => {
    const waiting = await createUser(ctx.prisma, {
      auth0Sub: "auth0|attend",
      status: UserStatus.invited,
    });

    await staff().post(`/admin/access-pending/${waiting.id}/link`).expect(201);

    expect(await facts("user.password_link_issued")).toEqual([
      {
        subjectType: "user",
        subjectId: waiting.id,
        actorType: "staff",
        actorId: E2E_STAFF_ID,
        payload: { subjectLabel: "Camille Durand" },
      },
    ]);
    expect(await journalText()).not.toContain("lien-secret");
  });
});

describe("un journal en panne annule le geste", () => {
  it("l'adresse n'est pas ajoutée", async () => {
    await breakJournal("company.delivery_address_added");

    const response = await owner()
      .post(`/companies/${companyId}/delivery-addresses`)
      .send(delivery("Boutique"));

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await ctx.prisma.address.count({ where: { companyId, ligne1: STREET } })).toBe(0);
  });

  it("le contact n'est pas ajouté", async () => {
    await breakJournal("company.contact_added");

    const response = await owner()
      .post(`/companies/${companyId}/contacts`)
      .send({ ...CONTACT, role: "orders" });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await ctx.prisma.companyContact.count({ where: { companyId } })).toBe(0);
  });

  it("le profil n'est pas écrit", async () => {
    await breakJournal("user.profile_updated");

    const response = await owner()
      .patch("/me/profile")
      .send({ firstName: "Camille", lastName: "Martin", email: "camille@ancienne.fr", phone: "" });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).lastName).toBe(
      "Durand",
    );
  });

  it("un refus d'Auth0 n'écrit ni profil ni fait", async () => {
    identity.refuses = true;

    const response = await owner()
      .patch("/me/profile")
      .send({ firstName: "Camille", lastName: "Durand", email: NEW_EMAIL, phone: "" });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await facts("user.profile_updated")).toHaveLength(0);
  });
});
