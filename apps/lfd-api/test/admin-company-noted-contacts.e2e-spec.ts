/**
 * E2E de **noter un contact** (`POST /admin/companies/:companyId/noted-contacts`,
 * suivi commercial § 3.2 ter) et de l'avertissement `adresses_multiples`.
 *
 * Ce que seul le vrai serveur prouve : le fait écrit au journal avec son
 * acteur, la garde `b2b_companies` en écriture résolue en base, le refus d'un
 * jour futur jugé à l'horloge du serveur, et le compte des adresses vivantes
 * sur la vraie ligne SQL.
 */
import type { StaffResource } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createCompany } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

/** Le jeton porteur EST le `sub` : chaque agent a sa fiche. */
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

const route = (companyId: string): string => `/admin/companies/${companyId}/noted-contacts`;

function contactedFacts(companyId: string) {
  return ctx.prisma.activityEvent.findMany({
    where: { subjectId: companyId, type: "company.contacted" },
    select: { actorId: true, payload: true },
  });
}

/** Un membre du staff aux seuls droits listés, par-dessus son rôle. */
async function staffWith(
  sub: string,
  grants: readonly {
    resource: StaffResource;
    action: "read" | "write";
    effect: "allow" | "deny";
  }[],
): Promise<void> {
  const member = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: sub,
      email: `${sub}@lfc.test`,
      role: "commercial",
      status: "active",
      auth0Id: sub,
    },
  });
  for (const grant of grants) {
    await ctx.prisma.staffPermissionOverride.create({ data: { staffUserId: member.id, ...grant } });
  }
}

describe("noter un contact", () => {
  it("écrit le fait au journal, sous l'acteur de la requête (201)", async () => {
    const company = await createCompany(ctx.prisma);
    const today = serviceDay(0);

    await ctx
      .asSub(E2E_STAFF_SUB)
      .post(route(company.id))
      .set(INTENT_KEY, freshIntent())
      .send({ mode: "visit", date: today, note: "Gérant rencontré, rappel la semaine prochaine" })
      .expect(201);

    const facts = await contactedFacts(company.id);
    expect(facts).toHaveLength(1);
    expect(facts[0]?.actorId).toBe(E2E_STAFF_ID);
    expect(facts[0]?.payload).toMatchObject({
      mode: "visit",
      date: today,
      note: "Gérant rencontré, rappel la semaine prochaine",
    });
  });

  it("ne note qu'une fois par intention", async () => {
    const company = await createCompany(ctx.prisma);
    const key = freshIntent();
    const post = () =>
      ctx
        .asSub(E2E_STAFF_SUB)
        .post(route(company.id))
        .set(INTENT_KEY, key)
        .send({ mode: "phone", date: serviceDay(-1) });

    await post().expect(201);
    await post().expect(201);

    expect(await contactedFacts(company.id)).toHaveLength(1);
  });

  it("refuse un contact daté d'après aujourd'hui (400), sans rien écrire", async () => {
    const company = await createCompany(ctx.prisma);

    const refused = await ctx
      .asSub(E2E_STAFF_SUB)
      .post(route(company.id))
      .set(INTENT_KEY, freshIntent())
      .send({ mode: "phone", date: serviceDay(2) })
      .expect(400);

    expect(refused.body).toMatchObject({ code: "account.noted_contact.in_future" });
    expect(await contactedFacts(company.id)).toHaveLength(0);
  });

  it("refuse un mode inconnu (400)", async () => {
    const company = await createCompany(ctx.prisma);

    await ctx
      .asSub(E2E_STAFF_SUB)
      .post(route(company.id))
      .set(INTENT_KEY, freshIntent())
      .send({ mode: "appointment", date: serviceDay(0) })
      .expect(400);
  });

  it("rend 404 sur une société inconnue", async () => {
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post(route("societe-absente"))
      .set(INTENT_KEY, freshIntent())
      .send({ mode: "phone", date: serviceDay(0) })
      .expect(404);
  });

  it("refuse sans b2b_companies:write (403), sans rien écrire", async () => {
    const company = await createCompany(ctx.prisma);
    await staffWith("staff-lecture", [
      { resource: "b2b_companies", action: "read", effect: "allow" },
      { resource: "b2b_companies", action: "write", effect: "deny" },
    ]);

    await ctx
      .asSub("staff-lecture")
      .post(route(company.id))
      .set(INTENT_KEY, freshIntent())
      .send({ mode: "phone", date: serviceDay(0) })
      .expect(403);

    expect(await contactedFacts(company.id)).toHaveLength(0);
  });
});

describe("l'avertissement `adresses_multiples`", () => {
  async function addDeliveryAddress(companyId: string, archived: boolean): Promise<void> {
    await ctx.prisma.address.create({
      data: {
        companyId,
        kind: "delivery",
        label: "Livraison",
        ligne1: "2 rue du Four",
        codePostal: "73000",
        ville: "Chambéry",
        pays: "France",
        isDefault: false,
        ...(archived ? { archivedAt: daysAgo(1) } : {}),
      },
    });
  }

  async function warningKinds(companyId: string): Promise<readonly string[]> {
    const rows = jsonBody<{ id: string; warnings: { kind: string }[] }[]>(
      await ctx.asSub(E2E_STAFF_SUB).get("/admin/companies").expect(200),
    );
    return rows.find((row) => row.id === companyId)?.warnings.map((w) => w.kind) ?? [];
  }

  it("signale deux adresses de livraison vivantes, et le compteur du menu le compte", async () => {
    const company = await createCompany(ctx.prisma);
    await addDeliveryAddress(company.id, false);
    await addDeliveryAddress(company.id, false);

    expect(await warningKinds(company.id)).toContain("adresses_multiples");
    const rows = jsonBody<{ warnings: unknown[] }[]>(
      await ctx.asSub(E2E_STAFF_SUB).get("/admin/companies").expect(200),
    );
    const total = rows.reduce((sum, row) => sum + row.warnings.length, 0);
    const counted = jsonBody<{ count: number }>(
      await ctx.asSub(E2E_STAFF_SUB).get("/admin/companies/warnings-count").expect(200),
    );
    expect(counted.count).toBe(total);
  });

  it("ne compte pas une adresse archivée", async () => {
    const company = await createCompany(ctx.prisma);
    await addDeliveryAddress(company.id, false);
    await addDeliveryAddress(company.id, true);

    expect(await warningKinds(company.id)).not.toContain("adresses_multiples");
  });
});
