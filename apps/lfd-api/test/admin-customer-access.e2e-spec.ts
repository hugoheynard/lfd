/**
 * E2E de la page « Accès clients » — vrai Postgres.
 *
 * Ce que seul un vrai SQL prouve : que la table couvre TOUTES les sociétés
 * (y compris celles sans personne), que l'état du détenteur suit l'entrée
 * réelle — la première connexion posée par la résolution du principal, une
 * seule fois — et que la route est sous le droit des comptes clients.
 */
import type { CustomerAccessRowView, RoleGrant } from "@lfd/contracts";

import { CustomerRole, UserStatus } from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

async function table(): Promise<readonly CustomerAccessRowView[]> {
  const response = await ctx.asSub(E2E_STAFF_SUB).get("/admin/customer-access").expect(200);
  return jsonBody<readonly CustomerAccessRowView[]>(response);
}

async function rowOf(companyId: string): Promise<CustomerAccessRowView | undefined> {
  return (await table()).find((row) => row.companyId === companyId);
}

/** Un membre du staff dont le rôle porte exactement `grants`. */
async function staffWith(key: string, grants: readonly RoleGrant[]): Promise<string> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/staff-roles")
    .send({ key, label: key, grants })
    .expect(201);
  const sub = `staff-${key}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: key,
      email: `${key}@lfc.test`,
      role: null,
      roleKey: key,
      status: "active",
      auth0Id: sub,
    },
  });
  return sub;
}

describe("GET /admin/customer-access", () => {
  it("rend une société sans détenteur", async () => {
    const company = await createCompany(ctx.prisma, { enseigne: "Seule" });
    await ctx.prisma.company.update({ where: { id: company.id }, data: { contactEmail: "" } });

    expect(await rowOf(company.id)).toMatchObject({
      holder: null,
      holderInheritedFrom: null,
      state: "no_holder",
    });
  });

  /**
   * Régression (2026-10-23) : « HIP HIDEOUTS CHALET RIVE GAUCHE » apparaissait
   * sans détenteur alors que son principal en a un.
   */
  it("un sous-compte sans détenteur propre montre celui du principal", async () => {
    const parent = await createCompany(ctx.prisma, { enseigne: "Groupe" });
    const holder = await createUser(ctx.prisma, {
      auth0Sub: "auth0|principal",
      email: parent.contactEmail,
      status: UserStatus.invited,
    });
    await attachTo(ctx.prisma, holder.id, parent.id, CustomerRole.owner);
    const child = await createCompany(ctx.prisma, { enseigne: "Antenne" });
    await ctx.prisma.company.update({
      where: { id: child.id },
      data: { parentCompanyId: parent.id, contactEmail: "" },
    });

    expect(await rowOf(child.id)).toMatchObject({
      holder: { email: parent.contactEmail },
      holderInheritedFrom: { companyId: parent.id, companyName: "Groupe" },
      state: "invited",
      parent: { companyId: parent.id, companyName: "Groupe" },
    });
    expect(await rowOf(parent.id)).toMatchObject({
      parent: null,
      holderInheritedFrom: null,
      state: "invited",
    });
  });

  it("un sous-compte qui suit les contacts montre le détenteur du principal", async () => {
    const parent = await createCompany(ctx.prisma, { enseigne: "Groupe" });
    const child = await createCompany(ctx.prisma, { enseigne: "Antenne" });
    await ctx.prisma.company.update({
      where: { id: child.id },
      data: { parentCompanyId: parent.id, contactEmail: "site@test.fr" },
    });
    await ctx.prisma.companyFollow.create({
      data: { companyId: child.id, parentId: parent.id, aspect: "contacts", validFrom: daysAgo(1) },
    });

    expect(await rowOf(child.id)).toMatchObject({
      holder: { email: parent.contactEmail },
      holderInheritedFrom: { companyId: parent.id },
      state: "none",
    });
  });

  it("un sous-compte avec son détenteur et sans suivi garde le sien", async () => {
    const parent = await createCompany(ctx.prisma, { enseigne: "Groupe" });
    const child = await createCompany(ctx.prisma, { enseigne: "Antenne" });
    await ctx.prisma.company.update({
      where: { id: child.id },
      data: { parentCompanyId: parent.id, contactEmail: "site@test.fr" },
    });

    expect(await rowOf(child.id)).toMatchObject({
      holder: { email: "site@test.fr" },
      holderInheritedFrom: null,
    });
  });

  it("dit `invited` d'un détenteur invité qui n'est pas encore entré", async () => {
    const company = await createCompany(ctx.prisma);
    const invited = await createUser(ctx.prisma, {
      auth0Sub: "auth0|invite",
      email: "camille@test.fr",
      status: UserStatus.invited,
    });
    await attachTo(ctx.prisma, invited.id, company.id, CustomerRole.owner);

    const row = await rowOf(company.id);

    expect(row).toMatchObject({
      holder: { email: "camille@test.fr" },
      state: "invited",
      activatedAt: null,
    });
    expect(row?.lastInvitedAt).not.toBeNull();
  });

  it("dit `active` après la première entrée, avec sa date, que la seconde ne change pas", async () => {
    const company = await createCompany(ctx.prisma);
    const invited = await createUser(ctx.prisma, {
      auth0Sub: "auth0|entre",
      email: "camille@test.fr",
      status: UserStatus.invited,
    });
    await attachTo(ctx.prisma, invited.id, company.id, CustomerRole.owner);

    await ctx.asSub("auth0|entre").get("/me").expect(200);
    const first = await rowOf(company.id);
    await ctx.asSub("auth0|entre").get("/me").expect(200);
    const second = await rowOf(company.id);

    expect(first).toMatchObject({ state: "active" });
    expect(first?.activatedAt).not.toBeNull();
    expect(second?.activatedAt).toBe(first?.activatedAt);
  });

  it("laisse sans date un compte déjà actif avant qu'on la retienne", async () => {
    const company = await createCompany(ctx.prisma);
    const active = await createUser(ctx.prisma, {
      auth0Sub: "auth0|ancien",
      email: "camille@test.fr",
    });
    await ctx.prisma.membership.create({
      data: { userId: active.id, companyId: company.id, role: "owner", acceptedAt: daysAgo(10) },
    });

    await ctx.asSub("auth0|ancien").get("/me").expect(200);

    expect(await rowOf(company.id)).toMatchObject({ state: "active", activatedAt: null });
  });

  it("refuse un membre du staff sans le droit des comptes clients", async () => {
    const sub = await staffWith("sans-comptes", [{ resource: "b2b_orders", action: "read" }]);

    await ctx.asSub(sub).get("/admin/customer-access").expect(403);
  });

  it("ouvre la table à qui lit les comptes clients", async () => {
    const sub = await staffWith("lecteur", [{ resource: "b2b_companies", action: "read" }]);

    await ctx.asSub(sub).get("/admin/customer-access").expect(200);
  });
});
