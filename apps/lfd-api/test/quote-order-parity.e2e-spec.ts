/**
 * 🔴 **Le devis prédit la facture — éprouvé, plus seulement construit.**
 *
 * ## L'invariant, et pourquoi il n'était tenu par rien
 *
 * « Un devis qui ne prédit pas la facture ne sert à rien. » C'est *l*'invariant
 * de toute la chaîne de prix, et il était tenu **par construction** : même
 * `ventilateVat`, même `CartAdjustments`, même `OrderLinePricing`. Une
 * construction partagée rend un invariant _probable_ ; un test le rend _tenu_.
 *
 * Ce qui manquait n'était pas une assertion de plus. `shop-quote.e2e-spec.ts`
 * vérifiait des nombres, `orders.e2e-spec.ts` en vérifiait d'autres — **aucun ne
 * faisait les deux sur le même panier**. Rien n'aurait rougi si quelqu'un
 * ajoutait un terme d'un seul côté : le devis et la facture auraient divergé en
 * silence, et l'écart se serait découvert devant le client.
 *
 * ## Pourquoi ce fichier compare la BASE, pas deux réponses HTTP
 *
 * Le devis est une vue ; la facture est ce qui est **écrit**. Comparer deux vues
 * laisserait passer une erreur de persistance — un total juste rendu, mal
 * enregistré. Ici le devis est comparé aux **colonnes de la commande**, qui sont
 * ce qu'un document comptable relira.
 *
 * ## Ce qu'il ne couvre pas
 *
 * La surtaxe de retard : elle dépend de l'heure limite, et l'opposer ici
 * mélangerait deux sujets. Elle a ses propres suites.
 */
import { randomUUID } from "node:crypto";

import type { BillingAddressPayload, ShopQuotePayload, ShopQuoteView } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";
import request from "supertest";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";

/** Passerelle doublée : une commande personnelle se règle par carte. */
const fakeGateway = {
  createIntent: () => Promise.resolve({ paymentIntentId: "pi_e2e", clientSecret: "pi_e2e_secret" }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

let ctx: E2eContext;
let pickupId = "pickup_absent";

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: PaymentGateway, value: fakeGateway }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  pickupId = await seedPickup();
  await seedZone();
});

const SERVICE_DAY = serviceDay();
const BUYER = "auth0|parite";

/**
 * Un panier à **deux taux** et deux quantités — c'est la forme qui casse.
 *
 * Un panier mono-taux passerait même si la ventilation était fausse : la remise
 * au prorata et l'arrondi par groupe ne se voient qu'à partir de deux taux, et
 * deux quantités différentes exercent l'arrondi de ligne.
 */
const PANIER = [
  { sku: "VIE-001", quantity: 12 },
  { sku: "PAI-001", quantity: 7 },
] as const;

/** Un point de retrait qui **remet 10 %** — la remise doit se retrouver des deux côtés. */
async function seedPickup(): Promise<string> {
  const point = await ctx.prisma.pickupAddress.create({
    data: {
      label: "Le Labo",
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
      isDefault: true,
      discountMode: "percent",
      discountValue: 1_000,
    },
    select: { id: true },
  });
  return point.id;
}

/**
 * Deux zones : un **forfait** sur le 73150, un **pourcentage** sur le 38000.
 *
 * 🔴 La seconde n'est pas un doublon. Un forfait se reconstruit à l'identique
 * depuis son montant — un test qui n'aurait que lui laisserait passer un code
 * qui refabrique le barème au lieu de le figer, et c'est exactement ce qu'une
 * mutation a démontré le 2026-09-09. Sur un pourcentage, « 10 % » et « 2,40 € »
 * sont deux phrases différentes, et seule la première se relit sur une facture.
 */
async function seedZone() {
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2_000 },
  });
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["38000"], label: "Grenoble", feeMode: "percent", feeValue: 1_000 },
  });
}

/** L'adresse de la zone au POURCENTAGE. */
const PERCENT_ADDR: BillingAddressPayload = {
  label: "",
  ligne1: "3 place Grenette",
  ligne2: "",
  codePostal: "38000",
  ville: "Grenoble",
  pays: "France",
};

const COURIER_ADDR: BillingAddressPayload = {
  label: "",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Sans jeton : le devis est public, et c'est tout l'objet de la route. */
const quote = (payload: ShopQuotePayload) =>
  request(ctx.app.getHttpServer()).post("/shop/quote").send(payload);

/** Les colonnes d'argent de la commande — ce qu'une facture relira. */
async function moneyOf(orderId: string) {
  const order = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      subtotalCents: true,
      discountCents: true,
      deliveryFeeCents: true,
      vatCents: true,
      totalCents: true,
    },
  });
  return order;
}

/**
 * 🔴 **Le cœur du fichier.** Le même panier, le même acheminement, les deux
 * chemins — et **chaque** montant comparé, pas seulement le total.
 *
 * Le total seul laisserait passer une compensation : une remise trop forte
 * annulée par des frais trop élevés donne le bon total et deux lignes fausses
 * sur le document que le client reçoit.
 */
async function expectParity(
  payload: ShopQuotePayload,
  orderContent: Record<string, unknown>,
): Promise<void> {
  const view = jsonBody<ShopQuoteView>(await quote(payload).expect(200));
  const placed = jsonBody<{ id: string }>(
    await ctx
      .asSub(BUYER)
      .post("/orders")
      .send({
        idempotencyKey: randomUUID(),
        companyId: null,
        requestedDeliveryDate: SERVICE_DAY,
        note: "",
        lines: [...payload.lines],
        ...orderContent,
      })
      .expect(201),
  ).id;

  const facture = await moneyOf(placed);

  expect({
    subtotalCents: view.subtotalHtCents,
    discountCents: view.discountCents,
    deliveryFeeCents: view.deliveryFeeCents,
    vatCents: view.vat.reduce((sum, share) => sum + share.amountCents, 0),
    totalCents: view.totalCents,
  }).toEqual(facture);
}

describe("le devis de la vitrine et la facture", () => {
  it("🔴 s'accordent au centime en RETRAIT, remise comprise", async () => {
    await expectParity(
      {
        lines: [...PANIER],
        fulfillment: { method: "pickup", pickupAddressId: pickupId },
      },
      { fulfillmentMethod: "pickup", pickupAddressId: pickupId },
    );
  });

  it("🔴 s'accordent au centime en COURSIER, frais de zone compris", async () => {
    await expectParity(
      {
        lines: [...PANIER],
        fulfillment: { method: "delivery", codePostal: COURIER_ADDR.codePostal },
      },
      { fulfillmentMethod: "delivery", deliveryAddress: COURIER_ADDR },
    );
  });

  /**
   * 🔴 **Et ils s'accordent encore quand une RÈGLE joue.**
   *
   * Les deux cas ci-dessus passeraient sur des prix de catalogue même si l'un
   * des deux chemins ignorait toute la tarification — c'est exactement le défaut
   * qui a produit l'écart de 1,83924 € contre 1,65532 € sur l'écran de
   * tarification. Un barème qui s'ouvre à la quantité du panier force les deux
   * chemins à traverser la résolution.
   */
  it("🔴 s'accordent quand un barème de volume s'ouvre sur le panier", async () => {
    await ctx.prisma.volumeLadder.create({
      data: {
        id: "ladder_parite",
        scopeType: "product",
        scopeId: "VIE-001",
        audienceType: "all",
        audienceId: null,
        unit: "percent",
        tiers: [{ minQuantity: 10, value: 1_500 }],
        label: "Barème dix pièces",
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        createdBy: "e2e",
      },
    });

    const view = jsonBody<ShopQuoteView>(
      await quote({
        lines: [...PANIER],
        fulfillment: { method: "pickup", pickupAddressId: pickupId },
      }).expect(200),
    );

    // Le barème a bien mordu : sans lui, le devis rendrait le prix catalogue.
    const croissant = view.lines.find((line) => line.sku === "VIE-001");
    expect(croissant?.unitPriceMillicents).toBeLessThan(millicentsFromCents(200));

    await expectParity(
      {
        lines: [...PANIER],
        fulfillment: { method: "pickup", pickupAddressId: pickupId },
      },
      { fulfillmentMethod: "pickup", pickupAddressId: pickupId },
    );
  });

  /**
   * La **ventilation par taux** s'accorde aussi, ligne à ligne.
   *
   * Le total de TVA peut tomber juste alors que sa répartition est fausse : deux
   * taux qui se compensent d'un centime donnent la même somme et deux lignes
   * fausses sur le document. C'est la seule assertion du fichier qui regarde le
   * DÉTAIL, et c'est celle qu'une facture relira.
   */
  it("🔴 s'accordent sur la TVA par TAUX, pas seulement sur son total", async () => {
    const view = jsonBody<ShopQuoteView>(
      await quote({
        lines: [...PANIER],
        fulfillment: { method: "pickup", pickupAddressId: pickupId },
      }).expect(200),
    );

    const placed = jsonBody<{ id: string }>(
      await ctx
        .asSub(BUYER)
        .post("/orders")
        .send({
          idempotencyKey: randomUUID(),
          companyId: null,
          requestedDeliveryDate: SERVICE_DAY,
          note: "",
          fulfillmentMethod: "pickup",
          pickupAddressId: pickupId,
          lines: [...PANIER],
        })
        .expect(201),
    ).id;

    const { vatShares } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: placed },
      select: { vatShares: true },
    });

    expect(vatShares).toEqual(view.vat.map((share) => ({ ...share })));
  });

  /**
   * 🔴 **Le barème de la zone est figé avec ses frais** (défaut R5, corrigé le
   * 2026-09-09).
   *
   * C'était le dernier terme du panier à n'avoir que son montant. Or
   * `delivery_zones.fee_value` est **mutable** : ce cas le prouve en la
   * modifiant après la commande, et en vérifiant que la commande garde le
   * barème du jour. Sans la colonne, une facture chiffrerait « Livraison
   * 20,00 € » en ne sachant relire qu'un forfait à 35 € — celui d'aujourd'hui.
   */
  it("🔴 fige le barème de zone, qui survit à sa modification", async () => {
    const placed = jsonBody<{ id: string }>(
      await ctx
        .asSub(BUYER)
        .post("/orders")
        .send({
          idempotencyKey: randomUUID(),
          companyId: null,
          requestedDeliveryDate: SERVICE_DAY,
          note: "",
          fulfillmentMethod: "delivery",
          deliveryAddress: COURIER_ADDR,
          lines: [...PANIER],
        })
        .expect(201),
    ).id;

    // La zone augmente ses frais APRÈS la commande — le cas réel.
    await ctx.prisma.deliveryZone.updateMany({
      where: { label: "Val d'Isère" },
      data: { feeValue: 3_500 },
    });

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: placed },
      select: { deliveryFeeCents: true, deliveryFeeAdjustment: true },
    });

    expect(order.deliveryFeeCents).toBe(2_000);
    // Le barème du JOUR, pas celui d'aujourd'hui : c'est toute la raison de la
    // colonne. Sans elle, il n'y aurait que le montant, et rien pour le nommer.
    expect(order.deliveryFeeAdjustment).toEqual({ mode: "amount", cents: 2_000 });
  });

  /**
   * 🔴 **Le barème en POURCENTAGE — le cas qui prouve qu'on fige au lieu de
   * refabriquer.**
   *
   * Un forfait se reconstruit à l'identique depuis son montant : le cas
   * ci-dessus passait même en remplaçant `zone.fee` par
   * `{ mode: "amount", cents: feeCents }`. Ici les deux phrases diffèrent — la
   * commande doit porter « 10 % », pas « 2,40 € », parce que c'est la première
   * qui s'écrit sur une facture.
   */
  it("🔴 fige un barème en POURCENTAGE, et non le montant qu'il produit", async () => {
    const placed = jsonBody<{ id: string }>(
      await ctx
        .asSub(BUYER)
        .post("/orders")
        .send({
          idempotencyKey: randomUUID(),
          companyId: null,
          requestedDeliveryDate: SERVICE_DAY,
          note: "",
          fulfillmentMethod: "delivery",
          deliveryAddress: PERCENT_ADDR,
          lines: [...PANIER],
        })
        .expect(201),
    ).id;

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: placed },
      select: { subtotalCents: true, deliveryFeeCents: true, deliveryFeeAdjustment: true },
    });

    // 10 % du sous-total, et le TAUX figé — pas le montant déguisé en forfait.
    expect(order.deliveryFeeCents).toBe(Math.round(order.subtotalCents * 0.1));
    expect(order.deliveryFeeAdjustment).toEqual({ mode: "percent", bp: 1_000 });
  });

  /** Un retrait n'a pas de frais de zone : aucun barème à figer. */
  it("laisse un retrait sans barème de zone", async () => {
    const placed = jsonBody<{ id: string }>(
      await ctx
        .asSub(BUYER)
        .post("/orders")
        .send({
          idempotencyKey: randomUUID(),
          companyId: null,
          requestedDeliveryDate: SERVICE_DAY,
          note: "",
          fulfillmentMethod: "pickup",
          pickupAddressId: pickupId,
          lines: [...PANIER],
        })
        .expect(201),
    ).id;

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: placed },
      select: { deliveryFeeCents: true, deliveryFeeAdjustment: true },
    });

    expect(order.deliveryFeeCents).toBe(0);
    expect(order.deliveryFeeAdjustment).toBeNull();
  });
});
