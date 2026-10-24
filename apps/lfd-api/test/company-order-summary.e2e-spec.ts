/**
 * E2E du **filtre de date** et du **récapitulatif** de « Mes commandes » (plan
 * `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`, lot R1, §6)
 * — une frontière de sécurité : le mur tenant de la liste, repris tel quel.
 *
 * Ce que seul l'e2e prouve : le récapitulatif lit sous le VRAI mur (un owner
 * du principal agrège ses sites ; un `orders` du principal non ; un site
 * n'atteint pas son frère), le filtre de jour borne la vraie colonne
 * `@db.Date`, et les refus nommés sortent avec leur statut.
 *
 * Sociétés et rattachements semés par Prisma (dette de `test/factories.ts`) ;
 * les commandes passées par le vrai chemin (`placeOrder`, plan T) — les
 * montants attendus sont RELUS sur elles, jamais recopiés ; tous les gestes
 * par HTTP. Aucune date absolue.
 */
import { Buffer } from "node:buffer";

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
import { pdfPages } from "../src/platform/pdf/__tests__/pdf-text.js";
import { jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  bootCustomerScene,
  company,
  customer,
  member,
  seedCustomerOrder,
} from "./order-customer-cancel-scene.js";
import { placeOrder } from "./order-factory.js";
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

/** Une commande au compte d'un croissant, au prix du catalogue. */
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
  return orderId;
}

/** Les montants que la passation a figés — ce que le récapitulatif doit sommer. */
async function amountsOf(orderId: string) {
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      subtotalCents: true,
      vatCents: true,
      totalCents: true,
      lines: { select: { lineTotalCents: true } },
    },
  });
  const linesHt = row.lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  return { ...row, linesHt };
}

/** Des centimes comme le PDF et le tableur les impriment : `21,10`. */
function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Le port de la zone de livraison semée : 7,50 €. */
const DELIVERY_FEE = 750;

const COURIER_ADDRESS = {
  label: "",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Une commande au compte LIVRÉE dans la zone semée, par le vrai chemin (plan T). */
async function deliveredAccountOrder(companyId: string, author: Person): Promise<string> {
  await ctx.prisma.deliveryZone.create({
    data: {
      postalPrefixes: ["73150"],
      label: "Val d'Isère",
      feeMode: "amount",
      feeValue: DELIVERY_FEE,
    },
  });
  await ctx.prisma.company.update({
    where: { id: companyId },
    data: { grantedTerms: ["monthly"] },
  });
  // Un pro ne demande qu'une échéance inscrite sur l'adresse de son carnet.
  const booked = await ctx
    .asSub(author.sub)
    .post(`/companies/${companyId}/delivery-addresses`)
    .send({
      ...COURIER_ADDRESS,
      isDefault: true,
      specs: {
        signatureRequired: null,
        note: "",
        slotList: { mode: "everyday", slots: [] },
        deliveryContact: null,
        gps: null,
        windowMode: "deadline",
        deadlines: { mode: "everyday", times: ["10:00"] },
      },
    })
    .expect(201);
  const order = await placeOrder(ctx, {
    buyerUserId: author.id,
    companyId,
    settlement: "account",
    window: { start: null, end: "10:00" },
    fulfillment: {
      method: "delivery",
      address: COURIER_ADDRESS,
      addressId: jsonBody<{ id: string }>(booked).id,
    },
    lines: [{ sku: "VIE-001", quantity: 1 }],
  });
  return order.id;
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
    // Le produit somme les lignes, le bas somme les colonnes — chacun la sienne.
    const amounts = await Promise.all([own, ofSite, ofSibling].map(amountsOf));
    const sum = (pick: (a: (typeof amounts)[number]) => number) =>
      amounts.reduce((total, a) => total + pick(a), 0);
    expect(summary.total.products).toEqual([
      { sku: "VIE-001", name: "Croissant", quantity: 3, htCents: sum((a) => a.linesHt) },
    ]);
    expect(summary.total.bottom).toMatchObject({
      subtotalCents: sum((a) => a.subtotalCents),
      vat: [{ rate: 5.5, amountCents: sum((a) => a.vatCents) }],
      totalCents: sum((a) => a.totalCents),
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
    expect(summary.total.bottom.totalCents).toBe((await amountsOf(kept)).totalCents);
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

describe("le récapitulatif en PDF et au tableur (lot R2) — même mur, mêmes refus", () => {
  const summarizeAs = (
    who: Person,
    companyId: string,
    orderIds: readonly string[],
    format: "pdf" | "csv",
  ) =>
    ctx
      .asSub(who.sub)
      .post(`/companies/${companyId}/orders/summary`)
      .send({ orderIds, format })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          callback(null, Buffer.concat(chunks));
        });
      });

  function bytesOf(body: unknown): Buffer {
    if (!(body instanceof Uint8Array)) {
      throw new TypeError("le corps servi n'est pas binaire");
    }
    return Buffer.from(body);
  }

  it("PDF : la société demandeuse, ses sites, le bas, nommé et exposé au téléchargement", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);
    const own = await accountOrder(g.principal, boss);
    const ofSite = await accountOrder(g.site, g.siteOwner);
    const cancelled = await accountOrder(g.principal, boss, { status: OrderStatus.cancelled });

    const response = await summarizeAs(boss, g.principal, [own, ofSite, cancelled], "pdf").expect(
      200,
    );

    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toMatch(
      /recapitulatif-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.pdf/u,
    );
    const text = pdfPages(bytesOf(response.body)).join(" ").replace(/\s+/gu, " ");
    expect(text).toContain("RÉCAPITULATIF DE COMMANDES");
    expect(text).toContain("Montants à la commande");
    expect(text).toContain("Total général");
    const general = (await amountsOf(own)).totalCents + (await amountsOf(ofSite)).totalCents;
    expect(text).toContain(`Total TTC ${euros(general)}`);
    expect(text).toContain("annulée");
    // Les bons inclus en annexe, sur leur page (§10).
    expect(text).toContain("Page 1/2");
    expect(text).toContain("CONFIRMATIONS DE COMMANDE INCLUSES");
  });

  it("les bons inclus : une commande LIVRÉE porte ses frais au bas et dans le HT de son bon (§10)", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);
    const pickedUp = await accountOrder(g.principal, boss);
    const delivered = await deliveredAccountOrder(g.principal, boss);
    const cancelled = await accountOrder(g.principal, boss, { status: OrderStatus.cancelled });
    const ids = [pickedUp, delivered, cancelled];

    const summary = jsonBody<CompanyOrderSummaryView>(
      await summarize(boss, g.principal, ids).expect(200),
    );

    const bons = summary.companies[0]?.orders ?? [];
    const pickedUpHt = (await amountsOf(pickedUp)).subtotalCents;
    const deliveredHt = (await amountsOf(delivered)).subtotalCents;
    expect(bons.map((o) => [o.orderId, o.fulfillmentMethod, o.pretaxCents]).sort()).toEqual(
      [
        [pickedUp, "pickup", pickedUpHt],
        [delivered, "delivery", deliveredHt + DELIVERY_FEE],
      ].sort(),
    );
    expect(bons[0]?.author).toEqual({ kind: "customer", name: "Léa Petit" });
    expect(bons[0]?.day).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(summary.total.bottom.deliveryFeeCents).toBe(DELIVERY_FEE);
    expect(summary.total.ordersPretax).toEqual({
      pretaxCents: pickedUpHt + deliveredHt + DELIVERY_FEE,
      gapCents: DELIVERY_FEE,
      cappedDiscountCents: 0,
    });

    const pdf = await summarizeAs(boss, g.principal, ids, "pdf").expect(200);
    const text = pdfPages(bytesOf(pdf.body)).join(" ").replace(/\s+/gu, " ");
    expect(text).toContain("Livraison 7,50");
    expect(text).toContain("Écart avec le sous-total HT : livraison");
    const csv = await summarizeAs(boss, g.principal, ids, "csv").expect(200);
    expect(bytesOf(csv.body).toString("utf8")).toContain('"Total HT des bons";');
  });

  it("CSV : BOM, une ligne par (société, produit), puis le bas", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);
    const own = await accountOrder(g.principal, boss);

    const response = await summarizeAs(boss, g.principal, [own], "csv").expect(200);

    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toMatch(/recapitulatif-.+\.csv/u);
    const csv = bytesOf(response.body).toString("utf8");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const amounts = await amountsOf(own);
    expect(csv).toContain(`"Croissant";"VIE-001";1;${euros(amounts.linesHt)}`);
    expect(csv).toContain(`"Total général";"Total TTC";"";;${euros(amounts.totalCents)}`);
  });

  it("CSV : la période du corps est imprimée, et ne retire aucune commande (§9)", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);
    const own = await accountOrder(g.principal, boss);
    // Bornes sans rapport avec le jour de la commande : informatives, les ids font foi.
    const period = { from: "2020-01-01", to: "2020-01-15" };

    const response = await ctx
      .asSub(boss.sub)
      .post(`/companies/${g.principal}/orders/summary`)
      .send({ orderIds: [own], format: "csv", period })
      .expect(200);

    expect(response.text).toContain("Retraits et livraisons du 1er au 15 janvier 2020");
    expect(response.text).toContain(
      `"Croissant";"VIE-001";1;${euros((await amountsOf(own)).linesHt)}`,
    );
  });

  it("une période mal formée : 400", async () => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);
    const own = await accountOrder(g.principal, boss);

    await ctx
      .asSub(boss.sub)
      .post(`/companies/${g.principal}/orders/summary`)
      .send({ orderIds: [own], format: "pdf", period: { from: "2020-02-30" } })
      .expect(400);
  });

  it.each(["pdf", "csv"] as const)(
    "%s : un site ne peut pas inclure une commande de son frère — 404 qui la nomme",
    async (format) => {
      const g = await group();
      const own = await accountOrder(g.site, g.siteOwner);
      const ofSibling = await accountOrder(g.sibling, g.siblingOwner);

      const response = await summarizeAs(g.siteOwner, g.site, [own, ofSibling], format).expect(404);

      expect(bytesOf(response.body).toString("utf8")).toContain(ofSibling);
    },
  );

  it.each(["pdf", "csv"] as const)("%s : au-delà du plafond, 400 qui le nomme", async (format) => {
    const g = await group();
    const boss = await principalMember(g, CustomerRole.owner);
    const ids = Array.from({ length: ORDER_SUMMARY_MAX_ORDERS + 1 }, (_, i) => `ord_${i}`);

    const response = await summarizeAs(boss, g.principal, ids, format).expect(400);

    expect(bytesOf(response.body).toString("utf8")).toContain(String(ORDER_SUMMARY_MAX_ORDERS));
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
