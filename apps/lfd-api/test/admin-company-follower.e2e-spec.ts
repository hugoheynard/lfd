/**
 * E2E de **confier le suivi commercial** (`PUT /admin/companies/:companyId/follower`,
 * suivi commercial § 3.1 et § 3.5).
 *
 * Ce que seul le vrai serveur prouve : la garde `b2b_sales_oversight` en
 * écriture résolue en base, la colonne `followed_by_staff_id` réécrite par
 * `save`, le fait `company.follower_changed` écrit sous l'acteur, la page qui
 * relit le nouveau suiveur, et le signal d'une inscription laissée sans suivi.
 */
import type { SalesOversightView, StaffResource } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
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

const route = (companyId: string): string => `/admin/companies/${companyId}/follower`;

/** Un commercial, actif ou suspendu, et ses dérogations éventuelles ; rend l'id de sa fiche. */
async function commercial(
  sub: string,
  options: {
    readonly status?: "active" | "suspended";
    readonly grants?: readonly {
      resource: StaffResource;
      action: "read" | "write";
      effect: "allow" | "deny";
    }[];
  } = {},
): Promise<string> {
  const member = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Camille",
      lastName: sub,
      email: `${sub}@lfc.test`,
      role: "commercial",
      status: options.status ?? "active",
      auth0Id: sub,
    },
  });
  for (const grant of options.grants ?? []) {
    await ctx.prisma.staffPermissionOverride.create({ data: { staffUserId: member.id, ...grant } });
  }
  return member.id;
}

/** Une fiche principale suivie (ou non), ouverte par un canal, il y a `ageDays` jours. */
async function sheet(
  follow: { by: string | null; via: "staff" | "self"; ageDays?: number },
  parentCompanyId: string | null = null,
): Promise<string> {
  const company = await createCompany(ctx.prisma, { status: "pending" });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: {
      followedByStaffId: follow.by,
      declaredVia: follow.via,
      parentCompanyId,
      createdAt: new Date(daysAgo(follow.ageDays ?? 1)),
    },
  });
  return company.id;
}

function assign(companyId: string, followerStaffId: string | null, sub = E2E_STAFF_SUB) {
  return ctx
    .asSub(sub)
    .put(route(companyId))
    .set(INTENT_KEY, freshIntent())
    .send({ followerStaffId });
}

async function followerOf(companyId: string): Promise<string | null> {
  const row = await ctx.prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { followedByStaffId: true },
  });
  return row.followedByStaffId;
}

function followerFacts(companyId: string) {
  return ctx.prisma.activityEvent.findMany({
    where: { subjectId: companyId, type: "company.follower_changed" },
    orderBy: { occurredAt: "asc" },
    select: { actorId: true, payload: true },
  });
}

async function oversight(query = ""): Promise<SalesOversightView> {
  const res = await ctx.asSub(E2E_STAFF_SUB).get(`/admin/sales-oversight${query}`).expect(200);
  return jsonBody<SalesOversightView>(res);
}

describe("PUT /admin/companies/:companyId/follower", () => {
  it("attribue, réattribue puis retire, chaque fois au journal sous l'acteur", async () => {
    const ana = await commercial("staff-ana");
    const lou = await commercial("staff-lou");
    const company = await sheet({ by: null, via: "self" });

    await assign(company, ana).expect(204);
    expect(await followerOf(company)).toBe(ana);
    await assign(company, lou).expect(204);
    expect(await followerOf(company)).toBe(lou);
    await assign(company, null).expect(204);
    expect(await followerOf(company)).toBeNull();

    const facts = await followerFacts(company);
    expect(facts.map((fact) => fact.actorId)).toEqual([E2E_STAFF_ID, E2E_STAFF_ID, E2E_STAFF_ID]);
    expect(facts.map((fact) => fact.payload)).toMatchObject([
      { before: null, after: { id: ana, name: "Camille staff-ana" } },
      { before: { id: ana }, after: { id: lou } },
      { before: { id: lou }, after: null },
    ]);
  });

  it("la page du suivi montre le nouveau suiveur, et le propose à l'attribution", async () => {
    const ana = await commercial("staff-ana");
    const company = await sheet({ by: null, via: "self" });

    await assign(company, ana).expect(204);

    const view = await oversight();
    expect(view.rows.find((row) => row.companyId === company)?.followedBy).toMatchObject({
      id: ana,
      archived: false,
    });
    expect(view.assignable.map((option) => option.id)).toContain(ana);
  });

  it("refuse un site (409), sans rien écrire", async () => {
    const ana = await commercial("staff-ana");
    const principal = await sheet({ by: null, via: "staff" });
    const site = await sheet({ by: null, via: "staff" }, principal);

    const refused = await assign(site, ana).expect(409);

    expect(refused.body).toMatchObject({ code: "account.follower.site_has_no_follower" });
    expect(await followerOf(site)).toBeNull();
    expect(await followerFacts(site)).toHaveLength(0);
  });

  it("refuse une personne suspendue (409) ou inconnue (404)", async () => {
    const off = await commercial("staff-off", { status: "suspended" });
    const company = await sheet({ by: null, via: "self" });

    const suspended = await assign(company, off).expect(409);
    expect(suspended.body).toMatchObject({ code: "account.follower.suspended" });
    await assign(company, "fiche-inconnue").expect(404);
    expect(await followerOf(company)).toBeNull();
  });

  it("refuse qui lit le suivi sans pouvoir l'écrire (403)", async () => {
    const ana = await commercial("staff-ana");
    await commercial("staff-reader", {
      grants: [{ resource: "b2b_sales_oversight", action: "read", effect: "allow" }],
    });
    const company = await sheet({ by: null, via: "self" });

    await assign(company, ana, "staff-reader").expect(403);
    expect(await followerOf(company)).toBeNull();
  });
});

describe("le signal d'une inscription sans suivi", () => {
  it("signale une inscription ancienne que personne ne suit, plus une fois attribuée", async () => {
    const ana = await commercial("staff-ana");
    const company = await sheet({ by: null, via: "self", ageDays: 10 });

    const before = await oversight("?signal=unassigned_signup");
    expect(before.rows.map((row) => row.companyId)).toEqual([company]);

    await assign(company, ana).expect(204);

    expect((await oversight("?signal=unassigned_signup")).rows).toEqual([]);
  });
});
