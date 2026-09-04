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
  retrieveIntent: (id: string) => Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_s` }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
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
  const point = await ctx.prisma.pickupAddress.create({
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

/** Une règle d'heure limite, écrite directement (table de réglage, pas d'agrégat). */
async function seedCutoff(rule: {
  pickupAddressId?: string | null;
  weekday?: string | null;
  daysBefore: number;
  time: string;
  graceMinutes?: number;
}): Promise<void> {
  await ctx.prisma.orderCutoff.create({
    data: {
      pickupAddressId: rule.pickupAddressId ?? null,
      weekday: rule.weekday ?? null,
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
    pickupAddressId: pickupId,
    fulfillmentMethod: "pickup",
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
   * La règle qui s'applique est celle du point **effectivement retenu**. Ça ne
   * se voit qu'ici : le handler reçoit un `pickupAddressId`, mais c'est le
   * repository qui décide quel point sert, et opposer la règle du défaut
   * plateforme serait un refus faux.
   */
  it("oppose la règle du point retenu plutôt que le défaut plateforme", async () => {
    // Le défaut laisserait passer (limite dans 29 jours) ; le point, non.
    await seedCutoff({ daysBefore: 1, time: "00:01" });
    await seedCutoff({ pickupAddressId: pickupId, daysBefore: 60, time: "23:59" });

    const response = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: serviceDay(30) }))
      .expect(409);

    expect(response.body).toMatchObject({ code: "orders.cutoff.past" });
    expect(await orderCount()).toBe(0);
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
   * 🔴 L'article **remplace** la règle du commerce, il ne se contente pas de la
   * resserrer. Sans ça, le rang `produit` ne pourrait jamais déclarer un article
   * commandable plus tard que le reste — l'usage même pour lequel il existe.
   */
  it("laisse passer sur la limite de l'article, là où le commerce refuserait", async () => {
    // Le commerce a fermé (limite hier) ; l'article, lui, ferme dans 30 jours.
    await seedCutoff({ daysBefore: 1, time: "00:01" });
    await seedArticleLimit("VIE-001", { daysBefore: 0, time: "23:59", graceMinutes: 0 });

    await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order({ requestedDeliveryDate: serviceDay(0) }))
      .expect(201);

    expect(await orderCount()).toBe(1);
  });

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
