/**
 * E2E du **filtre de date** et du **récapitulatif** de « Mes commandes » (plan
 * `documentation/commandes/plan-recapitulatif-des-commandes.md`, lot R1, §6)
 * — une frontière de sécurité : le mur tenant de la liste, repris tel quel.
 *
 * Ce que seul l'e2e prouve : le récapitulatif lit sous le VRAI mur (un owner
 * du principal agrège ses sites ; un `orders` du principal non ; un site
 * n'atteint pas son frère), le filtre de jour borne la vraie colonne
 * `@db.Date`, et les refus nommés sortent avec leur statut.
 *
 * Sociétés, rattachements et commandes semés par Prisma (dette de
 * `test/factories.ts`) ; tous les gestes par HTTP. Aucune date absolue.
 */
import {
  type CompanyOrderListItemView,
  type CompanyOrderSummaryView,
  ORDER_SUMMARY_MAX_ORDERS,
} from "@lfd/contracts";

import {
  CustomerRole,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  bootCustomerScene,
  company,
  customer,
  member,
  seedCustomerOrder,
} from "./order-customer-cancel-scene.js";
import { resetScene } from "./order-staff-cancel-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootCustomerScene();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetScene();
});

type Person = Awaited<ReturnType<typeof customer>>;

interface Group {
  readonly principal: string;
  readonly site: string;
  readonly sibling: string;
  readonly siteOwner: Person;
  readonly siblingOwner: Person;
}

async function group(): Promise<Group> {
  const principal = await company();
  const site = await company();
  const sibling = await company();
  await ctx.prisma.company.updateMany({
    where: { id: { in: [site, sibling] } },
    data: { parentCompanyId: principal },
  });
  const siteOwner = await customer();
  await member(siteOwner.id, site, { role: CustomerRole.owner });
  const siblingOwner = await customer();
  await member(siblingOwner.id, sibling, { role: CustomerRole.owner });
  return { principal, site, sibling, siteOwner, siblingOwner };
}

async function principalMember(g: Group, role: CustomerRole): Promise<Person> {
  const person = await customer();
  await member(person.id, g.principal, { role });
  return person;
}

/** Une commande au compte (sous-total 1 000, 55 de TVA à 5,5 %, 1 055 TTC). */
async function accountOrder(
  companyId: string,
  author: Person,
  over: {
    readonly status?: OrderStatus;
    readonly payment?: PaymentStatus;
    readonly inDays?: number | null;
  } = {},
): Promise<string> {
  const { orderId } = await seedCustomerOrder({
    placedByUserId: author.id,
    companyId,
    payment: over.payment ?? PaymentStatus.not_required,
    ...(over.status === undefined ? {} : { status: over.status }),
    ...(over.inDays === undefined ? {} : { inDays: over.inDays }),
  });
  await ctx.prisma.order.update({
    where: { id: orderId },
    data: { vatShares: [{ rate: 5.5, amountCents: 55 }] },
  });
  return orderId;
}

const summarize = (who: Person, companyId: string, orderIds: readonly string[]) =>
  ctx.asSub(who.sub).post(`/companies/${companyId}/orders/summary`).send({ orderIds });

describe("le récapitulatif sous le mur de la liste (§6.5)", () => {
  it("l'owner du principal agrège ses commandes et celles de ses deux sites, une table chacun", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);
    const own = await accountOrder(g.principal, boss);
    const ofSite = await accountOrder(g.site, g.siteOwner);
    const ofSibling = await accountOrder(g.sibling, g.siblingOwner);

    const summary = jsonBody<CompanyOrderSummaryView>(
      await summarize(boss, g.principal, [own, ofSite, ofSibling]).expect(200),
    );

    expect(summary.amountsAt).toBe("placement");
    expect(summary.companies.map((c) => c.companyId)[0]).toBe(g.principal);
    expect(summary.companies.map((c) => c.companyId).sort()).toEqual(
      [g.principal, g.site, g.sibling].sort(),
    );
    // La graine pose une ligne à 100 centimes sous un sous-total de 1 000 :
    // le produit somme les lignes, le bas somme les colonnes — chacun la sienne.
    expect(summary.total.products).toEqual([
      { sku: "VIE-001", name: "Croissant", quantity: 3, htCents: 300 },
    ]);
    expect(summary.total.bottom).toMatchObject({
      subtotalCents: 3_000,
      vat: [{ rate: 5.5, amountCents: 165 }],
      totalCents: 3_165,
    });
  });

  it("un `orders` du principal : la commande d'un site est hors de son mur, refus qui la nomme", async () => {
    const g = await group();
    const buyer = await principalMember(g, CustomerRole.orders);
    const ofSite = await accountOrder(g.site, g.siteOwner);

    const response = await summarize(buyer, g.principal, [ofSite]).expect(404);

    expect(JSON.stringify(response.body)).toContain(ofSite);
  });

  it("un site ne peut pas inclure une commande de son frère", async () => {
    const g = await group();
    const own = await accountOrder(g.site, g.siteOwner);
    const ofSibling = await accountOrder(g.sibling, g.siblingOwner);

    const response = await summarize(g.siteOwner, g.site, [own, ofSibling]).expect(404);

    expect(JSON.stringify(response.body)).toContain(ofSibling);
  });

  it("annulée, paiement en attente ou refusé : hors des totaux et listées", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);
    const kept = await accountOrder(g.principal, boss);
    const cancelled = await accountOrder(g.site, g.siteOwner, { status: OrderStatus.cancelled });
    const pending = await accountOrder(g.principal, boss, { payment: PaymentStatus.pending });
    const failed = await accountOrder(g.principal, boss, { payment: PaymentStatus.failed });

    const summary = jsonBody<CompanyOrderSummaryView>(
      await summarize(boss, g.principal, [kept, cancelled, pending, failed]).expect(200),
    );

    expect(summary.total.orderCount).toBe(1);
    expect(summary.total.bottom.totalCents).toBe(1_055);
    expect(summary.excluded.map((e) => [e.orderId, e.reason]).sort()).toEqual(
      [
        [cancelled, "cancelled"],
        [pending, "payment_pending"],
        [failed, "payment_failed"],
      ].sort(),
    );
  });

  it("au-delà du plafond : 400 qui le nomme", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);
    const ids = Array.from({ length: ORDER_SUMMARY_MAX_ORDERS + 1 }, (_, i) => `ord_${i}`);

    const response = await summarize(boss, g.principal, ids).expect(400);

    expect(JSON.stringify(response.body)).toContain(String(ORDER_SUMMARY_MAX_ORDERS));
  });
});

describe("le filtre de jour de retrait/livraison sur la liste (§6.6)", () => {
  const list = async (who: Person, companyId: string, query: string) =>
    jsonBody<readonly CompanyOrderListItemView[]>(
      await ctx.asSub(who.sub).get(`/companies/${companyId}/orders?${query}`).expect(200),
    );

  it("bornes incluses ; une commande sans date sort dès qu'une borne est posée", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);
    const early = await accountOrder(g.principal, boss, { inDays: 3 });
    const late = await accountOrder(g.site, g.siteOwner, { inDays: 10 });
    await accountOrder(g.principal, boss, { inDays: null });

    const bounded = await list(boss, g.principal, `from=${serviceDay(3)}&to=${serviceDay(3)}`);
    const fromOnly = await list(boss, g.principal, `from=${serviceDay(4)}`);
    const all = await list(boss, g.principal, "");

    expect(bounded.map((o) => o.id)).toEqual([early]);
    expect(fromOnly.map((o) => o.id)).toEqual([late]);
    expect(all).toHaveLength(3);
  });

  it("un jour absent du calendrier : 400", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);

    await ctx.asSub(boss.sub).get(`/companies/${g.principal}/orders?from=2026-02-30`).expect(400);
  });
});
