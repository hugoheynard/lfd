/**
 * **Chaque chemin de chiffrage d'aujourd'hui, pour un panier** (inventaire
 * `inventaire-c0-assemblages.md`, §1) : A devis boutique et espace pro, B devis
 * du client et du simulateur, E estimation de la saisie, C passations, D
 * révision en deux temps (client, puis équipe).
 *
 * Les clés d'enregistrement portent la lettre de l'inventaire : un écart lu
 * dans l'instantané se rattache à son chemin sans ouvrir ce fichier.
 */
import { randomUUID } from "node:crypto";

import { PERSONAL_WORKSPACE } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";
import type request from "supertest";

import { ConvertLoyaltyPointsCommand } from "../src/lafoliecoffee/loyalty/application/commands/convert-loyalty-points.command.js";
import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import { E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import {
  contentOf,
  GOLDEN_DAY,
  shopQuoteBody,
  staffBody,
  type Agents,
} from "./pricing-golden-master-bodies.js";
import type { GoldenBasket } from "./pricing-golden-master-corpus.js";
import {
  createdIdOf,
  fromEstimate,
  fromOrderQuote,
  fromOrderRow,
  fromRevisionQuote,
  fromShopQuote,
  refusalOf,
  type Recorded,
} from "./pricing-golden-master-record.js";
import {
  BUYER_SUB,
  INDIVIDUAL_SUB,
  PENDING_SUB,
  type GoldenScene,
} from "./pricing-golden-master-scene.js";

export type Paths = Record<string, Recorded>;

/** Le devis en double : la seconde passe doit rendre la même chose (G3). */
export interface TwoPasses {
  readonly first: Paths;
  readonly second: Paths;
}

/** Un panier en cours d'enregistrement : la suite, la scène, ses appels. */
export interface Run {
  readonly ctx: E2eContext;
  readonly scene: GoldenScene;
  readonly basket: GoldenBasket;
  readonly http: Agents;
}

/** Les promotions et le mode de TVA du port du panier, posés par les vrais gestes. */
export async function arrange(run: Run): Promise<void> {
  const { ctx, basket, http } = run;
  await ctx.prisma.promotionScopeRule.deleteMany();
  await ctx.prisma.promotionAudienceTarget.deleteMany();
  await ctx.prisma.promotionPickupPoint.deleteMany();
  await ctx.prisma.promotionDeliveryZone.deleteMany();
  await ctx.prisma.promotion.deleteMany();
  for (const promotion of basket.promotions) {
    const response = await http.as(E2E_STAFF_SUB).post("/admin/promotions").send(promotion);
    if (response.status !== 201) {
      throw new Error(
        `Golden master : promotion refusée (${String(response.status)}) ${JSON.stringify(response.body)}`,
      );
    }
  }
  await http
    .as(E2E_STAFF_SUB)
    .put("/admin/order-delivery-vat")
    .send({ mode: basket.deliveryVat })
    .expect(204);
  ctx.app.get(PricingMaterialsCache).invalidate();
}

/** Un bon de `steps` paliers au nom du particulier, par la vraie conversion. */
async function voucherFor(run: Run, steps: number): Promise<string> {
  const holder = run.scene.individualUserId;
  await run.http
    .as(E2E_STAFF_SUB)
    .post("/admin/loyalty/adjustments")
    .send({ holderKind: "user", holderId: holder, points: steps * 1_000, reason: "corpus" })
    .expect(204);
  return run.ctx.app
    .get(CommandBus)
    .execute<ConvertLoyaltyPointsCommand, string>(
      new ConvertLoyaltyPointsCommand("user", holder, holder, steps, null),
    );
}

/** A — les devis de la boutique et de l'espace pro. */
async function shopQuotes(run: Run, voucherId: string | null): Promise<Paths> {
  const { scene, basket, http } = run;
  const voucher = voucherId === null ? {} : { voucherId };
  const body = shopQuoteBody(scene, basket);
  const mine = (sub: string, workspace: string, sent: Record<string, unknown>) =>
    http.as(sub, workspace).post("/shop/quote/mine").send(sent);
  return {
    "A.shop-quote.anonymous": fromShopQuote(await http.anonymous().post("/shop/quote").send(body)),
    "A.shop-quote.mine.personal": fromShopQuote(
      await mine(INDIVIDUAL_SUB, PERSONAL_WORKSPACE, { ...body, ...voucher }),
    ),
    "A.shop-quote.mine.company": fromShopQuote(await mine(BUYER_SUB, scene.pro.companyId, body)),
    "A.shop-quote.mine.pending": fromShopQuote(
      await mine(PENDING_SUB, scene.proPending.companyId, body),
    ),
  };
}

/** B et E — les devis du client et du simulateur, l'estimation de la saisie. */
async function orderQuotes(run: Run): Promise<Paths> {
  const { scene, basket, http } = run;
  const body = {
    companyId: scene.pro.companyId,
    lines: basket.lines,
    requestedDeliveryDate: GOLDEN_DAY,
  };
  return {
    "B.orders-quote.personal": fromOrderQuote(
      await http
        .as(INDIVIDUAL_SUB, PERSONAL_WORKSPACE)
        .post("/orders/quote")
        .send({ ...body, companyId: null }),
    ),
    "B.orders-quote.company": fromOrderQuote(
      await http.as(BUYER_SUB, scene.pro.companyId).post("/orders/quote").send(body),
    ),
    "B.admin-orders-quote.company": fromOrderQuote(
      await http.as(E2E_STAFF_SUB).post("/admin/orders/quote").send(body),
    ),
    "E.admin-orders-estimate.account": fromEstimate(
      await http
        .as(E2E_STAFF_SUB)
        .post("/admin/orders/estimate")
        .send(staffBody(scene, basket, "account")),
    ),
  };
}

/** Une passation : la commande relue en colonnes, ou le code du refus. */
export async function placed(ctx: E2eContext, response: request.Response): Promise<Recorded> {
  const id = createdIdOf(response);
  return id === null ? refusalOf(response) : fromOrderRow(ctx.prisma, response.status, id);
}

/** C — les passations d'un client (invité, particulier, pro, pro en attente). */
async function customerPlacements(run: Run, voucherId: string | null): Promise<Paths> {
  const { ctx, scene, basket, http } = run;
  const order = (sub: string, workspace: string, body: Record<string, unknown>) =>
    http
      .as(sub, workspace)
      .post("/orders")
      .send({ idempotencyKey: randomUUID(), salesTerms: null, ...body })
      .then((response) => placed(ctx, response));
  const individual = contentOf(scene, basket, "individual");
  const pro = contentOf(scene, basket, "pro");
  const pending = contentOf(scene, basket, "pro", basket.lines, scene.proPending);
  const guest = await http
    .anonymous()
    .post("/shop/orders")
    .send({
      idempotencyKey: randomUUID(),
      salesTerms: null,
      buyer: { firstName: "Camille", email: `${basket.key}@visiteur.fr`, phone: "0600000000" },
      ...individual,
    });
  const voucher = voucherId === null ? {} : { voucherId };
  const company = scene.pro.companyId;
  return {
    "C.shop-orders.guest": await placed(ctx, guest),
    "C.orders.personal.card": await order(INDIVIDUAL_SUB, PERSONAL_WORKSPACE, {
      settlement: "card",
      ...individual,
      ...voucher,
    }),
    "C.orders.company.account": await order(BUYER_SUB, company, { settlement: "account", ...pro }),
    "C.orders.company.card": await order(BUYER_SUB, company, { settlement: "card", ...pro }),
    "C.orders.pending.card": await order(PENDING_SUB, scene.proPending.companyId, {
      settlement: "card",
      ...pending,
    }),
  };
}

/** C — les passations de l'équipe ; rend aussi la commande à réviser. */
async function staffPlacements(
  run: Run,
): Promise<{ readonly paths: Paths; readonly revisable: string | null }> {
  const { ctx, scene, basket, http } = run;
  const place = (settlement: "account" | "link") =>
    http
      .as(E2E_STAFF_SUB)
      .post("/admin/orders")
      .send(staffBody(scene, basket, settlement));
  const account = await place("account");
  return {
    revisable: createdIdOf(account),
    paths: {
      "C.admin-orders.account": await placed(ctx, account),
      "C.admin-orders.link": await placed(ctx, await place("link")),
    },
  };
}

/** D — la révision en deux temps : le client, puis l'équipe, devis puis écriture. */
async function revisions(run: Run, orderId: string): Promise<Paths> {
  const { ctx, scene, basket, http } = run;
  const steps = [
    ["client", `/orders/${orderId}`, basket.clientRevision],
    ["staff", `/admin/orders/${orderId}`, basket.staffRevision],
  ] as const;
  const paths: Paths = {};
  for (const [who, base, lines] of steps) {
    const agent = (): request.Agent =>
      who === "client" ? http.as(BUYER_SUB, scene.pro.companyId) : http.as(E2E_STAFF_SUB);
    const content = contentOf(scene, basket, "pro", lines);
    const { revision } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { revision: true },
    });
    paths[`D.revision-quote.${who}`] = fromRevisionQuote(
      await agent().post(`${base}/revisions/quote`).send(content),
    );
    const written = await agent()
      .post(`${base}/revisions`)
      .send({ expectedRevision: revision, ...content });
    paths[`D.revision.${who}`] =
      written.status === 200 ? await fromOrderRow(ctx.prisma, 200, orderId) : refusalOf(written);
  }
  return paths;
}

/**
 * 🔴 **Le cœur du corpus** : un panier, tous ses chemins. Les conseils sont
 * joués deux fois AVANT toute écriture (la seconde passe prouve « même
 * panier, même résultat ») ; les passations et les révisions, une fois.
 */
export async function recordBasket(run: Run): Promise<TwoPasses> {
  await arrange(run);
  const voucherId =
    run.basket.voucherSteps > 0 ? await voucherFor(run, run.basket.voucherSteps) : null;
  const advice = async (): Promise<Paths> => ({
    ...(await shopQuotes(run, voucherId)),
    ...(await orderQuotes(run)),
  });
  const first = await advice();
  const second = await advice();
  const customers = await customerPlacements(run, voucherId);
  const staff = await staffPlacements(run);
  await run.ctx.drain();
  const revised = staff.revisable === null ? {} : await revisions(run, staff.revisable);
  return { first: { ...first, ...customers, ...staff.paths, ...revised }, second };
}
