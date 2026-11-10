/**
 * La scène du **stock décompté** (lot L2, étendue au poids au lot L2b-1 —
 * `documentation/limites-de-commande/jour-meme-sur-stock.md`) : un
 * point, un article reçu deux fois, et une commande sur stock composée par
 * l'agrégat (`Order.draft`) puis écrite par le vrai dépôt
 * (`OrderRepository.place`). Partagée par `shelf-stock.e2e-spec.ts` et
 * `shelf-stock-weight.e2e-spec.ts`.
 */
import type { ResupplyArticleView } from "@lfd/contracts";
import { instantToLocal } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import { Order } from "../src/lafoliecoffee/orders/domain/entities/order.js";
import type { PricedDraftInput } from "../src/lafoliecoffee/orders/domain/entities/order-priced-draft.js";
import { pricedInput } from "../src/lafoliecoffee/orders/domain/entities/__tests__/priced-input.fixture.js";
import { OrderRepository } from "../src/lafoliecoffee/orders/domain/ports/order.repository.js";
import type { Clock } from "../src/platform/time/clock.js";
import { E2E_STAFF_ID, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { seedVillage } from "./internal-transfer-scene.js";
import { counterSent } from "./site-resupply-scene.js";

/** Le reçu du Village : un réassort réceptionné (10) et le sans commande (4) du même article. */
export interface Scene {
  readonly siteId: string;
  readonly day: string;
  readonly article: ResupplyArticleView;
  readonly resupplyId: string;
  readonly companyId: string;
  readonly userId: string;
}

export async function scene(ctx: E2eContext, clock: Clock): Promise<Scene> {
  const agent = ctx.asSub(E2E_STAFF_SUB);
  const siteId = await seedVillage(ctx);
  // Les pièces de la scène : un article au poids est proposé lui aussi
  // depuis le lot L2b-4, et compterait des grammes.
  const article = jsonBody<readonly ResupplyArticleView[]>(
    await agent.get("/admin/resupply-receipts/articles").expect(200),
  ).find((candidate) => candidate.saleUnit === "piece");
  if (article === undefined) {
    throw new Error("Le catalogue semé doit proposer au moins un article.");
  }
  const resupplyId = await counterSent(agent, siteId, "asap", [{ sku: article.sku, quantity: 10 }]);
  await agent
    .post(`/admin/resupply-receipts/${siteId}/resupplies/${resupplyId}/receive`)
    .expect(204);
  const day = instantToLocal(clock.now()).day;
  await agent
    .post(`/admin/resupply-receipts/${siteId}/${day}/lines`)
    .send({ sku: article.sku, quantity: 4 })
    .expect(204);
  const user = await createUser(ctx.prisma, { auth0Sub: "auth0|client", email: "c@vv.fr" });
  const company = await createCompany(ctx.prisma, { enseigne: "Chalet du Village" });
  await attachTo(ctx.prisma, user.id, company.id);
  return { siteId, day, article, resupplyId, companyId: company.id, userId: user.id };
}

/** Une ligne vendue : l'article de la scène à la pièce, sauf mention. */
export interface SoldLine {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: "piece" | "weight";
  readonly quantity: number;
}

/** L'article de la scène, à la pièce. */
export function pieces(scene: Scene, quantity: number): SoldLine {
  return { sku: scene.article.sku, productName: scene.article.name, saleUnit: "piece", quantity };
}

/** Un retrait au compte, au Village, aujourd'hui — composé par l'agrégat. */
export function draftOf(scene: Scene, line: SoldLine): PricedDraftInput {
  return pricedInput(
    {
      companyId: scene.companyId,
      billedCompanyId: scene.companyId,
      principal: null,
      placedByUserId: scene.userId,
      placedByStaffId: E2E_STAFF_ID,
      buyerKind: "registered",
      fulfillment: {
        method: "pickup",
        deliveryZoneId: null,
        deliveryAddress: null,
        deliveryAddressId: null,
        pickupAddress: {
          label: "Val Village",
          ligne1: "Route du Village",
          ligne2: "",
          codePostal: "73150",
          ville: "Val d'Isère",
          pays: "France",
          siteId: scene.siteId,
        },
      },
      agreed: {
        window: { value: { start: "08:00", end: "09:00" }, source: "override" },
        contact: { value: null, source: "default" },
        signatureRequired: { value: false, source: "default" },
      },
      requestedDeliveryDate: new Date(`${scene.day}T00:00:00.000Z`),
      note: "",
      catalogVersionId: null,
      voucher: null,
      salesTerms: { document: "salesTermsPro", revision: null, fileId: null },
      locale: null,
    },
    {
      lines: [
        {
          sku: line.sku,
          productName: line.productName,
          unitPriceMillicents: millicentsFromCents(120),
          vatRate: 5.5,
          saleUnit: line.saleUnit,
          quantity: line.quantity,
        },
      ],
    },
  );
}

/** Une commande sur stock (`supply = shelf`) du jour, écrite par le vrai dépôt. */
export async function sell(ctx: E2eContext, scene: Scene, line: SoldLine): Promise<string> {
  const order = Order.draft(draftOf(scene, line), {
    supply: "shelf",
    today: scene.day,
    entryShortcut: "immediate_pickup",
  });
  order.deferPayment();
  return (await ctx.app.get(OrderRepository).place(order)).id;
}
