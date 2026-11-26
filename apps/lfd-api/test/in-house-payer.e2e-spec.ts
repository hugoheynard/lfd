/**
 * E2E de la **nature « maison »** d'un payeur
 * (`/admin/companies/:companyId/in-house`,
 * `documentation/comptabilite/facturation/restaurants-maison.md`).
 *
 * Ce que seul le vrai SQL prouve :
 * - marquer insère une période `payer_in_house` et le fait au journal, dans
 *   la même transaction ; démarquer la clôt sans l'effacer ; remarquer en
 *   ouvre une neuve, et l'index unique partiel tient une seule période vivante ;
 * - le droit du geste est `b2b_in_house_payers`, que `b2b_companies:write`
 *   ne donne pas ; la lecture reste sous `b2b_companies:read` ;
 * - les refus nommés de D3 : un organisme public, un suivi de facturation
 *   entre deux natures (dans les deux sens : marquer, et suivre) ;
 * - la lecture publiée `InHousePayerReader` dit ce que la table porte.
 *
 * Une frontière doublée : la signature du jeton staff.
 */
import type { InHousePayerView, StaffRole } from "@lfd/contracts";

import { InHousePayerReader } from "../src/lafoliecoffee/account/domain/ports/in-house-payer.reader.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  daysAgo,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import { createCompany } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

/** Le jeton porteur EST le `sub`. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

type Agent = ReturnType<E2eContext["asSub"]>;

function route(companyId: string): string {
  return `/admin/companies/${companyId}/in-house`;
}

function set(agent: Agent, companyId: string, inHouse: boolean): ReturnType<Agent["put"]> {
  return agent.put(route(companyId)).set(INTENT_KEY, freshIntent()).send({ inHouse });
}

async function read(companyId: string): Promise<InHousePayerView> {
  const response = await ctx.asSub(E2E_STAFF_SUB).get(route(companyId)).expect(200);
  return jsonBody<InHousePayerView>(response);
}

async function siteFollowingBilling(): Promise<{ groupId: string; siteId: string }> {
  const group = await createCompany(ctx.prisma, {
    enseigne: "Groupe Maison",
    status: CompanyStatus.active,
  });
  const site = await createCompany(ctx.prisma, { enseigne: "Site Maison" });
  await ctx.prisma.company.update({ where: { id: site.id }, data: { parentCompanyId: group.id } });
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post(`/admin/companies/${site.id}/follows`)
    .send({ aspect: "billing" })
    .expect(204);
  return { groupId: group.id, siteId: site.id };
}

describe("marquer et démarquer un restaurant maison", () => {
  it("marque : la ligne, le fait au journal, la lecture publiée", async () => {
    const resto = await createCompany(ctx.prisma, { enseigne: "Bistrot Maison" });

    await set(ctx.asSub(E2E_STAFF_SUB), resto.id, true).expect(204);

    const view = await read(resto.id);
    expect(view.inHouse).toBe(true);
    expect(view.declaredAt).not.toBeNull();
    const row = await ctx.prisma.payerInHouse.findFirstOrThrow({
      where: { companyId: resto.id, withdrawnAt: null },
    });
    expect(row.declaredBy).toBe(E2E_STAFF_ID);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: resto.id, type: "company.in_house_declared" },
    });
    expect(facts).toHaveLength(1);
    await expect(ctx.app.get(InHousePayerReader).isInHousePayer(resto.id)).resolves.toBe(true);
  });

  it("démarque : la ligne disparaît, la lecture publiée dit non", async () => {
    const resto = await createCompany(ctx.prisma, { enseigne: "Bistrot Maison" });
    await set(ctx.asSub(E2E_STAFF_SUB), resto.id, true).expect(204);

    await set(ctx.asSub(E2E_STAFF_SUB), resto.id, false).expect(204);

    expect((await read(resto.id)).inHouse).toBe(false);
    await expect(ctx.app.get(InHousePayerReader).isInHousePayer(resto.id)).resolves.toBe(false);
  });

  it("rien ne s'efface : démarquer clôt, remarquer ouvre une période neuve", async () => {
    const resto = await createCompany(ctx.prisma, { enseigne: "Bistrot Maison" });
    const staff = ctx.asSub(E2E_STAFF_SUB);
    await set(staff, resto.id, true).expect(204);
    await set(staff, resto.id, false).expect(204);

    await set(staff, resto.id, true).expect(204);

    const periods = await ctx.prisma.payerInHouse.findMany({
      where: { companyId: resto.id },
      orderBy: { declaredAt: "asc" },
    });
    expect(periods).toHaveLength(2);
    expect(periods[0]?.withdrawnBy).toBe(E2E_STAFF_ID);
    expect(periods[0]?.withdrawnAt).not.toBeNull();
    expect(periods[1]?.withdrawnAt).toBeNull();
    expect((await read(resto.id)).inHouse).toBe(true);
  });

  it("la base refuse une seconde période vivante pour la même société", async () => {
    const resto = await createCompany(ctx.prisma, { enseigne: "Bistrot Maison" });
    await set(ctx.asSub(E2E_STAFF_SUB), resto.id, true).expect(204);

    await expect(
      ctx.prisma.payerInHouse.create({
        data: {
          id: "seconde-periode",
          companyId: resto.id,
          declaredAt: new Date(daysAgo(0)),
          declaredBy: E2E_STAFF_ID,
        },
      }),
    ).rejects.toThrow();
  });

  it("une société inconnue : 404", async () => {
    await ctx.asSub(E2E_STAFF_SUB).get(route("absente")).expect(404);
  });
});

describe("les refus nommés (D3)", () => {
  it("un organisme public ne peut pas être maison : 409, rien d'écrit", async () => {
    const mairie = await createCompany(ctx.prisma, { enseigne: "Mairie" });
    await ctx.prisma.company.update({
      where: { id: mairie.id },
      data: { formeJuridique: "public_local_authority" },
    });

    const response = await set(ctx.asSub(E2E_STAFF_SUB), mairie.id, true).expect(409);

    expect(jsonBody<{ code: string }>(response).code).toBe("account.in_house.public_payer");
    expect(await ctx.prisma.payerInHouse.count()).toBe(0);
  });

  it("marquer un principal dont un site suit la facturation : 409", async () => {
    const { groupId } = await siteFollowingBilling();

    const response = await set(ctx.asSub(E2E_STAFF_SUB), groupId, true).expect(409);

    expect(jsonBody<{ code: string }>(response).code).toBe(
      "account.in_house.across_billing_follow",
    );
  });

  it("un site non maison ne suit pas la facturation d'un principal maison : 409", async () => {
    const group = await createCompany(ctx.prisma, {
      enseigne: "Groupe Maison",
      status: CompanyStatus.active,
    });
    const site = await createCompany(ctx.prisma, { enseigne: "Site" });
    await ctx.prisma.company.update({
      where: { id: site.id },
      data: { parentCompanyId: group.id },
    });
    await set(ctx.asSub(E2E_STAFF_SUB), group.id, true).expect(204);

    const response = await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`/admin/companies/${site.id}/follows`)
      .send({ aspect: "billing" })
      .expect(409);

    expect(jsonBody<{ code: string }>(response).code).toBe(
      "account.hierarchy.billing_across_in_house",
    );
  });
});

describe("le droit du geste — `b2b_in_house_payers`, pas `b2b_companies`", () => {
  async function staffAs(
    role: StaffRole,
    allow: readonly { resource: "b2b_companies"; action: "read" | "write" }[],
  ): Promise<Agent> {
    const sub = `staff-in-house-${role}`;
    const user = await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: role,
        email: `in-house-${role}@lfc.test`,
        role,
        status: "active",
        auth0Id: sub,
      },
    });
    for (const grant of allow) {
      await ctx.prisma.staffPermissionOverride.create({
        data: { staffUserId: user.id, ...grant, effect: "allow" },
      });
    }
    return ctx.asSub(sub);
  }

  it("`b2b_companies:write` lit la nature, mais marquer est refusé (403)", async () => {
    const resto = await createCompany(ctx.prisma, { enseigne: "Bistrot Maison" });
    const agent = await staffAs("commercial", [
      { resource: "b2b_companies", action: "read" },
      { resource: "b2b_companies", action: "write" },
    ]);

    await agent.get(route(resto.id)).expect(200);
    await set(agent, resto.id, true).expect(403);
    expect(await ctx.prisma.payerInHouse.count()).toBe(0);
  });
});
