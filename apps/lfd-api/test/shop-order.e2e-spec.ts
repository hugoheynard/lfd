import { randomUUID } from "node:crypto";

import type { PlaceShopOrderPayload } from "@lfd/contracts";

import { PlaceShopOrderCommand } from "../src/b2b/orders/application/commands/place-shop-order.command.js";
import { PlaceShopOrderHandler } from "../src/b2b/orders/application/commands/place-shop-order.handler.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";

/**
 * E2E de la **commande sans compte** — plan
 * `documentation/b2b/plan-commande-sans-compte.md`, lot C.
 *
 * ## Ce que seule la base prouve
 *
 * - qu'un `User` **sans `auth0_sub`** s'écrit, c'est-à-dire que la migration du
 *   lot B est bien passée. Un test à Prisma stubbé tiendrait la colonne pour
 *   nullable en le croyant sur parole ;
 * - que `shop_order_idempotency` existe et que son index unique **arbitre** : le
 *   dispositif d'idempotence repose sur un refus de Postgres, pas sur une
 *   lecture — deux appels qui liraient d'abord trouveraient tous deux le
 *   registre vide ;
 * - que la commande produite est un `Order` ordinaire, `clientele = public`,
 *   avec son jeton de retrait — donc que la file du comptoir, le prévisionnel et
 *   le colisage la voient sans une ligne de changement (§2, lot D).
 *
 * ## 🔴 Pourquoi la surface HTTP n'est pas traversée
 *
 * **Parce qu'elle n'est pas ouverte, et que c'est la décision.**
 * `ShopOrdersController` n'est pas enregistré dans `OrdersModule` : la mise en
 * service dépend d'un arbitrage de prix et de fiscalité qui n'est pas technique
 * (§6), et il n'existe aucun drapeau pour la livrer éteinte — le niveau `shop`
 * est global, donc celui qui ouvre la boutique pro ouvrirait celle-ci.
 *
 * Cette suite éprouve donc **le tout sauf la porte**, en passant par le handler
 * tel que l'application le monte — vrais ports, vrai Prisma, vraies contraintes
 * — et vérifie en propre que la porte, elle, ne répond pas. Le jour de
 * l'ouverture, une ligne dans le module la branche, et un test ci-dessous
 * devient faux **bruyamment** : c'est ce qu'on veut d'un interrupteur.
 */

/**
 * Passerelle de paiement doublée : aucun appel réseau, et **une intention
 * distincte par appel**.
 *
 * Le compteur n'est pas de la coquetterie : `orders.stripe_payment_intent_id`
 * est unique en base, et un double qui rendrait deux fois le même identifiant
 * ferait échouer la seconde commande sur une contrainte que la production ne
 * rencontre jamais — Stripe crée une intention par appel. Un double qui se
 * répète ne joue pas le port qu'il prétend jouer.
 */
let intentSeq = 0;
const fakeGateway = {
  createIntent: () => {
    intentSeq += 1;
    const paymentIntentId = `pi_public_${String(intentSeq)}`;
    return Promise.resolve({ paymentIntentId, clientSecret: `${paymentIntentId}_secret` });
  },
  retrieveIntent: () =>
    Promise.resolve({ paymentIntentId: "pi_public_1", clientSecret: "pi_public_1_secret" }),
  publishableKey: () => "pk_public",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: PaymentGateway, value: fakeGateway }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  pickupId = await seedPickup();
});

/**
 * Le jour de service, **relatif** : l'heure limite de commande le compare à
 * l'horloge, donc une date en dur serait une bombe à retardement.
 */
const SERVICE_DAY = serviceDay();

let pickupId = "";

/** Le comptoir où l'on vient chercher. Le contrat exige un point explicite. */
async function seedPickup(): Promise<string> {
  const point = await ctx.prisma.pickupAddress.create({
    data: {
      label: "Labo",
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  return point.id;
}

function payload(over: Partial<PlaceShopOrderPayload> = {}): PlaceShopOrderPayload {
  return {
    idempotencyKey: randomUUID(),
    buyer: { firstName: "Camille", email: "camille@visiteur.fr", phone: "0600000000" },
    fulfillmentMethod: "pickup",
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddressId: pickupId,
    requestedDeliveryDate: SERVICE_DAY,
    note: "",
    lines: [{ sku: "VIE-001", quantity: 3 }],
    ...over,
  };
}

/** La passation, telle que la route l'appellerait le jour où elle sera ouverte. */
async function place(over: Partial<PlaceShopOrderPayload> = {}) {
  const result = await ctx.app
    .get(PlaceShopOrderHandler)
    .execute(new PlaceShopOrderCommand(payload(over)));
  // Le courriel de confirmation part hors requête : on l'attend avant de relire,
  // sinon il écrit après le `TRUNCATE` du test suivant.
  await ctx.drain();
  return result;
}

describe("la commande sans compte — la porte", () => {
  it("N'EST PAS OUVERTE, et c'est la décision", async () => {
    // §6 : ce plan se bâtit et s'éprouve, il ne se met pas en service. Le
    // contrôleur existe, écrit et marqué, mais il n'est pas enregistré — la
    // route n'a donc aucune existence à l'exécution.
    await ctx.http().post("/shop/orders").send({}).expect(404);
  });
});

describe("la commande sans compte — le porteur", () => {
  it("écrit une personne SANS identité de connexion", async () => {
    // Ce que la migration du lot B rend possible, et que seule la base prouve :
    // `auth0_sub` est nul, donc se connecter lui est inexprimable.
    const placed = await place();

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: placed.id },
      select: { placedByUserId: true, companyId: true, clientele: true, handoverToken: true },
    });
    const buyer = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: order.placedByUserId },
      select: { auth0Sub: true, email: true, firstName: true, status: true, emailVerified: true },
    });

    expect(buyer.auth0Sub).toBeNull();
    expect(buyer.email).toBe("camille@visiteur.fr");
    expect(buyer.firstName).toBe("Camille");
    // D1 : son statut vaut `active`. C'est le piège à garder sous les yeux — on
    // ne déduit jamais « peut se connecter » d'un statut.
    expect(buyer.status).toBe("active");
    expect(buyer.emailVerified).toBe(false);
  });

  it("donne au client de quoi être joint et de quoi retirer", async () => {
    // Le gain décisif de cette voie (§5) : sans `User`, le client public
    // n'aurait eu ni confirmation, ni QR — les deux envois sortaient en silence,
    // faute de destinataire. Le jeton de retrait, lui, est émis pour TOUTE
    // commande, et il n'y en a pas un second à inventer.
    const placed = await place();

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: placed.id },
      select: { handoverToken: true, placedBy: { select: { email: true } } },
    });

    expect(order.handoverToken).not.toBeNull();
    expect(order.placedBy.email).toBe("camille@visiteur.fr");
  });

  it("fait DEUX lignes pour deux visiteurs d'une même adresse", async () => {
    // D2, assumé : `email` n'a aucune unicité, et rapprocher deux commandes sur
    // la foi d'une adresse tapée au panier reviendrait à décider que le second
    // visiteur est le premier.
    const first = await place();
    const second = await place();

    const orders = await ctx.prisma.order.findMany({
      where: { id: { in: [first.id, second.id] } },
      select: { placedByUserId: true },
    });

    expect(new Set(orders.map((order) => order.placedByUserId)).size).toBe(2);
  });
});

describe("la commande sans compte — la commande produite", () => {
  it("est un Order ordinaire, PUBLIC et sans société", async () => {
    // Non négociable (§2) : la file du comptoir, le prévisionnel du fournil et
    // le colisage lisent tous `Order`. Une commande publique qui n'en serait pas
    // un obligerait à dupliquer le fournil entier.
    const placed = await place();

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: placed.id },
      select: { companyId: true, clientele: true, paymentStatus: true, placedByStaffId: true },
    });

    expect(order.companyId).toBeNull();
    expect(order.clientele).toBe("public");
    expect(order.placedByStaffId).toBeNull();
    // La carte, toujours : l'intention est créée, la commande attend son
    // règlement.
    expect(order.paymentStatus).toBe("pending");
  });

  it("rend de quoi payer, à la première passation", async () => {
    const placed = await place();

    // Champ par champ : `expect.any` et `expect.stringMatching` rendent de
    // l'`any`, que le lint refuse à juste titre — un doublé qui dérive du port
    // passerait sous un matcher qui accepte tout.
    expect(placed.payment?.publishableKey).toBe("pk_public");
    expect(placed.payment?.clientSecret).toMatch(/_secret$/u);
    expect(placed.payment?.amountCents).toBeGreaterThan(0);
  });
});

describe("la commande sans compte — l'idempotence, arbitrée par Postgres", () => {
  it("ne fait QU'UNE commande pour deux appels sous la même clé", async () => {
    // C'est l'index unique de `shop_order_idempotency` qui l'arbitre, pas une
    // lecture : deux appels qui liraient d'abord trouveraient tous deux le
    // registre vide et passeraient tous deux la commande.
    const key = randomUUID();

    const first = await place({ idempotencyKey: key });
    const replayed = await place({ idempotencyKey: key });

    expect(replayed.id).toBe(first.id);
    expect(replayed.orderNumber).toBe(first.orderNumber);
    expect(await ctx.prisma.order.count()).toBe(1);
    // Et un seul porteur : le rejeu n'inscrit personne de plus.
    expect(await ctx.prisma.user.count()).toBe(1);
  });

  it("🔴 ne rend AUCUN secret de paiement au rejeu", async () => {
    // La différence décisive avec le chemin connecté (§5, objection B4) :
    // `PlaceOrderHandler.replay()` redemande l'intention à Stripe et rend un
    // `clientSecret` VIVANT. Légitime derrière un jeton ; ici, la clé est
    // choisie par le client, donc devinable, et rien n'atteste qui la présente.
    //
    // Conséquence assumée (D4) : un règlement interrompu perd le PAIEMENT, pas
    // la COMMANDE.
    const key = randomUUID();
    await place({ idempotencyKey: key });

    const replayed = await place({ idempotencyKey: key });

    expect(replayed.payment).toBeUndefined();
  });

  it("REFUSE la même clé sur un panier différent", async () => {
    // Sans ce refus, une correction renverrait l'ancienne commande, et le front
    // viderait le panier corrigé en silence — une divergence sans erreur levée.
    const key = randomUUID();
    await place({ idempotencyKey: key });

    await expect(
      place({ idempotencyKey: key, lines: [{ sku: "VIE-001", quantity: 8 }] }),
    ).rejects.toThrow();
    expect(await ctx.prisma.order.count()).toBe(1);
  });

  it("REND la clé quand la commande échoue avant d'être écrite", async () => {
    // Un SKU inconnu tombe avant la persistance : le client doit pouvoir
    // corriger et renvoyer sous la même clé, sans être bloqué par le mécanisme
    // censé le protéger.
    const key = randomUUID();

    await expect(
      place({ idempotencyKey: key, lines: [{ sku: "INCONNU-404", quantity: 1 }] }),
    ).rejects.toThrow();
    expect(await ctx.prisma.shopOrderIdempotency.count()).toBe(0);

    const retried = await place({ idempotencyKey: key });

    expect(retried.id).toBeTruthy();
  });
});
