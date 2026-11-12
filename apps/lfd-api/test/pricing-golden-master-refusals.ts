/**
 * **Les cas fixes du golden master** : l'ordre des refus mesurable
 * aujourd'hui (plan `le-prix-d-un-panier.md`, §2.4) et la dérogation à
 * l'heure limite, qui seule fait naître un supplément de retard.
 *
 * L'ordre se mesure par PAIRES : un panier qui viole deux règles doit rendre
 * le code de celle que le §2.4 place en premier — le même code que le panier
 * qui ne viole qu'elle.
 */
import { randomUUID } from "node:crypto";

import { instantToLocal } from "@lfd/contracts";

import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import type { GoldenBasket } from "./pricing-golden-master-corpus.js";
import { contentOf, staffBody, type Agents } from "./pricing-golden-master-bodies.js";
import { arrange, placed, type Paths, type Run } from "./pricing-golden-master-paths.js";
import { fromEstimate, fromOrderQuote, fromShopQuote } from "./pricing-golden-master-record.js";
import {
  anchoredDay,
  BUYER_SUB,
  GOLDEN_CLOCK,
  type GoldenScene,
} from "./pricing-golden-master-scene.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const MINUTE_MS = 60_000;
const UNKNOWN_SKU = "ZZZ-999-1";

export const FIXED: GoldenBasket = {
  key: "fixed",
  lines: [
    { sku: "VIE-001-1", quantity: 3 },
    { sku: "PAI-001-1", quantity: 2 },
    { sku: "SAL-001-1", quantity: 1 },
  ],
  fulfillment: "pickup",
  deliveryVat: "standard",
  promotions: [],
  voucherSteps: 0,
  clientRevision: [],
  staffRevision: [],
};

export const WITH_UNKNOWN: GoldenBasket = {
  ...FIXED,
  lines: [...FIXED.lines, { sku: UNKNOWN_SKU, quantity: 1 }],
};

/** Une paire : `first` (deux règles violées) doit rendre le code de `over` (la première seule). */
export interface RefusalOrder {
  readonly label: string;
  readonly first: string;
  readonly over: string;
}

/**
 * La règle générale d'heure limite qui ferme la veille à `clock − 10 min`,
 * 45 minutes de rattrapage : J+2 est en grâce, J+1 est fermé.
 */
async function poseCutoff(ctx: E2eContext): Promise<void> {
  const limit = instantToLocal(new Date(GOLDEN_CLOCK.now().getTime() - 10 * MINUTE_MS));
  await ctx.prisma.orderCutoff.create({
    data: {
      pickupAddressId: null,
      weekday: null,
      daysBefore: 2,
      time: limit.time,
      graceMinutes: 45,
    },
  });
}

async function suspendedPro(ctx: E2eContext): Promise<{ companyId: string; buyerUserId: string }> {
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.suspended });
  const buyer = await createUser(ctx.prisma, {
    auth0Sub: "auth0|golden-suspendu",
    email: "suspendu@golden.fr",
  });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  return { companyId: company.id, buyerUserId: buyer.id };
}

/**
 * Trois paires, sur la passation de l'équipe : jour ouvert (3) avant
 * chargement (4) ; chargement (4) avant heure limite (5) ; chargement (4)
 * avant le crédit (rangé après 7 par Hugo, 2026-11-03). L'heure limite est
 * posée ici et reste posée pour la suite.
 *
 * ⚠️ Le payeur (1) n'est PAS mesuré : il ne refuse qu'un compte de groupe ou
 * un site dont le payeur n'est pas actif (`order-payer.ts`), que cette scène
 * ne sème pas. Une société SUSPENDUE, elle, n'est pas un refus de payeur : la
 * saisie de l'équipe la passe au lien, à son tarif (pro depuis le 2026-11-03,
 * `plan-suspendue-au-prix-pro.md` ; c'était le prix public), comme son client
 * dans son espace (`suspended.only`) ; au compte, elle est refusée (É18, L1c —
 * `pricing-golden-master-decisions.ts`).
 */
export async function refusalOrderCases(
  ctx: E2eContext,
  scene: GoldenScene,
  http: Agents,
): Promise<{ readonly paths: Paths; readonly orders: readonly RefusalOrder[] }> {
  const run: Run = { ctx, scene, basket: FIXED, http };
  await arrange(run);
  const suspended = await suspendedPro(ctx);
  const place = async (
    basket: GoldenBasket,
    day: string,
    payer: { readonly companyId: string; readonly buyerUserId: string } = scene.pro,
    settlement: "account" | "link" = "link",
  ): Promise<Paths[string]> =>
    placed(
      ctx,
      await http
        .as(E2E_STAFF_SUB)
        .post("/admin/orders")
        .set(INTENT_KEY, freshIntent())
        .send({
          ...staffBody(scene, basket, settlement),
          companyId: payer.companyId,
          buyerUserId: payer.buyerUserId,
          requestedDeliveryDate: day,
        }),
    );
  const week = anchoredDay(7);
  const paths: Paths = {
    "suspended.only": await place(FIXED, week, suspended),
    "suspended+unknown-sku": await place(WITH_UNKNOWN, week, suspended),
    "unknown-sku.only": await place(WITH_UNKNOWN, week),
    // Le règlement au compte sans crédit : rangé par Hugo le 2026-11-03 juste
    // après les gardes de l'agrégat (7), avant les verrous (8) — donc après le chargement.
    "no-credit.only": await place(FIXED, week, scene.proWithoutCredit, "account"),
    "no-credit+unknown-sku": await place(WITH_UNKNOWN, week, scene.proWithoutCredit, "account"),
    "same-day.only": await place(FIXED, anchoredDay(0)),
    "same-day+unknown-sku": await place(WITH_UNKNOWN, anchoredDay(0)),
  };
  await poseCutoff(ctx);
  paths["cutoff-closed.only"] = await place(FIXED, anchoredDay(1));
  paths["cutoff-closed+unknown-sku"] = await place(WITH_UNKNOWN, anchoredDay(1));
  return {
    paths,
    orders: [
      { label: "jour avant chargement", first: "same-day+unknown-sku", over: "same-day.only" },
      {
        label: "chargement avant crédit",
        first: "no-credit+unknown-sku",
        over: "unknown-sku.only",
      },
      {
        label: "chargement avant heure limite",
        first: "cutoff-closed+unknown-sku",
        over: "unknown-sku.only",
      },
    ],
  };
}

/**
 * La dérogation : J+2 en grâce, une dérogation ouverte pour le pro. Le devis
 * de la société, l'estimation et la passation de l'équipe chiffrent le même
 * supplément (É11 tranché, `le-prix-d-un-panier.md`, T1) ; le devis ne dépense pas
 * la dérogation. Le client repasse ensuite sur la dérogation dépensée.
 */
export async function lateFeeCase(
  ctx: E2eContext,
  scene: GoldenScene,
  http: Agents,
): Promise<Paths> {
  const basket: GoldenBasket = { ...FIXED, key: "late-fee" };
  await arrange({ ctx, scene, basket, http });
  const day = anchoredDay(2);
  await http
    .as(E2E_STAFF_SUB)
    .post("/admin/order-cutoff-waivers")
    .send({
      companyId: scene.pro.companyId,
      fulfillmentDate: day,
      reason: "Client bloqué en tournée",
    })
    .expect(201);
  const content = { ...contentOf(scene, basket, "pro"), requestedDeliveryDate: day };
  const staffPayload = { ...staffBody(scene, basket, "account"), requestedDeliveryDate: day };
  const quote = { companyId: scene.pro.companyId, lines: basket.lines, requestedDeliveryDate: day };
  return {
    "A.shop-quote.mine.company": fromShopQuote(
      await http
        .as(BUYER_SUB, scene.pro.companyId)
        .post("/shop/quote/mine")
        .send({
          lines: basket.lines,
          fulfillment: { method: "pickup", pickupAddressId: scene.siteId },
          requestedDeliveryDate: day,
          requestedWindow: { start: "07:00", end: "08:00" },
        }),
    ),
    "B.admin-orders-quote.company": fromOrderQuote(
      await http.as(E2E_STAFF_SUB).post("/admin/orders/quote").send(quote),
    ),
    "E.admin-orders-estimate.account": fromEstimate(
      await http.as(E2E_STAFF_SUB).post("/admin/orders/estimate").send(staffPayload),
    ),
    "C.admin-orders.account": await placed(
      ctx,
      await http
        .as(E2E_STAFF_SUB)
        .post("/admin/orders")
        .set(INTENT_KEY, freshIntent())
        .send(staffPayload),
    ),
    "C.orders.company.account": await placed(
      ctx,
      await http
        .as(BUYER_SUB, scene.pro.companyId)
        .post("/orders")
        .send({
          idempotencyKey: randomUUID(),
          salesTerms: null,
          settlement: "account",
          ...content,
        }),
    ),
  };
}
