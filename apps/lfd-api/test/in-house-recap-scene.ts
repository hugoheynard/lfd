/**
 * La scène du **récapitulatif des BL** d'un restaurant maison
 * (`documentation/comptabilite/facturation/restaurants-maison.md`) :
 * un payeur marqué par la vraie route, ses commandes internes passées par le
 * bus, et leurs BL remis.
 *
 * Les BL s'écrivent par Prisma : ils naissent à l'arrêt du plan et se
 * remettent au retrait, deux chemins qui exigent une journée de production —
 * la dette de `factories.ts`. Les CHECK d'état du BL tiennent ce qui est semé.
 */
import { addDays, instantToLocal } from "@lfd/contracts";

import { RecapMonth } from "../src/lafoliecoffee/in-house-recaps/domain/value-objects/recap-month.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { daysAgo, E2E_STAFF_SUB, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { placeOrder, pickupSite } from "./order-factory.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/** Le SKU du catalogue semé par le harnais. */
export const RECAP_SKU = "VIE-001-1";

/** Un payeur maison et l'acheteur qui commande pour lui. */
export interface InHouseBuyer {
  readonly companyId: string;
  readonly buyerId: string;
}

/** Une société au compte, son détenteur, marquée « maison » par la route de la fiche. */
export async function inHouseBuyer(ctx: E2eContext, sub: string): Promise<InHouseBuyer> {
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  const owner = await createUser(ctx.prisma, { auth0Sub: sub, email: `${sub}@recap.test` });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  await ctx
    .asSub(E2E_STAFF_SUB)
    .put(`/admin/companies/${company.id}/in-house`)
    .set(INTENT_KEY, freshIntent())
    .send({ inHouse: true })
    .expect(204);
  return { companyId: company.id, buyerId: owner.id };
}

/**
 * Antidate le marquage : maison depuis `at` — le passage du mois clos le
 * compte alors parmi les payeurs du mois.
 */
export async function inHouseSince(ctx: E2eContext, companyId: string, at: string): Promise<void> {
  await ctx.prisma.payerInHouse.updateMany({
    where: { companyId, withdrawnAt: null },
    data: { declaredAt: new Date(at) },
  });
}

/** Une commande interne du payeur, par le bus, retirée au point. */
export async function internalOrder(ctx: E2eContext, buyer: InHouseBuyer): Promise<string> {
  const placed = await placeOrder(ctx, {
    buyerUserId: buyer.buyerId,
    companyId: buyer.companyId,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    forDay: serviceDay(1),
    lines: [{ sku: RECAP_SKU, quantity: 1 }],
  });
  return placed.id;
}

/** Ce qu'un BL semé porte. */
export interface NoteSeed {
  readonly orderId: string;
  readonly rank: number;
  /** L'instant ISO de la remise ; `null` : BL préparé, pas remis. */
  readonly handedOverAt: string | null;
  readonly quantity: number;
  readonly productName?: string;
}

/** Le jour de Paris d'un instant, en date nue (la colonne est `@db.Date`). */
function parisDay(at: Date): Date {
  return new Date(`${instantToLocal(at).day}T00:00:00.000Z`);
}

/** Un BL de la commande, remis (ou seulement préparé) à l'instant donné ; rend son id. */
export async function seedNote(ctx: E2eContext, seed: NoteSeed): Promise<string> {
  const at = seed.handedOverAt === null ? new Date(daysAgo(0)) : new Date(seed.handedOverAt);
  const order = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: seed.orderId },
    select: { orderNumber: true },
  });
  const existing = await ctx.prisma.deliveryNote.findUnique({
    where: { orderId_rank: { orderId: seed.orderId, rank: seed.rank } },
    select: { id: true },
  });
  const id = existing?.id ?? `dn-${seed.orderId}-${String(seed.rank)}`;
  const state = {
    serviceDay: seed.rank === 1 ? null : parisDay(at),
    status: seed.handedOverAt === null ? ("prepared" as const) : ("handed_over" as const),
    plannedAt: at,
    preparedAt: at,
    handedOverAt: seed.handedOverAt === null ? null : at,
    receivedOn: seed.handedOverAt === null ? null : parisDay(at),
  };
  // Un BL prévu existant (né à la passation) prend l'état semé et ses lignes.
  await ctx.prisma.deliveryNote.upsert({
    where: { orderId_rank: { orderId: seed.orderId, rank: seed.rank } },
    update: state,
    create: {
      id,
      orderId: seed.orderId,
      rank: seed.rank,
      number: `${order.orderNumber}-BL${String(seed.rank)}`,
      vatMethod: "line_ht",
      ...state,
    },
  });
  await ctx.prisma.deliveryNoteLine.deleteMany({ where: { noteId: id } });
  await ctx.prisma.deliveryNoteLine.create({
    data: {
      id: `${id}-l1`,
      noteId: id,
      sku: RECAP_SKU,
      productName: seed.productName ?? "Croissant",
      unitPriceMillicents: 0,
      vatRate: "5.50",
      quantity: seed.quantity,
      lineTotalCents: 0,
    },
  });
  return id;
}

/** Le dernier mois clos à Paris, vu d'aujourd'hui. */
export function lastClosedMonth(): RecapMonth {
  return RecapMonth.lastClosedAt(new Date(daysAgo(0)));
}

/**
 * Un instant ISO du dernier mois clos : le `offset`-ième jour après son
 * début, à midi de Paris le plus proche — relatif à maintenant, par `daysAgo`.
 */
export function inLastClosedMonth(offset: number): string {
  const month = lastClosedMonth();
  const firstDay = `${month.key}-01`;
  const target = addDays(firstDay, offset);
  for (let days = 0; days < 70; days += 1) {
    const candidate = daysAgo(days);
    if (instantToLocal(new Date(candidate)).day === target) {
      return candidate;
    }
  }
  throw new Error(`Aucun jour ${target} dans les 70 derniers jours : la scène a changé.`);
}

/** Le passage mensuel, par la route machine. */
export async function runRecaps(ctx: E2eContext): Promise<{
  readonly month: string;
  readonly outcomes: readonly {
    readonly payerId: string;
    readonly kind: string;
    readonly recapId?: string;
  }[];
}> {
  return jsonBody(
    await ctx
      .http()
      .post("/admin/in-house-recaps/run")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200),
  );
}
