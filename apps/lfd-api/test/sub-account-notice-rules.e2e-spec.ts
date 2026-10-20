/**
 * E2E du **tableau des avis au principal** (plan
 * `documentation/comptes-client/plan-notifications-sous-comptes.md`, lot N1).
 *
 * Ce que seul l'e2e prouve : l'enum Postgres et la clé composite de
 * `sub_account_notice_rules`, l'auteur relevé par le vrai décorateur staff, et
 * la porte `b2b_companies` devant les trois routes.
 *
 * Sociétés et rattachement écrits par Prisma, comme `sub-account-billing` :
 * le rattachement par HTTP est éprouvé par `sub-accounts.e2e-spec.ts`.
 *
 * Seule frontière doublée : la signature du jeton staff — le jeton EST le `sub`.
 */
import type { SubAccountNoticeRuleView, SubAccountNoticesView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** Une comptable : la fiche client en lecture seule — elle ne règle pas les avis. */
const ACCOUNTANT = { sub: "staff-comptable", role: "comptabilite", id: "fiche-comptable" } as const;

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
  await ctx.prisma.staffUser.create({
    data: {
      id: ACCOUNTANT.id,
      firstName: "Fiche",
      lastName: "Comptable",
      email: "comptable@lfc.test",
      role: ACCOUNTANT.role,
      status: "active",
      auth0Id: ACCOUNTANT.sub,
    },
  });
});

const admin = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

const notices = (companyId: string): string => `/admin/companies/${companyId}/sub-account-notices`;

/** Un principal et un site qui lui est rattaché. */
async function group(): Promise<{ principal: string; site: string }> {
  const principal = (await createCompany(ctx.prisma, { raisonSociale: "SAS Alpes Chalets" })).id;
  const site = (await createCompany(ctx.prisma, { raisonSociale: "", enseigne: "Chalet" })).id;
  await ctx.prisma.company.update({ where: { id: site }, data: { parentCompanyId: principal } });
  return { principal, site };
}

async function board(companyId: string): Promise<SubAccountNoticesView> {
  return jsonBody<SubAccountNoticesView>(await admin().get(notices(companyId)).expect(200));
}

async function grid(companyId: string): Promise<readonly SubAccountNoticeRuleView[]> {
  return (await board(companyId)).cells;
}

function cell(
  view: readonly SubAccountNoticeRuleView[],
  kind: SubAccountNoticeRuleView["kind"],
  role: SubAccountNoticeRuleView["role"],
): SubAccountNoticeRuleView | undefined {
  return view.find((entry) => entry.kind === kind && entry.role === role);
}

describe("le tableau des avis d'un principal", () => {
  it("rend le défaut du §1 tant que le staff n'y a pas touché", async () => {
    const { principal } = await group();

    const view = await grid(principal);

    expect(view).toHaveLength(32);
    expect(view.every((entry) => entry.atDefault)).toBe(true);
    expect(cell(view, "payment_failed", "billing")).toMatchObject({ enabled: true });
    expect(cell(view, "payment_failed", "orders")).toMatchObject({ enabled: false });
  });

  it("pose une dérogation, la relit, et garde son auteur", async () => {
    const { principal } = await group();

    await admin()
      .put(notices(principal))
      .send({ kind: "order_placed", role: "orders", enabled: false })
      .expect(204);

    expect(cell(await grid(principal), "order_placed", "orders")).toEqual({
      kind: "order_placed",
      role: "orders",
      enabled: false,
      atDefault: false,
    });
    const row = await ctx.prisma.subAccountNoticeRule.findFirstOrThrow({
      where: { principalCompanyId: principal },
      select: { updatedBy: true },
    });
    expect(row.updatedBy).not.toBe("");
  });

  it("remettre une cellule à son défaut efface la dérogation", async () => {
    const { principal } = await group();
    const put = (enabled: boolean) =>
      admin().put(notices(principal)).send({ kind: "order_placed", role: "orders", enabled });

    await put(false).expect(204);
    await put(true).expect(204);

    expect(
      await ctx.prisma.subAccountNoticeRule.count({ where: { principalCompanyId: principal } }),
    ).toBe(0);
  });

  it("« Revenir au défaut » efface toutes les dérogations", async () => {
    const { principal } = await group();
    await admin()
      .put(notices(principal))
      .send({ kind: "contact_changed", role: "billing", enabled: true })
      .expect(204);
    await admin()
      .put(notices(principal))
      .send({ kind: "payment_failed", role: "owner", enabled: false })
      .expect(204);

    await admin()
      .post(`${notices(principal)}/reset`)
      .expect(204);

    expect((await grid(principal)).every((entry) => entry.atDefault)).toBe(true);
  });

  it("refuse un sous-compte en nommant son principal, en lecture comme en écriture", async () => {
    const { principal, site } = await group();

    const read = await admin().get(notices(site)).expect(409);
    await admin()
      .put(notices(site))
      .send({ kind: "order_placed", role: "owner", enabled: false })
      .expect(409);
    await admin()
      .post(`${notices(site)}/reset`)
      .expect(409);

    expect(read.text).toContain(principal);
    expect(await ctx.prisma.subAccountNoticeRule.count()).toBe(0);
  });

  it("rend 404 pour une société inconnue", async () => {
    await admin().get(notices("societe-absente")).expect(404);
  });

  it("refuse une action inconnue à la forme (400)", async () => {
    const { principal } = await group();

    await admin()
      .put(notices(principal))
      .send({ kind: "order_eaten", role: "owner", enabled: false })
      .expect(400);
  });
});

describe("l'interrupteur des avis (2026-10-20)", () => {
  it("désactivé par défaut ; activé puis coupé par le staff, l'auteur tracé", async () => {
    const { principal } = await group();
    expect((await board(principal)).enabled).toBe(false);

    await admin()
      .put(`${notices(principal)}/enabled`)
      .send({ enabled: true })
      .expect(204);
    expect((await board(principal)).enabled).toBe(true);

    await admin()
      .put(`${notices(principal)}/enabled`)
      .send({ enabled: false })
      .expect(204);
    expect((await board(principal)).enabled).toBe(false);
    const row = await ctx.prisma.subAccountNoticeSetting.findUniqueOrThrow({
      where: { principalCompanyId: principal },
    });
    expect(row.updatedBy).toEqual(expect.any(String));
  });

  it("refuse un sous-compte (409) et une charge mal formée (400)", async () => {
    const { principal, site } = await group();
    await admin()
      .put(`${notices(site)}/enabled`)
      .send({ enabled: true })
      .expect(409);
    await admin()
      .put(`${notices(principal)}/enabled`)
      .send({ enabled: "oui" })
      .expect(400);
  });

  it("403 pour un staff sans le droit d'écrire la fiche client", async () => {
    const { principal } = await group();
    await ctx
      .asSub(ACCOUNTANT.sub)
      .put(`${notices(principal)}/enabled`)
      .send({ enabled: true })
      .expect(403);
  });
});

describe("la porte du tableau", () => {
  it("401 sans jeton", async () => {
    const { principal } = await group();

    await ctx.http().get(notices(principal)).expect(401);
  });

  it("403 pour un staff sans le droit d'écrire la fiche client", async () => {
    const { principal } = await group();

    await ctx
      .asSub(ACCOUNTANT.sub)
      .put(notices(principal))
      .send({ kind: "order_placed", role: "owner", enabled: false })
      .expect(403);
    await ctx
      .asSub(ACCOUNTANT.sub)
      .post(`${notices(principal)}/reset`)
      .expect(403);
  });
});
