import { randomUUID } from "node:crypto";
/**
 * E2E de l'**heure limite de commande** — la règle enfin opposée.
 *
 * Ce que seul le vrai SQL prouve, et qu'un test de garde ne peut pas :
 * - la règle est **lue en base** au moment de commander, pas semée dans un
 *   double : jusqu'au 2026-09-04, `resolveOrderCutoff` n'était appelé nulle
 *   part et l'écran de réglages promettait une limite que rien ne tenait ;
 * - le refus mord au niveau **HTTP**, en 409, et **n'écrit rien** ;
 * - la règle du **point retenu** l'emporte sur le défaut plateforme — y compris
 *   quand le client n'a pas choisi de point et hérite du point par défaut.
 *
 * Deux frontières doublées : la signature du jeton (staff comme client) et la
 * passerelle Stripe. Le reste — guard, bus, domaine, SQL — est réel.
 */
import { addDays, instantToLocal, type BillingAddressPayload } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { anActiveFiche, relayAll } from "./catalog-facts-scene.js";
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const MEMBER = "auth0|membre";
const STAFF = "staff-e2e";

const LABO: BillingAddressPayload = {
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

const fakeGateway = {
  createIntent: () => Promise.resolve({ paymentIntentId: "pi_cut", clientSecret: "pi_cut_secret" }),
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_s`,
      state: "awaiting_payment" as const,
    }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: STAFF, scopes: [] }),
};

let ctx: E2eContext;
let pickupId = "pickup_absent";
let companyId = "";
let buyerId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: PaymentGateway, value: fakeGateway },
      { token: AdminTokenVerifier, value: stubAdminVerifier },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  // Ces cas parlent de l'heure limite, et en éprouvent plusieurs sur
  // AUJOURD'HUI : le jour même est ouvert, sans quoi le réglage du jour même
  // (fermé par défaut depuis le lot O3, §8.3) refuserait avant elle.
  await ctx
    .asSub(STAFF)
    .patch("/admin/order-cutoff-settings")
    .send({ sameDayAllowed: true })
    .expect(204);
  const point = await ctx.prisma.site.create({
    data: { ...LABO, isDefault: true },
    select: { id: true },
  });
  pickupId = point.id;
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER, email: "membre@test.fr" });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  companyId = company.id;
  buyerId = member.id;
});

/** La règle générale, écrite directement (la seule depuis le 2026-10-21). */
async function seedCutoff(rule: {
  daysBefore: number;
  time: string;
  graceMinutes?: number;
}): Promise<void> {
  await ctx.prisma.orderCutoff.create({
    data: {
      pickupAddressId: null,
      weekday: null,
      daysBefore: rule.daysBefore,
      time: rule.time,
      graceMinutes: rule.graceMinutes ?? 0,
    },
  });
}

/**
 * Sème une règle dont la limite **est tombée il y a `minutesAgo`**, et rend le
 * jour d'acheminement à demander pour qu'elle s'applique.
 *
 * 🔴 Écrire `{ daysBefore: 0, time: "00:00", graceMinutes: 720 }` en pensant
 * « la limite est passée, le rattrapage court » marche — jusqu'à midi. Après, la
 * fenêtre est close et le test rougit sans qu'une ligne ait bougé. Un rattrapage
 * se compte en minutes ; le borner avec une heure de pendule et un nombre de
 * jours le rend dépendant de l'heure à laquelle la suite tourne.
 *
 * On part donc de l'instant voulu et on le traduit en règle, jamais l'inverse :
 * `instantToLocal` donne le jour et l'heure de PARIS de cette limite, et
 * l'acheminement est calé deux jours plus loin pour rester dans le futur quelle
 * que soit l'heure.
 */
const LIMIT_DAYS_BEFORE = 2;

async function seedCutoffPassedBy(minutesAgo: number, graceMinutes: number): Promise<string> {
  const limit = instantToLocal(new Date(Date.now() - minutesAgo * 60_000));
  await seedCutoff({ daysBefore: LIMIT_DAYS_BEFORE, time: limit.time, graceMinutes });
  return addDays(limit.day, LIMIT_DAYS_BEFORE);
}

function order(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    companyId,
    idempotencyKey: randomUUID(),
    salesTerms: null,
    pickupAddressId: pickupId,
    fulfillmentMethod: "pickup",
    // Pas de commande sans créneau (2026-10-14).
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001", quantity: 3 }],
    ...over,
  };
}

async function orderCount(): Promise<number> {
  return ctx.prisma.order.count();
}

describe("l'heure limite est opposée au client", () => {
  /**
   * **Régression : la règle existait et personne ne l'appliquait.**
   *
   * `resolveOrderCutoff` et `orderCutoffInstant` étaient testés unitairement
   * depuis leur écriture, et appelés nulle part — vérifié sur tout le dépôt le
   * 2026-09-04. Ce test-ci échoue tant que la garde n'est pas branchée.
   */
  it("refuse en 409 une commande dont la limite est passée, sans rien écrire", async () => {
    // Limite : la veille du service, à 00:01. Pour un service AUJOURD'HUI, elle
    // est donc franchie quelle que soit l'heure à laquelle la suite tourne.
    await seedCutoff({ daysBefore: 1, time: "00:01" });

    const response = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: serviceDay(0) }))
      .expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.past" });
    expect(await orderCount()).toBe(0);
  });

  it("laisse passer quand la limite est encore devant", async () => {
    await seedCutoff({ daysBefore: 1, time: "00:01" });

    await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: serviceDay(30) }))
      .expect(201);

    expect(await orderCount()).toBe(1);
  });

  /**
   * Le défaut volontaire du contrat : une plateforme qui n'a rien configuré ne
   * refuse rien. C'est ce qui rend le branchement invisible pour l'existant —
   * et c'est le comportement de toutes les autres suites e2e, qui ne sèment
   * aucune règle.
   */
  it("ne refuse rien quand aucune règle n'est configurée", async () => {
    await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: serviceDay(0) }))
      .expect(201);
  });

  /**
   * La passation SANS COMPTE (`POST /shop/orders`) passe par la même
   * composition (`OrderDrafting`) : aucun e2e ne le prouvait jusqu'au
   * 2026-10-26, et la boutique bloque désormais le règlement d'un jour qui
   * n'est plus possible en comptant sur ce refus-là.
   */
  it("refuse aussi une commande sans compte dont la limite est passée, sans rien écrire", async () => {
    await seedCutoff({ daysBefore: 1, time: "00:01" });

    const response = await ctx
      .http()
      .post("/shop/orders")
      .send({
        idempotencyKey: randomUUID(),
        salesTerms: null,
        buyer: { firstName: "Camille", email: "camille@visiteur.fr", phone: "0600000000" },
        fulfillmentMethod: "pickup",
        requestedWindow: { start: "07:00", end: "08:00" },
        deliveryAddress: null,
        deliveryAddressId: null,
        pickupAddressId: pickupId,
        requestedDeliveryDate: serviceDay(0),
        note: "",
        lines: [{ sku: "VIE-001", quantity: 3 }],
      })
      .expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.past" });
    expect(await orderCount()).toBe(0);
  });

  /**
   * Décision de Hugo du 2026-10-21 (schéma des réglages §4, point 4) : les
   * règles par point × jour sont retirées. La base les refuse désormais
   * (CHECK `order_cutoffs_general_only`), et n'en tient qu'une
   * (`order_cutoffs_single_rule`) — le second barreau, sous le domaine.
   */
  it("la base refuse une règle par point ou par jour, et une seconde règle générale", async () => {
    await seedCutoff({ daysBefore: 1, time: "00:01" });

    await expect(
      ctx.prisma.orderCutoff.create({
        data: { pickupAddressId: pickupId, daysBefore: 60, time: "23:59" },
      }),
    ).rejects.toThrow(/order_cutoffs_general_only/u);
    await expect(
      ctx.prisma.orderCutoff.create({ data: { weekday: "mon", daysBefore: 1, time: "18:00" } }),
    ).rejects.toThrow(/order_cutoffs_general_only/u);
    await expect(
      ctx.prisma.orderCutoff.create({ data: { daysBefore: 1, time: "18:00" } }),
    ).rejects.toThrow();
    expect(await ctx.prisma.orderCutoff.count()).toBe(1);
  });
});

describe("le rattrapage, quand il est réglé", () => {
  /**
   * La fenêtre de grâce est un **refus différent**, pas un passage. Ce que seul
   * l'e2e prouve : le code voyage jusqu'au client sous la bonne forme, et rien
   * n'est écrit — un rattrapage qui laisserait une commande en base serait pire
   * qu'une absence de rattrapage.
   */
  it("refuse en `orders.cutoff.grace` dans la fenêtre, sans rien écrire", async () => {
    // Limite passée il y a 10 min, rattrapage de 45 : on est dedans, à toute heure.
    const day = await seedCutoffPassedBy(10, 45);

    const response = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: day }))
      .expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.grace" });
    expect(await orderCount()).toBe(0);
  });

  it("redevient `orders.cutoff.past` une fois le rattrapage écoulé", async () => {
    // Même limite, mais un rattrapage de 5 min : il est écoulé depuis 5 min.
    const day = await seedCutoffPassedBy(10, 5);

    const response = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: day }))
      .expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.past" });
  });
});

/**
 * Sème la limite que le RÉFÉRENTIEL a résolue pour un article, telle que le fil
 * la dépose sur le miroir. Les trois colonnes vont ensemble.
 *
 * ⚠️ **Elle écrit le miroir en direct, elle ne passe pas par le fil.** C'est
 * assumé : le sujet de ces cas est la GARDE, et pousser un snapshot complet
 * remplacerait le catalogue semé par le harnais — dont ces mêmes tests lisent
 * les prix. Ce que le fil dépose est éprouvé ailleurs
 * (`catalog-ingest-facts.e2e-spec.ts`), et la couture entre les deux moitiés
 * l'est ci-dessous, par le seul cas qui parte vraiment d'une règle.
 *
 * ⚠️ Le miroir stocke le SKU de la **déclinaison** (`VIE-001-1`), que le PIM
 * dérive de celui du produit ; c'est sous le SKU **produit** que l'adaptateur la
 * présente au checkout. Le paramètre est donc celui qu'une commande porte, et la
 * dérivation se fait ici — l'écrire à l'envers ferait chercher une ligne qui
 * n'existe pas, ce qui est exactement ce qui est arrivé en écrivant ce test.
 */
async function seedArticleLimit(
  orderSku: string,
  limit: { daysBefore: number; time: string; graceMinutes: number } | null,
): Promise<void> {
  await ctx.prisma.catalogItem.update({
    where: { sku: `${orderSku}-1` },
    data: {
      orderLimitDaysBefore: limit?.daysBefore ?? null,
      orderLimitTime: limit?.time ?? null,
      orderLimitGraceMinutes: limit?.graceMinutes ?? null,
    },
  });
}

describe("la limite portée par l'ARTICLE, reçue du référentiel", () => {
  /**
   * 🔴 **La couture, de bout en bout : une RÈGLE refuse une commande.**
   *
   * Le seul cas du dépôt qui parte d'une règle du référentiel et finisse sur un
   * refus au checkout. Entre les deux : la v7 du fil, la descente d'échelle côté
   * plateforme, trois colonnes du miroir, un lecteur Prisma, un port et la
   * garde. Chaque moitié a ses tests ; c'est leur JONCTION que rien ne tenait,
   * et c'est exactement là qu'une v7 se casse — un identifiant de déclinaison
   * qui ne correspond à rien, une règle rangée sous un rang qui ne vise pas.
   *
   * Depuis X1 (2026-10-17, `catalogue-synchronise.md` §6), la règle et la
   * fiche voyagent en FAITS, plus par le push : la règle est posée au
   * référentiel, la fiche y est activée, et la boîte d'envoi les livre.
   */
  it("refuse une commande à partir d'une règle posée au référentiel", async () => {
    // La limite du PRODUIT (seule portée depuis le 2026-10-21). Quatorze
    // jours, le plus long préavis que le référentiel accepte, pour une remise
    // dans dix.
    const fiche = await anActiveFiche(() => ctx.asSub(STAFF), "Croissant du fil");
    await ctx
      .asSub(STAFF)
      .put("/pim/order-time-limits")
      .send({ scope: { type: "product", id: fiche.id }, daysBefore: 14, time: "23:59" })
      .expect(200);
    await relayAll(ctx);
    await ctx
      .asSub(STAFF)
      .post("/admin/catalog/review/approve")
      .send({ skus: [fiche.variantSku], audiences: ["pro", "public"] })
      .expect(204);

    const response = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(
        order({ requestedDeliveryDate: serviceDay(10), lines: [{ sku: fiche.sku, quantity: 1 }] }),
      )
      .expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.past" });
    expect(await orderCount()).toBe(0);
  });

  /**
   * Ce que seul l'e2e prouve : les trois colonnes du miroir arrivent jusqu'à la
   * garde. Entre les deux il y a un lecteur Prisma, un port, un service de
   * composition et un handler — chacun typé, aucun éprouvé ensemble.
   */
  it("refuse sur la limite de l'article, là où la règle du commerce laisserait passer", async () => {
    // Le commerce ferme la veille à 00:01 : pour une remise dans 30 jours, il
    // reste 29 jours. L'article, lui, demande 60 jours de préavis.
    await seedCutoff({ daysBefore: 1, time: "00:01" });
    await seedArticleLimit("VIE-001", { daysBefore: 60, time: "23:59", graceMinutes: 0 });

    const response = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: serviceDay(30) }))
      .expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.past" });
    expect(await orderCount()).toBe(0);
  });

  /**
   * Régression (2026-10-21) : la limite de l'article REMPLAÇAIT la règle du
   * commerce, et une limite plus tardive la relâchait — une limite posée au rang
   * global du référentiel aurait neutralisé l'heure limite générale. Décision de
   * Hugo : la plus stricte gagne TOUJOURS.
   */
  it("une limite d'article plus tardive ne relâche pas l'heure limite générale", async () => {
    // Le commerce a fermé (limite hier) ; l'article, lui, ferme ce soir.
    await seedCutoff({ daysBefore: 1, time: "00:01" });
    await seedArticleLimit("VIE-001", { daysBefore: 0, time: "23:59", graceMinutes: 0 });

    const response = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: serviceDay(0) }))
      .expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.past" });
    expect(await orderCount()).toBe(0);
  });

  // « heure limite générale désactivée : seule la limite de l'article compte »
  // est retiré avec l'interrupteur le 2026-10-21 (`plan-une-seule-heure.md` §5) ;
  // qu'une ligne résiduelle ne coupe plus rien est éprouvé dans
  // `order-cutoff-switch.e2e-spec.ts`.

  it("retombe sur la règle du commerce quand l'article ne déclare rien", async () => {
    await seedCutoff({ daysBefore: 1, time: "00:01" });
    await seedArticleLimit("VIE-001", null);

    const response = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: serviceDay(0) }))
      .expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.past" });
  });

  /**
   * **Le panier ferme quand sa ligne la plus urgente ferme.** Une ligne encore
   * ouverte ne sauve pas les autres : un panier ne se découpe pas.
   */
  it("prend la ligne la plus fermée d'un panier mixte", async () => {
    await seedArticleLimit("VIE-001", { daysBefore: 0, time: "23:59", graceMinutes: 0 });
    await seedArticleLimit("VIE-002", { daysBefore: 60, time: "23:59", graceMinutes: 0 });

    const response = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(
        order({
          requestedDeliveryDate: serviceDay(30),
          lines: [
            { sku: "VIE-001", quantity: 1 },
            { sku: "VIE-002", quantity: 1 },
          ],
        }),
      )
      .expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.past" });
    expect(await orderCount()).toBe(0);
  });
});

/** Accorde une dérogation par la route staff, comme le ferait le back-office. */
async function grantWaiver(day: string, reason = "Client bloqué en tournée"): Promise<string> {
  const response = await ctx
    .asSub(STAFF)
    .post("/admin/order-cutoff-waivers")
    .send({ companyId, fulfillmentDate: day, reason })
    .expect(201);
  return (response.body as { id: string }).id;
}

/** Règle la surtaxe de commande tardive, comme le ferait l'écran de réglages. */
async function setLateFee(cents: number, vatRatePercent: number): Promise<void> {
  await ctx
    .asSub(STAFF)
    .put("/admin/order-late-fee")
    .send({ fee: { mode: "amount", cents }, vatRatePercent })
    .expect(204);
}

describe("la surtaxe de commande tardive", () => {
  /**
   * Ce que seul l'e2e prouve : le réglage posé par une route, la dérogation
   * accordée par une autre et la commande passée par une troisième se
   * rejoignent en base, avec le bon total. Entre les trois il y a un agrégat,
   * deux ports et un moteur de TVA — chacun typé, aucun éprouvé ensemble.
   */
  it("facture la surtaxe quand une dérogation a laissé passer, TVA comprise", async () => {
    await setLateFee(500, 20);
    const day = await seedCutoffPassedBy(10, 45);
    await grantWaiver(day);

    const response = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: day, lines: [{ sku: "VIE-001", quantity: 3 }] }))
      .expect(201);

    const placed = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: (response.body as { id: string }).id },
    });
    expect(placed.lateFeeCents).toBe(500);
    // L'ajustement ET son taux, figés : un montant sans son taux ne se justifie
    // pas devant un comptable, et il ne se recalcule pas.
    expect(placed.lateFeeAdjustment).toMatchObject({
      adjustment: { mode: "amount", cents: 500 },
      vatRatePercent: 20,
    });
    // Croissant 200 c × 3 = 600 HT, TVA 5,5 % = 33 ; surtaxe 500 à 20 % = 100.
    expect(placed.subtotalCents).toBe(600);
    expect(placed.vatCents).toBe(133);
    expect(placed.totalCents).toBe(600 + 500 + 133);
  });

  /**
   * La surtaxe est **lisible** par le client, pas seulement écrite en base.
   *
   * Elle a vécu deux jours facturée et invisible : le total montait de 5 €, et
   * le récapitulatif n'avait aucune ligne pour le dire. Un montant qu'on ne
   * peut pas justifier à l'écran est un appel au support, pas une facture.
   */
  it("rend la surtaxe et sa trace figée sur la vue de la commande", async () => {
    await setLateFee(500, 20);
    const day = await seedCutoffPassedBy(10, 45);
    await grantWaiver(day);

    const created = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: day, lines: [{ sku: "VIE-001", quantity: 3 }] }))
      .expect(201);

    const view = await ctx
      .asSub(MEMBER)
      .get(`/orders/${(created.body as { id: string }).id}`)
      .expect(200);

    expect(view.body).toMatchObject({
      lateFeeCents: 500,
      lateFeeAdjustment: {
        adjustment: { mode: "amount", cents: 500 },
        vatRatePercent: 20,
      },
      totalCents: 600 + 500 + 133,
    });
  });

  /**
   * 🔴 **Une commande à l'heure ne paie rien**, réglage ou pas. C'est le retard
   * qu'on facture, pas le panier.
   */
  it("ne facture rien à une commande arrivée à l'heure", async () => {
    await setLateFee(500, 20);

    const response = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: serviceDay(30) }))
      .expect(201);

    const placed = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: (response.body as { id: string }).id },
    });
    expect(placed.lateFeeCents).toBe(0);
    expect(placed.lateFeeAdjustment).toBeNull();
  });

  /**
   * Aucun réglage = rattraper **gratuitement**, et c'est un choix valable. Un
   * montant par défaut aurait facturé une décision que personne n'a prise.
   */
  it("laisse passer sans rien facturer quand aucune surtaxe n'est réglée", async () => {
    const day = await seedCutoffPassedBy(10, 45);
    await grantWaiver(day);

    const response = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: day }))
      .expect(201);

    const placed = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: (response.body as { id: string }).id },
    });
    expect(placed.lateFeeCents).toBe(0);
  });

  it("se retire, et les dérogations redeviennent gratuites", async () => {
    await setLateFee(500, 20);
    await ctx.asSub(STAFF).delete("/admin/order-late-fee").expect(204);

    const day = await seedCutoffPassedBy(10, 45);
    await grantWaiver(day);
    const response = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: day }))
      .expect(201);

    const placed = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: (response.body as { id: string }).id },
    });
    expect(placed.lateFeeCents).toBe(0);
  });

  /**
   * Le taux n'a **pas** de valeur par défaut : le réglage est refusé sans lui
   * plutôt que d'inventer 20 % ou 5,5 %, qui se factureraient rétroactivement
   * sur toutes les commandes tardives.
   */
  it("refuse un réglage sans taux de TVA", async () => {
    await ctx
      .asSub(STAFF)
      .put("/admin/order-late-fee")
      .send({ fee: { mode: "amount", cents: 500 } })
      .expect(400);
  });
});

describe("la dérogation, seul chemin de sortie", () => {
  /**
   * 🔴 **L'exemption du back-office est tombée**, et c'est le sens de ce lot.
   *
   * Elle a existé faute de mécanisme : l'équipe passait sans motif, sans auteur
   * et sans trace, et rien ne distinguait une décision d'un oubli. Ce test
   * disait l'inverse jusqu'au 2026-09-04 — il a changé de sens, comme annoncé.
   */
  it("refuse une saisie du back-office sans dérogation, comme n'importe qui", async () => {
    const day = await seedCutoffPassedBy(10, 45);

    const response = await ctx
      .asSub(STAFF)
      .post("/admin/orders")
      .send({
        companyId,
        buyerUserId: buyerId,
        settlement: "link",
        requestedDeliveryDate: day,
        fulfillmentMethod: "pickup",
        pickupAddressId: pickupId,
        // ⚠️ La tranche est obligatoire sur cette route depuis le 2026-09-11
        // (`hasWindowWhenPickedUp`). Sans elle, ce cas recevrait 400 et
        // prouverait la VALIDATION au lieu de l'heure limite — un test qui passe
        // en ayant changé de sujet est pire qu'un test rouge.
        requestedWindow: { start: "07:00", end: "08:00" },
        lines: [{ sku: "VIE-001", quantity: 12 }],
      })
      .expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.grace" });
    expect(await orderCount()).toBe(0);
  });

  /**
   * Ce que seul l'e2e prouve : la dérogation accordée par une route et la
   * commande passée par une AUTRE se rejoignent en base. Entre les deux il y a
   * deux contrôleurs, deux bus et deux ports — chacun typé, aucun éprouvé
   * ensemble.
   */
  it("laisse passer le CLIENT lui-même une fois la dérogation accordée", async () => {
    const day = await seedCutoffPassedBy(10, 45);
    const waiverId = await grantWaiver(day);

    await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: day }))
      .expect(201);

    // Consommée, pas supprimée : elle atteste ce qu'elle a laissé passer.
    const waiver = await ctx.prisma.orderCutoffWaiver.findUniqueOrThrow({
      where: { id: waiverId },
    });
    expect(waiver.usedByOrderId).not.toBeNull();
    expect(waiver.usedAt).not.toBeNull();
  });

  /**
   * **Une décision, une commande.** Sans ça, une seule dérogation couvrirait
   * toute la journée d'un client — ce qui est une dispense, pas une exception.
   */
  it("ne rouvre rien une fois consommée", async () => {
    const day = await seedCutoffPassedBy(10, 45);
    await grantWaiver(day);

    await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: day }))
      .expect(201);

    const response = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: day }))
      .expect(409);
    expect(response.body).toMatchObject({ code: "orders.cutoff.grace" });
    expect(await orderCount()).toBe(1);
  });

  /**
   * 🔴 **Une dérogation n'ouvre QUE la grâce.** Après le rattrapage, personne ne
   * passe — et ce n'est pas une vérification : la garde ne consulte une
   * autorisation que dans l'état `grace`.
   */
  it("n'ouvre rien une fois le rattrapage écoulé", async () => {
    const day = await seedCutoffPassedBy(10, 5);
    await grantWaiver(day);

    const response = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: day }))
      .expect(409);
    expect(response.body).toMatchObject({ code: "orders.cutoff.past" });
    expect(await orderCount()).toBe(0);
  });

  it("refuse une seconde autorisation ouverte pour le même client et le même jour", async () => {
    const day = await seedCutoffPassedBy(10, 45);
    await grantWaiver(day);

    const response = await ctx
      .asSub(STAFF)
      .post("/admin/order-cutoff-waivers")
      .send({ companyId, fulfillmentDate: day, reason: "Une seconde fois" })
      .expect(409);
    expect(response.body).toMatchObject({ code: "orders.waiver.already_open" });
  });

  it("refuse une dérogation sans motif réel", async () => {
    await ctx
      .asSub(STAFF)
      .post("/admin/order-cutoff-waivers")
      .send({ companyId, fulfillmentDate: serviceDay(0), reason: "ok" })
      .expect(400);
  });

  /**
   * Retirer ce qui n'a pas servi, oui. Ce qui a servi, non : la dérogation
   * atteste ce qui s'est passé, et une commande passée ne se dépasse pas.
   */
  it("retire une dérogation inutilisée, jamais une consommée", async () => {
    const day = await seedCutoffPassedBy(10, 45);
    const first = await grantWaiver(day);
    await ctx.asSub(STAFF).delete(`/admin/order-cutoff-waivers/${first}`).expect(204);

    const second = await grantWaiver(day);
    await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: day }))
      .expect(201);
    await ctx.asSub(STAFF).delete(`/admin/order-cutoff-waivers/${second}`).expect(404);
  });
});

describe("la règle générale, seule ressource de l'écran", () => {
  it("se pose, se relit, se règle — et chaque geste est au journal", async () => {
    await ctx.asSub(STAFF).get("/admin/order-cutoffs/general").expect(200, { rule: null });

    const rule = { daysBefore: 1, time: "17:00", graceMinutes: 30 };
    await ctx.asSub(STAFF).put("/admin/order-cutoffs/general").send(rule).expect(204);
    await ctx
      .asSub(STAFF)
      .put("/admin/order-cutoffs/general")
      .send({ ...rule, time: "23:00" })
      .expect(204);

    const read = await ctx.asSub(STAFF).get("/admin/order-cutoffs/general").expect(200);
    const { rule: stored } = read.body as { rule: { id: string } };
    expect(stored).toEqual({
      id: stored.id,
      pickupAddressId: null,
      pickupLabel: null,
      weekday: null,
      daysBefore: 1,
      time: "23:00",
      graceMinutes: 30,
    });
    expect(await ctx.prisma.orderCutoff.count()).toBe(1);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: stored.id },
      orderBy: { id: "asc" },
      select: { type: true, payload: true },
    });
    const general = { pickupAddress: null, weekday: null, daysBefore: 1, graceMinutes: 30 };
    expect(facts).toEqual([
      { type: "order_cutoff.created", payload: { ...general, time: "17:00" } },
      { type: "order_cutoff.updated", payload: { ...general, time: "23:00" } },
    ]);
  });

  /** 2026-10-21 : plus de règle par point ou par jour — refus nommé, rien d'écrit. */
  it("refuse un point ou un jour en 400, avec le geste qui reste", async () => {
    const base = { daysBefore: 1, time: "17:00", graceMinutes: 0 };
    for (const scope of [{ pickupAddressId: pickupId }, { weekday: "mon" }]) {
      const response = await ctx
        .asSub(STAFF)
        .put("/admin/order-cutoffs/general")
        .send({ ...base, ...scope })
        .expect(400);
      expect(response.body).toMatchObject({ code: "order_cutoffs.scope_retired" });
    }
    expect(await ctx.prisma.orderCutoff.count()).toBe(0);
  });

  it("n'offre plus les routes de collection", async () => {
    await ctx.asSub(STAFF).get("/admin/order-cutoffs").expect(404);
    await ctx
      .asSub(STAFF)
      .post("/admin/order-cutoffs")
      .send({ daysBefore: 1, time: "17:00" })
      .expect(404);
  });
});
