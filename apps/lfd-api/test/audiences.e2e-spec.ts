/**
 * E2E des **audiences de la clientèle** (lot A1 de
 * `documentation/recommandation-produit/plan-audiences.md`).
 *
 * Ce qu'aucun test unitaire ne prouve : les agrégats SQL eux-mêmes — le
 * client distinct (société pour un pro, personne sinon), les exclusions en
 * base, le moment lu à l'heure de PARIS et non en UTC, les clés lues dans
 * les JSON figés (`pickup_address`, `delivery_address_snapshot`), la
 * jointure du code NAF — puis le seuil appliqué à une vraie réponse, et le
 * mur `b2b_growth`.
 *
 * Les commandes passent par le vrai chemin (plan T, 2026-10-25), antidatées
 * à hier matin ; les montants attendus sont relus sur la commande passée.
 */
import { addDays, instantToLocal, localToInstant, type AudiencesView } from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole, OrderStatus } from "../src/platform/database/client/client.js";
import { Clock } from "../src/platform/time/clock.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { bootstrapE2e, E2E_STAFF_ID, jsonBody, type E2eContext } from "./e2e-harness.js";
import { staffWith, stubAdminVerifier } from "./operations-at-commerce-scene.js";
import {
  cardGatewayDouble,
  payByCard,
  pickupSite,
  placeOrder,
  placeOrderForCustomer,
  type PlacedTestOrder,
} from "./order-factory.js";

const AUDIENCES = "/admin/audiences";

/** Deux baguettes par commande : une famille, les Pains. */
const BAGUETTES = [{ sku: "PAI-001", quantity: 2 }] as const;

const COURIER_ADDRESS = {
  label: "",
  ligne1: "1 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val-d'Isère",
  pays: "France",
};

let ctx: E2eContext;
let seq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: cardGatewayDouble("pi_audiences") },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Hier, jour métier du serveur — jamais une date écrite en dur. */
function yesterday(): string {
  return addDays(instantToLocal(ctx.app.get(Clock).now()).day, -1);
}

/** Hier à 8 h 30 À PARIS : 6 h 30 ou 7 h 30 en UTC, donc « nuit » si la base lisait l'UTC. */
function yesterdayMorning(): Date {
  const at = localToInstant(yesterday(), "08:30");
  if (at === null) {
    throw new Error("8 h 30 existe tous les jours à Paris");
  }
  return at;
}

/**
 * La commande d'un particulier, retirée au point semé, passée hier matin par
 * le vrai chemin (`placeOrder`, plan T) — carte en attente : à la suite de la
 * régler si elle doit compter.
 */
async function personalOrder(userId: string): Promise<PlacedTestOrder> {
  return placeOrder(ctx, {
    buyerUserId: userId,
    settlement: "card",
    placedAt: yesterdayMorning(),
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: BAGUETTES,
  });
}

/** Ce que la passation a écrit, relu — jamais recopié. */
async function amountsOf(order: PlacedTestOrder): Promise<{
  readonly subtotalCents: number;
  readonly totalCents: number;
}> {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { subtotalCents: true, totalCents: true },
  });
}

/** La zone de livraison de Val-d'Isère, sans laquelle un pro n'y est pas livré. */
async function deliveryZone(): Promise<void> {
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val-d'Isère", feeMode: "amount", feeValue: 750 },
  });
}

/**
 * Une société au compte, dont `buyer` est détenteur, avec son adresse de
 * livraison au carnet — un pro ne demande qu'une échéance qui y est inscrite.
 */
async function proCompany(
  buyer: { readonly id: string; readonly sub: string },
  nafCode: string,
): Promise<{ readonly companyId: string; readonly addressId: string }> {
  const company = await createCompany(ctx.prisma, { nafCode });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  const booked = await ctx
    .asSub(buyer.sub)
    .post(`/companies/${company.id}/delivery-addresses`)
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
  return { companyId: company.id, addressId: jsonBody<{ id: string }>(booked).id };
}

/** Une commande pro au compte, livrée à Val-d'Isère ; saisie par l'équipe si `byStaff`. */
async function proOrder(
  buyerId: string,
  pro: { readonly companyId: string; readonly addressId: string },
  byStaff = false,
): Promise<void> {
  const content = {
    buyerUserId: buyerId,
    companyId: pro.companyId,
    placedAt: yesterdayMorning(),
    window: { start: null, end: "10:00" },
    fulfillment: {
      method: "delivery" as const,
      address: COURIER_ADDRESS,
      addressId: pro.addressId,
    },
    lines: BAGUETTES,
  };
  await (byStaff
    ? placeOrderForCustomer(ctx, { ...content, staffUserId: E2E_STAFF_ID, settlement: "account" })
    : placeOrder(ctx, { ...content, settlement: "account" }));
}

async function person(): Promise<string> {
  return (await personWithSub()).id;
}

async function personWithSub(): Promise<{ readonly id: string; readonly sub: string }> {
  seq += 1;
  const sub = `auth0|audiences-${String(seq)}`;
  const user = await createUser(ctx.prisma, {
    auth0Sub: sub,
    email: `audiences-${String(seq)}@example.test`,
  });
  return { id: user.id, sub };
}

async function read(query: string): Promise<AudiencesView> {
  return jsonBody<AudiencesView>(
    await ctx.asSub("staff-e2e").get(`${AUDIENCES}${query}`).expect(200),
  );
}

function cellsOf(view: AudiencesView, dimension: string) {
  return view.segmentations.find((segmentation) => segmentation.dimension === dimension)?.cells;
}

/** Cinq particuliers, une commande réglée chacun ; rend les montants de la première. */
async function fivePeople(): Promise<{
  readonly subtotalCents: number;
  readonly totalCents: number;
}> {
  const orders: PlacedTestOrder[] = [];
  for (let index = 0; index < 5; index += 1) {
    const order = await personalOrder(await person());
    await payByCard(ctx, order);
    orders.push(order);
  }
  const [first] = orders;
  if (first === undefined) {
    throw new Error("cinq commandes semées");
  }
  return amountsOf(first);
}

describe("les audiences de la clientèle (A1)", () => {
  it("chiffre une case de cinq clients et exclut brouillon, annulée, carte non encaissée et abonnement", async () => {
    const one = await fivePeople();
    const outsider = await person();
    // Annulée, brouillon, issue d'un abonnement : des états que la passation
    // ne pose pas d'un geste. La commande est vraie ; seul l'état est posé
    // après coup, et c'est lui que la requête exclut (plan T, 2026-10-25).
    const cancelled = await personalOrder(outsider);
    await payByCard(ctx, cancelled);
    await ctx.prisma.order.update({
      where: { id: cancelled.id },
      data: { status: OrderStatus.cancelled },
    });
    const draft = await personalOrder(outsider);
    await payByCard(ctx, draft);
    await ctx.prisma.order.update({ where: { id: draft.id }, data: { status: OrderStatus.draft } });
    await personalOrder(outsider); // carte jamais encaissée
    const fromSubscription = await personalOrder(outsider);
    await payByCard(ctx, fromSubscription);
    await ctx.prisma.order.update({
      where: { id: fromSubscription.id },
      data: { fromSubscriptionId: "sub-audiences" },
    });

    const view = await read("?days=7&dimension=clientele");

    expect(view).toMatchObject({ days: 7, minClients: 5 });
    expect(cellsOf(view, "clientele")).toEqual([
      { status: "too_few_clients", key: "pro", label: "Professionnels" },
      {
        status: "shown",
        key: "public",
        label: "Particuliers",
        clients: 5,
        orders: 5,
        revenueHtCents: 5 * one.subtotalCents,
        revenueTtcCents: 5 * one.totalCents,
        averageBasketHtCents: one.subtotalCents,
        averageBasketTtcCents: one.totalCents,
        topFamilies: [
          { familyId: "fam-pains", name: "Pains", revenueHtCents: 5 * one.subtotalCents },
        ],
      },
    ]);
    // L'abonnement est à part, et une seule personne ne passe pas le seuil.
    expect(view.subscriptions).toEqual({
      status: "too_few_clients",
      key: "subscriptions",
      label: "Commandes d'abonnement",
    });
  });

  it("compte le client pro par SOCIÉTÉ, et masque une famille d'activité sous cinq sociétés", async () => {
    await deliveryZone();
    const buyer = await personWithSub();
    for (let index = 0; index < 4; index += 1) {
      const pro = await proCompany(buyer, "56.10A");
      // Deux commandes par société, par la même personne : quatre clients, pas
      // un. La première de la première société est saisie par l'équipe.
      await proOrder(buyer.id, pro, index === 0);
      await proOrder(buyer.id, pro);
    }
    await proOrder(buyer.id, await proCompany(buyer, "56.21Z"));

    const view = await read("?days=7");

    // 56.10A (quatre sociétés) et 56.21Z (une) font ensemble cinq restaurants.
    expect(cellsOf(view, "activity")?.find((cell) => cell.key === "restaurant")).toMatchObject({
      status: "shown",
      clients: 5,
      orders: 9,
    });
    expect(cellsOf(view, "delivery_zone")).toEqual([
      expect.objectContaining({
        status: "shown",
        key: "73150",
        label: "73150 Val-d'Isère",
        clients: 5,
      }),
    ]);
    expect(cellsOf(view, "loyalty")).toEqual([
      { status: "too_few_clients", key: "once", label: "1 commande" },
      { status: "too_few_clients", key: "regular", label: "2 à 4 commandes" },
      { status: "too_few_clients", key: "loyal", label: "5 commandes et plus" },
    ]);
  });

  it("range le moment à l'heure de Paris, et le site par l'identifiant figé du point", async () => {
    await fivePeople();
    const siteId = await pickupSite(ctx.prisma);

    const view = await read("?days=7");

    const weekday = new Date(`${yesterday()}T12:00:00.000Z`).getUTCDay();
    const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][weekday];
    const shown = cellsOf(view, "moment")?.filter((cell) => cell.status === "shown");
    expect(shown?.map((cell) => cell.key)).toEqual([`${String(dayKey)}-morning`]);
    expect(cellsOf(view, "pickup_site")).toEqual([
      expect.objectContaining({
        status: "shown",
        key: siteId,
        label: "Labo",
        clients: 5,
      }),
    ]);
    expect(cellsOf(view, "fulfillment")?.map((cell) => [cell.key, cell.status])).toEqual([
      ["pickup", "shown"],
      ["delivery", "too_few_clients"],
    ]);
  });

  it("ne rend aucun identifiant de client", async () => {
    await fivePeople();
    const body = JSON.stringify(await read("?days=7"));
    const users = await ctx.prisma.user.findMany({ select: { id: true } });
    for (const user of users) {
      expect(body).not.toContain(user.id);
    }
  });

  it("refuse une autre période, et se ferme à qui n'a pas b2b_growth", async () => {
    await ctx.asSub("staff-e2e").get(`${AUDIENCES}?days=14`).expect(400);
    const outsider = await staffWith(ctx, "sans-croissance", [
      { resource: "b2b_orders", action: "read" },
    ]);
    const reader = await staffWith(ctx, "lecteur-croissance", [
      { resource: "b2b_growth", action: "read" },
    ]);
    await ctx.asSub(outsider).get(AUDIENCES).expect(403);
    await ctx.asSub(reader).get(AUDIENCES).expect(200);
  });
});
