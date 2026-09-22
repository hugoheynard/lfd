/**
 * E2E des deux **gardes d'accès** posées le 2026-09-14, contre le vrai SQL.
 *
 * - **Le détenteur ne se rétrograde pas.** Un admin client notait l'adresse de
 *   CONNEXION du détenteur (différente de celle de la fiche) dans le carnet avec
 *   un autre rôle, et l'alignement réécrivait son rattachement. Seul un vrai
 *   `UPDATE` prouve que la base ignore désormais la rétrogradation, garde
 *   applicative contournée.
 * - **Une adresse non prouvée ne reçoit pas de société.** Un compte ouvert par
 *   inscription libre, jamais vérifié, était rattaché d'office par le staff.
 *
 * Frontières doublées : la signature du jeton staff et le fournisseur d'identité
 * (tenants distants). Le reste — guard, bus, domaine, SQL — est réel.
 */
import { NO_LOGIN_METHODS } from "../src/b2b/account/domain/ports/__tests__/login-method-doubles.js";
import { CompanyMemberRepository } from "../src/b2b/account/domain/ports/company-member.repository.js";
import { CustomerIdentityPort } from "../src/b2b/account/domain/ports/customer-identity.port.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole, UserStatus } from "../src/platform/database/client/client.js";
import type { ProvisionedIdentity } from "../src/platform/shared/identity/provisioned-identity.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

let provisionSeq = 0;
const identityDouble: CustomerIdentityPort = {
  // Ce double n'éprouve pas les méthodes de connexion.
  ...NO_LOGIN_METHODS,
  changeEmail: (): Promise<void> => Promise.resolve(),
  provision: (): Promise<ProvisionedIdentity> => {
    provisionSeq += 1;
    return Promise.resolve({
      subject: `auth0|neuf-${provisionSeq}`,
      passwordSetupUrl: "https://exemple.test/mdp",
    });
  },
  issuePasswordLink: (): Promise<string> => Promise.resolve("https://exemple.test/mot-de-passe"),
};

const OWNER_SUB = "auth0|detenteur";
/** L'adresse de CONNEXION du détenteur — la fiche, elle, affiche `camille@test.fr`. */
const OWNER_LOGIN = "camille.rousseau@gmail.com";
const ADMIN_SUB = "auth0|admin-client";

let ctx: E2eContext;
let companyId: string;
let ownerId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CustomerIdentityPort, value: identityDouble },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const company = await createCompany(ctx.prisma);
  companyId = company.id;
  const owner = await createUser(ctx.prisma, {
    auth0Sub: OWNER_SUB,
    email: OWNER_LOGIN,
    emailVerified: true,
  });
  ownerId = owner.id;
  await attachTo(ctx.prisma, owner.id, companyId, CustomerRole.owner);
  const admin = await createUser(ctx.prisma, { auth0Sub: ADMIN_SUB, emailVerified: true });
  await attachTo(ctx.prisma, admin.id, companyId, CustomerRole.admin);
});

async function roleOf(userId: string): Promise<CustomerRole | null> {
  const row = await ctx.prisma.membership.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
  return row?.role ?? null;
}

function invite(email: string, role: string): ReturnType<ReturnType<E2eContext["asSub"]>["post"]> {
  return ctx
    .asSub("staff-e2e")
    .post(`/admin/companies/${companyId}/members`)
    .send({ email, firstName: "Alex", lastName: "Martin", phone: "", role });
}

const KARIM = {
  firstName: "Karim",
  lastName: "Benali",
  fonction: "Réception",
  email: "achats@test.fr",
  phone: "",
  role: "orders",
};

describe("le détenteur ne se rétrograde pas", () => {
  /**
   * Régression : l'admin client ajoutait l'adresse de connexion du détenteur au
   * carnet en « Facturation », et le détenteur perdait sa société (2026-09-14).
   */
  it("refuse à l'admin client d'ajouter PUIS de modifier un contact vers l'adresse du détenteur", async () => {
    const added = await ctx
      .asSub(ADMIN_SUB)
      .post(`/companies/${companyId}/contacts`)
      .send({ ...KARIM, email: OWNER_LOGIN, role: "billing" });
    expect(added.status).toBe(409);
    expect(await ctx.prisma.companyContact.count({ where: { companyId } })).toBe(0);

    const created = await ctx
      .asSub(ADMIN_SUB)
      .post(`/companies/${companyId}/contacts`)
      .send(KARIM)
      .expect(201);
    const contactId = jsonBody<{ readonly id: string }>(created).id;

    const updated = await ctx
      .asSub(ADMIN_SUB)
      .patch(`/companies/${companyId}/contacts/${contactId}`)
      .send({ ...KARIM, email: OWNER_LOGIN, role: "admin" });
    expect(updated.status).toBe(409);

    expect(await roleOf(ownerId)).toBe(CustomerRole.owner);
    const contact = await ctx.prisma.companyContact.findFirstOrThrow({ where: { companyId } });
    expect(contact.email).toBe(KARIM.email);
  });

  it("la BASE ignore la rétrogradation, garde applicative contournée", async () => {
    // L'adaptateur est appelé en direct : c'est le `role <> owner` de l'UPDATE
    // qui tient, pas la lecture faite en amont par le service.
    const members = ctx.app.get(CompanyMemberRepository);

    await members.alignRole(ownerId, companyId, "billing");
    await members.attach(ownerId, companyId, "orders");

    expect(await roleOf(ownerId)).toBe(CustomerRole.owner);
  });

  it("aligne toujours un rattachement ordinaire", async () => {
    const members = ctx.app.get(CompanyMemberRepository);
    const colleague = await createUser(ctx.prisma, { auth0Sub: "auth0|collegue" });
    await attachTo(ctx.prisma, colleague.id, companyId, CustomerRole.orders);

    await members.alignRole(colleague.id, companyId, "billing");
    expect(await roleOf(colleague.id)).toBe(CustomerRole.billing);
    await members.attach(colleague.id, companyId, "admin");
    expect(await roleOf(colleague.id)).toBe(CustomerRole.admin);
  });

  it("refuse au staff de ré-inviter le détenteur avec un autre rôle", async () => {
    const response = await invite(OWNER_LOGIN, "billing");

    expect(response.status).toBe(409);
    expect(await roleOf(ownerId)).toBe(CustomerRole.owner);
  });
});

describe("une adresse non prouvée ne reçoit pas de société", () => {
  /**
   * Régression : un compte actif ouvert par inscription libre, adresse jamais
   * vérifiée, était rattaché d'office — rôle d'administration compris (2026-09-14).
   */
  it("POST /members sur un compte actif NON vérifié → 409, aucun rattachement", async () => {
    const intruder = await createUser(ctx.prisma, {
      auth0Sub: "auth0|inscription-libre",
      email: "compta@test.fr",
      emailVerified: false,
    });

    const response = await invite("compta@test.fr", "admin");

    expect(response.status).toBe(409);
    expect(await roleOf(intruder.id)).toBeNull();
  });

  it("rattache le même compte une fois son adresse vérifiée", async () => {
    const verified = await createUser(ctx.prisma, {
      auth0Sub: "auth0|verifie",
      email: "compta@test.fr",
      emailVerified: true,
    });

    await invite("compta@test.fr", "admin").expect(201);

    expect(await roleOf(verified.id)).toBe(CustomerRole.admin);
  });

  it("renvoie un lien à un compte invité, adresse non prouvée", async () => {
    const invited = await createUser(ctx.prisma, {
      auth0Sub: "auth0|invite",
      email: "compta@test.fr",
      status: UserStatus.invited,
    });

    await invite("compta@test.fr", "billing").expect(201);

    expect(await roleOf(invited.id)).toBe(CustomerRole.billing);
  });

  it("ouvre toujours l'accès d'une personne inconnue (parcours staff normal)", async () => {
    await invite("nouvelle@test.fr", "orders").expect(201);

    const created = await ctx.prisma.user.findFirstOrThrow({
      where: { email: "nouvelle@test.fr" },
    });
    expect(created.status).toBe(UserStatus.invited);
    expect(await roleOf(created.id)).toBe(CustomerRole.orders);
  });

  it("refuse une adresse portée par DEUX comptes, sans en choisir un", async () => {
    const first = await createUser(ctx.prisma, {
      auth0Sub: "auth0|double-1",
      email: "double@test.fr",
      emailVerified: true,
    });
    const second = await createUser(ctx.prisma, {
      auth0Sub: "auth0|double-2",
      email: "Double@Test.fr",
      emailVerified: true,
    });

    const response = await invite("double@test.fr", "orders");

    expect(response.status).toBe(409);
    expect(await roleOf(first.id)).toBeNull();
    expect(await roleOf(second.id)).toBeNull();
  });

  /**
   * Régression : la recherche insensible passait par `ILIKE` sans échapper `_`,
   * et `jean_dupont@` trouvait la boîte `jeanXdupont@` (constaté le 2026-09-14).
   */
  it("ne prend pas `_` pour un joker", async () => {
    const lookalike = await createUser(ctx.prisma, {
      auth0Sub: "auth0|sosie",
      email: "jeanxdupont@test.fr",
      emailVerified: true,
    });

    await invite("jean_dupont@test.fr", "admin").expect(201);

    expect(await roleOf(lookalike.id)).toBeNull();
  });
});
