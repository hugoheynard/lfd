/**
 * E2E de la **vue payeur** du relevé de cycle (plan
 * `documentation/order/plan-agregation-des-commandes.md` §1.2, avant S4).
 *
 * Ce que seul le vrai SQL prouve : les périodes `company_follows` réelles,
 * lues sur un mois passé, rangent chaque commande d'un site chez le principal
 * qu'il suivait **à la date de la commande** — et un site détaché en cours de
 * mois laisse ses commandes d'avant chez le principal.
 *
 * ⚠️ Sociétés, suivis et commandes écrits par Prisma : même dette que
 * `cycle-statements.e2e-spec.ts`. Ce qui est éprouvé est en AVAL — la lecture.
 * Les dates sont posées relativement au cycle que le serveur annonce, jamais
 * écrites en dur.
 */
import type { CycleStatementView, StatementCycleView, StatementCyclesView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany, createUser } from "./factories.js";

const stubAdminVerifier = {
  verify: (subject: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject, scopes: [] }),
};

const BASE = "/admin/accounting/statements";
const DAY_MS = 86_400_000;

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

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

let seq = 0;

async function company(
  raisonSociale: string,
  enseigne: string,
  parentId?: string,
): Promise<string> {
  const created = await createCompany(ctx.prisma, { raisonSociale, enseigne });
  if (parentId !== undefined) {
    await ctx.prisma.company.update({
      where: { id: created.id },
      data: { parentCompanyId: parentId },
    });
  }
  return created.id;
}

async function followBilling(
  companyId: string,
  parentId: string,
  validFrom: Date,
  validTo: Date | null,
): Promise<void> {
  await ctx.prisma.companyFollow.create({
    data: { companyId, parentId, aspect: "billing", validFrom, validTo },
  });
}

async function seedOrder(
  companyId: string,
  createdAt: Date,
  subtotalCents: number,
): Promise<string> {
  seq += 1;
  const user = await createUser(ctx.prisma, { auth0Sub: `payeur-${String(seq)}` });
  const orderNumber = `CMD-PAY-${String(seq)}`;
  const vat = Math.round(subtotalCents * 0.055);
  await ctx.prisma.order.create({
    data: {
      orderNumber,
      companyId,
      placedByUserId: user.id,
      subtotalCents,
      vatCents: vat,
      vatShares: [{ rate: 5.5, amountCents: vat }],
      totalCents: subtotalCents + vat,
      status: "placed",
      paymentStatus: "not_required",
      createdAt,
    },
  });
  return orderNumber;
}

/** Un mois CLOS, annoncé par le serveur : deux mois avant le mois en cours. */
async function closedCycle(): Promise<StatementCycleView> {
  const { cycles } = jsonBody<StatementCyclesView>(await staff().get(`${BASE}/cycles`).expect(200));
  const cycle = cycles[2];
  if (cycle === undefined) {
    throw new Error("Le serveur n'annonce pas trois cycles.");
  }
  return cycle;
}

async function statement(companyId: string, month: string): Promise<CycleStatementView> {
  return jsonBody<CycleStatementView>(
    await staff().get(`${BASE}/companies/${companyId}?month=${month}`).expect(200),
  );
}

interface Group {
  readonly principal: string;
  readonly arolle: string;
  readonly edelweiss: string;
  readonly club: string;
  readonly month: string;
  readonly numbers: Readonly<Record<string, string>>;
}

/**
 * Le principal, deux sites et une entité. Arolle suit depuis avant le cycle ;
 * Edelweiss suivait aussi, et a été détaché au 15ᵉ jour du cycle ; le Club
 * est rattaché sans suivre `billing`.
 */
async function seedGroup(): Promise<Group> {
  const cycle = await closedCycle();
  const start = new Date(cycle.startsAt).getTime();
  const day = (n: number): Date => new Date(start + n * DAY_MS);

  const principal = await company("SAS Alpes Chalets", "Alpes Chalets");
  const arolle = await company("SAS Alpes Chalets", "Chalet Arolle", principal);
  const edelweiss = await company("SAS Alpes Chalets", "Chalet Edelweiss");
  const club = await company("Club Med Tignes SAS", "Club Med Tignes", principal);
  await followBilling(arolle, principal, day(-30), null);
  await followBilling(edelweiss, principal, day(-30), day(15));

  return {
    principal,
    arolle,
    edelweiss,
    club,
    month: cycle.month,
    numbers: {
      own: await seedOrder(principal, day(2), 10_000),
      arolle: await seedOrder(arolle, day(3), 2_000),
      edelweissBefore: await seedOrder(edelweiss, day(5), 3_000),
      edelweissAfter: await seedOrder(edelweiss, day(20), 4_000),
      club: await seedOrder(club, day(4), 5_000),
    },
  };
}

describe("le relevé d'un principal — la vue payeur", () => {
  it("groupe ses commandes puis celles de chaque site suivi à leur date, et liste l'entité à part", async () => {
    const group = await seedGroup();
    const view = await statement(group.principal, group.month);

    expect(
      view.groups.map((g) => [g.label, g.ownOrders, g.orders.map((o) => o.orderNumber)]),
    ).toEqual([
      ["Alpes Chalets", true, [group.numbers["own"]]],
      ["Chalet Arolle", false, [group.numbers["arolle"]]],
      // détaché au 15ᵉ jour : la commande du 5 reste, celle du 20 sort
      ["Chalet Edelweiss", false, [group.numbers["edelweissBefore"]]],
    ]);
    expect(view.selfPayingEntities).toEqual([{ companyId: group.club, name: "Club Med Tignes" }]);
  });

  it("totalise le relevé comme la somme des groupes, au centime", async () => {
    const group = await seedGroup();
    const { groups, totals } = await statement(group.principal, group.month);

    const sum = (pick: (t: CycleStatementView["totals"]) => number): number =>
      groups.reduce((total, g) => total + pick(g.totals), 0);
    expect(totals.orderCount).toBe(3);
    expect(totals.totalCents).toBe(sum((t) => t.totalCents));
    expect(totals.vatCents).toBe(sum((t) => t.vatCents));
    expect(totals.vatByRate).toEqual([{ rate: 5.5, amountCents: totals.vatCents }]);
  });

  it("garde le relevé d'un site à ses seules commandes, et nomme le principal sur celles qu'il a réglées", async () => {
    const group = await seedGroup();
    const view = await statement(group.edelweiss, group.month);

    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]?.orders.map((o) => [o.orderNumber, o.paidBy?.name ?? null])).toEqual([
      [group.numbers["edelweissBefore"], "Alpes Chalets"],
      [group.numbers["edelweissAfter"], null],
    ]);
  });

  it("renseigne la colonne Site du CSV", async () => {
    const group = await seedGroup();
    const response = await staff()
      .get(`${BASE}/companies/${group.principal}/export.csv?month=${group.month}`)
      .expect(200);

    expect(response.text).toContain(`"${group.numbers["arolle"] ?? ""}";"Chalet Arolle"`);
    expect(response.text).not.toContain(`"${group.numbers["edelweissAfter"] ?? ""}"`);
  });
});
