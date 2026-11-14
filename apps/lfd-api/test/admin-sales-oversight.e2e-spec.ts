/**
 * E2E du **suivi commercial** (`GET /admin/sales-oversight`, plan
 * `documentation/b2b/plan-suivi-commercial.md`, § 3.3).
 *
 * Ce que seul le vrai serveur prouve : la garde `b2b_sales_oversight` résolue
 * en base, les sites écartés par la vraie requête, les filtres appliqués en
 * SQL, les envois de l'accès lus au bloc `mail`, et l'absence de toute
 * coordonnée du prospect dans ce qui est servi.
 */
import type { SalesOversightView } from "@lfd/contracts";

import { MailRequest } from "../src/mail/requests/domain/entities/mail-request.js";
import { MailRequestRepository } from "../src/mail/requests/domain/ports/mail-request.repository.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { Clock } from "../src/platform/time/clock.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import { createCompany, createUser } from "./factories.js";

/** Le jeton porteur EST le `sub` : chaque agent a sa fiche. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const ROUTE = "/admin/sales-oversight";
const PROSPECT_EMAIL = "camille@test.fr";

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

async function read(query = ""): Promise<SalesOversightView> {
  const res = await ctx.asSub(E2E_STAFF_SUB).get(`${ROUTE}${query}`).expect(200);
  return jsonBody<SalesOversightView>(res);
}

/** Une fiche principale, suivie (ou non) et ouverte par un canal, il y a `ageDays` jours. */
async function sheet(
  raisonSociale: string,
  follow: { by: string | null; via: "staff" | "self" | null; ageDays?: number },
): Promise<string> {
  const company = await createCompany(ctx.prisma, { raisonSociale, status: "pending" });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: {
      followedByStaffId: follow.by,
      declaredVia: follow.via,
      createdAt: new Date(daysAgo(follow.ageDays ?? 1)),
    },
  });
  return company.id;
}

/** Une demande d'e-mail d'accès nommant la société, posée par l'agrégat. */
async function accessRequested(companyId: string, index: number): Promise<void> {
  const request = MailRequest.request({
    id: `mail_access_${companyId}_${index}`,
    template: "customer.access-opened",
    brand: "lfc",
    recipient: PROSPECT_EMAIL,
    locale: "fr",
    idempotencyKey: `e2e:access:${companyId}:${index}`,
    requestedAt: ctx.app.get(Clock).now(),
    subjects: [{ type: "company", id: companyId }],
  });
  await ctx.app.get(MailRequestRepository).save(request);
}

/** Un détenteur jamais connecté. */
async function ownerNeverLoggedIn(companyId: string): Promise<void> {
  const user = await createUser(ctx.prisma, { auth0Sub: `owner-${companyId}` });
  await ctx.prisma.membership.create({ data: { userId: user.id, companyId, role: "owner" } });
}

describe("le droit `b2b_sales_oversight`", () => {
  it("refuse un commercial qui ne l'a pas reçu (403)", async () => {
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "Commercial",
        email: "commercial-sans-suivi@lfc.test",
        role: "commercial",
        status: "active",
        auth0Id: "staff-commercial-sans-suivi",
      },
    });

    await ctx.asSub("staff-commercial-sans-suivi").get(ROUTE).expect(403);
  });
});

describe("GET /admin/sales-oversight", () => {
  it("écarte les sites, compte par niveau, et nomme le suiveur", async () => {
    const principal = await sheet("Principal", { by: E2E_STAFF_ID, via: "staff" });
    const site = await createCompany(ctx.prisma, { raisonSociale: "Site" });
    await ctx.prisma.company.update({
      where: { id: site.id },
      data: { parentCompanyId: principal, declaredVia: "staff" },
    });

    const view = await read();

    expect(view.rows.map((row) => row.companyId)).toEqual([principal]);
    expect(view.counts).toEqual({ directory: 1, contacted: 0, qualified: 0, opened: 0, active: 0 });
    expect(view.rows[0]?.followedBy).toMatchObject({ id: E2E_STAFF_ID, archived: false });
    expect(view.followers.map((follower) => follower.id)).toEqual([E2E_STAFF_ID]);
  });

  it("filtre par commercial, « non attribuée » et canal", async () => {
    const followed = await sheet("Suivie", { by: E2E_STAFF_ID, via: "staff" });
    const loose = await sheet("Libre", { by: null, via: "self" });

    const ids = (view: SalesOversightView): string[] => view.rows.map((row) => row.companyId);
    expect(ids(await read(`?follower=${E2E_STAFF_ID}`))).toEqual([followed]);
    expect(ids(await read("?follower=unassigned"))).toEqual([loose]);
    expect(ids(await read("?channel=commercial"))).toEqual([followed]);
    expect(ids(await read("?channel=self"))).toEqual([loose]);
  });

  it("signale l'accès envoyé deux fois sans connexion, et filtre par signal", async () => {
    const resent = await sheet("Relancée", { by: E2E_STAFF_ID, via: "staff" });
    const once = await sheet("Une fois", { by: E2E_STAFF_ID, via: "staff" });
    await ownerNeverLoggedIn(resent);
    await accessRequested(resent, 1);
    await accessRequested(resent, 2);
    await accessRequested(once, 1);

    const view = await read("?signal=access_resent");

    expect(view.rows.map((row) => row.companyId)).toEqual([resent]);
    expect(view.rows[0]).toMatchObject({ accessSentCount: 2, signals: ["access_resent"] });
    expect(view.counts.directory).toBe(1);
  });

  it("signale le retard d'une fiche restée à l'annuaire", async () => {
    const late = await sheet("Ancienne", { by: E2E_STAFF_ID, via: "staff", ageDays: 21 });
    await sheet("Récente", { by: E2E_STAFF_ID, via: "staff", ageDays: 1 });

    const view = await read("?signal=late");

    expect(view.rows.map((row) => row.companyId)).toEqual([late]);
    expect(view.rows[0]?.ageDays).toBe(21);
  });

  it("pagine par cinquante", async () => {
    for (let index = 0; index < 51; index += 1) {
      await sheet(`Fiche ${index}`, { by: E2E_STAFF_ID, via: "staff" });
    }

    const first = await read();
    const second = await read("?page=2");

    expect(first).toMatchObject({ total: 51, page: 1, pageSize: 50 });
    expect(first.rows).toHaveLength(50);
    expect(second.rows).toHaveLength(1);
  });

  it("ne sert aucune coordonnée du prospect", async () => {
    const company = await sheet("Discrète", { by: E2E_STAFF_ID, via: "staff" });
    await ctx.prisma.company.update({
      where: { id: company },
      data: { contactTelephone: "0612345678" },
    });

    const res = await ctx.asSub(E2E_STAFF_SUB).get(ROUTE).expect(200);

    expect(res.text).not.toContain(PROSPECT_EMAIL);
    expect(res.text).not.toContain("0612345678");
    expect(res.text).not.toContain("Camille");
  });
});
