/**
 * E2E des **contacts d'entreprise** — les premiers endpoints **murés**.
 *
 * Ce que seul un vrai SQL prouve ici : qu'un endpoint portant `:companyId`
 * n'agit que pour le gestionnaire de CETTE entreprise. On exerce les trois
 * verdicts du mur (gestionnaire → ok, simple membre → 403, non-membre → 404),
 * l'isolation entre deux entreprises, et l'exposition dans `GET /me`.
 */
import { CustomerRole } from "../src/infra/database/client/client.js";
import type { AccountView, CompanyView } from "../src/account/domain/ports/account.reader.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const ADMIN = "auth0|admin";

const CONTACT = {
  firstName: "Karim",
  lastName: "Benali",
  fonction: "Responsable achats",
  email: "achats@pqmarais.fr",
  phone: "06 12 88 54 30",
};

let ctx: E2eContext;
let companyId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const admin = await createUser(ctx.prisma, {
    auth0Sub: ADMIN,
    email: "gerant@pqmarais.fr",
    firstName: "Camille",
    lastName: "Rousseau",
  });
  const company = await createCompany(ctx.prisma, { raisonSociale: "Boulangerie du Marais SAS" });
  companyId = company.id;
  await attachTo(ctx.prisma, admin.id, companyId, CustomerRole.company_admin);
});

/** L'entreprise `companyId` telle que `/me` la renvoie pour un sub donné. */
async function companyOf(sub: string): Promise<CompanyView> {
  const response = await ctx.asSub(sub).get("/me").expect(200);
  const found = jsonBody<AccountView>(response).companies.find((c) => c.id === companyId);
  if (found === undefined) {
    throw new Error(`Entreprise ${companyId} absente du /me de ${sub}`);
  }
  return found;
}

describe("contact principal (carte « Admin du compte entreprise »)", () => {
  it("est exposé par /me, semé du contact de la société", async () => {
    const company = await companyOf(ADMIN);

    expect(company.primaryContact).toMatchObject({ id: null, firstName: "Camille" });
    expect(company.contacts).toEqual([]);
  });

  it("est édité par le gestionnaire", async () => {
    await ctx
      .asSub(ADMIN)
      .patch(`/companies/${companyId}/contact`)
      .send({ ...CONTACT, firstName: "Camille", lastName: "Rousseau-Benali" })
      .expect(200);

    const company = await companyOf(ADMIN);
    expect(company.primaryContact).toMatchObject({
      lastName: "Rousseau-Benali",
      fonction: "Responsable achats",
    });
  });
});

describe("contacts additionnels — CRUD par le gestionnaire", () => {
  it("ajoute, modifie et retire un contact, reflété dans /me", async () => {
    const created = await ctx
      .asSub(ADMIN)
      .post(`/companies/${companyId}/contacts`)
      .send(CONTACT)
      .expect(201);
    const contactId = jsonBody<{ id: string }>(created).id;

    expect((await companyOf(ADMIN)).contacts).toEqual([
      expect.objectContaining({ id: contactId, lastName: "Benali" }),
    ]);

    await ctx
      .asSub(ADMIN)
      .patch(`/companies/${companyId}/contacts/${contactId}`)
      .send({ ...CONTACT, lastName: "Benali-Durand" })
      .expect(200);
    expect((await companyOf(ADMIN)).contacts[0]).toMatchObject({ lastName: "Benali-Durand" });

    await ctx.asSub(ADMIN).delete(`/companies/${companyId}/contacts/${contactId}`).expect(204);
    expect((await companyOf(ADMIN)).contacts).toEqual([]);
  });

  it("refuse un contact mal formé (400)", async () => {
    await ctx
      .asSub(ADMIN)
      .post(`/companies/${companyId}/contacts`)
      .send({ ...CONTACT, email: "pas-un-email" })
      .expect(400);
  });
});

describe("le mur", () => {
  it("refuse un simple membre (403)", async () => {
    const membre = await createUser(ctx.prisma, { auth0Sub: "auth0|membre" });
    await attachTo(ctx.prisma, membre.id, companyId, CustomerRole.member);

    const response = await ctx
      .asSub("auth0|membre")
      .post(`/companies/${companyId}/contacts`)
      .send(CONTACT);

    expect(response.status).toBe(403);
    expect((await companyOf(ADMIN)).contacts).toEqual([]);
  });

  it("cache l'entreprise à un non-membre (404)", async () => {
    await createUser(ctx.prisma, { auth0Sub: "auth0|etranger" });

    const response = await ctx
      .asSub("auth0|etranger")
      .post(`/companies/${companyId}/contacts`)
      .send(CONTACT);

    expect(response.status).toBe(404);
  });

  it("empêche le gestionnaire d'une entreprise de toucher les contacts d'une autre (isolation)", async () => {
    // Karim gère SA société ; il ne doit rien pouvoir faire sur celle de Camille,
    // même en forgeant l'URL — l'entreprise lui est « introuvable ».
    const autre = await createUser(ctx.prisma, { auth0Sub: "auth0|autre-gerant" });
    const autreCompany = await createCompany(ctx.prisma, {
      raisonSociale: "Torréfaction B SARL",
      siret: "98765432100023",
    });
    await attachTo(ctx.prisma, autre.id, autreCompany.id, CustomerRole.company_admin);

    const response = await ctx
      .asSub("auth0|autre-gerant")
      .post(`/companies/${companyId}/contacts`)
      .send(CONTACT);

    expect(response.status).toBe(404);
    expect((await companyOf(ADMIN)).contacts).toEqual([]);
  });

  it("exige un jeton (401)", async () => {
    await ctx.http().post(`/companies/${companyId}/contacts`).send(CONTACT).expect(401);
  });
});
