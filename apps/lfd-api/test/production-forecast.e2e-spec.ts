import { randomUUID } from "node:crypto";
/**
 * E2E du **prévisionnel** — la matrice `produits × jours` du fournil.
 *
 * Deux choses s'y prouvent, et aucune ne se prouve sans vrai SQL :
 *
 * 1. une plage rend **une colonne par jour** et **une quantité par colonne**,
 *    trous compris — l'alignement de l'écran en dépend ;
 * 2. 🔴 une journée **close** garde son chiffre. À la clôture, les commandes
 *    quittent `placed` ; une lecture qui n'irait chercher que la demande
 *    ouverte afficherait zéro pour la journée du jour **tous les matins**,
 *    c'est-à-dire le contraire de ce que cet écran existe pour montrer.
 *
 * Le second cas est un test de non-régression écrit AVANT le bug : les deux
 * sources vivent dans deux schémas Postgres différents, et rien d'autre qu'un
 * aller-retour complet ne peut dire qu'elles se recollent.
 */
import { addDays, localToInstant, type ProductionForecastView } from "@lfd/contracts";

import { CustomerRole } from "../src/platform/database/client/client.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { settleCardPayments } from "./card-payments.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const MEMBER = "auth0|member";

/** Trois jours consécutifs à venir — la plage que l'écran ouvre. */
const DAY_1 = serviceDay(7);
const DAY_2 = serviceDay(8);
const DAY_3 = serviceDay(9);

const SITE = {
  label: "Boutique",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Signature du jeton staff doublée : le reste du mur admin est réel. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

/**
 * La passerelle de paiement, doublée. Un identifiant NEUF à chaque appel :
 * `orders.stripe_payment_intent_id` est `@unique`, et cette suite place
 * plusieurs commandes — un doublé à valeur constante ferait échouer la seconde
 * sur une contrainte qui n'a rien à voir avec ce qu'on éprouve ici.
 */
let intentCount = 0;
/** Les intentions émises et pas encore réglées — vidées par `settleCardPayments`. */
const issuedIntents: string[] = [];
const fakeGateway = {
  createIntent: () => {
    intentCount += 1;
    const id = `pi_e2e_forecast_${String(intentCount)}`;
    issuedIntents.push(id);
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;

/** L'horloge, fixée à maintenant à chaque cas — l'état d'une journée dépend de l'heure (A3). */
const clock = new FixedClock(new Date());

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
      { token: Clock, value: clock },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  clock.set(new Date());
  await ctx.reset();
});

/** L'instant de la maison `time` le jour `day`. */
function houseInstant(day: string, time: string): Date {
  const instant = localToInstant(day, time);
  if (instant === null) {
    throw new TypeError(`heure locale inexistante : ${day} ${time}`);
  }
  return instant;
}

/** Une société active, son membre, et la zone qui rend l'adresse livrable. */
async function seedSociete(): Promise<string> {
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const company = await createCompany(ctx.prisma, { status: "active" });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
  });
  return company.id;
}

async function placeOrder(
  companyId: string,
  day: string,
  lines: readonly { sku: string; quantity: number }[],
): Promise<void> {
  await ctx
    .asSub(MEMBER)
    .post(`/orders`)
    .send({
      idempotencyKey: randomUUID(),
      companyId,
      requestedDeliveryDate: day,
      fulfillmentMethod: "delivery",
      requestedWindow: { start: null, end: "10:00" },
      deliveryAddress: SITE,
      note: "",
      lines,
    })
    .expect(201);
  // Un règlement en vol ne produit plus, pro compris (D2, 2026-09-22) : la
  // commande qu'on veut voir au prévisionnel est payée, comme par un vrai client.
  await settleCardPayments(ctx, issuedIntents);
}

async function forecast(from: string, to: string): Promise<ProductionForecastView> {
  const response = await ctx
    .asSub("staff-e2e")
    .get(`/admin/production/forecast?from=${from}&to=${to}`)
    .expect(200);
  return jsonBody<ProductionForecastView>(response);
}

describe("le prévisionnel du fournil", () => {
  it("rend une colonne par jour et une quantité par colonne, trous compris", async () => {
    const companyId = await seedSociete();
    await placeOrder(companyId, DAY_1, [{ sku: "VIE-001", quantity: 2 }]);
    await placeOrder(companyId, DAY_3, [{ sku: "VIE-001", quantity: 5 }]);

    const view = await forecast(DAY_1, DAY_3);

    expect(view.days.map((day) => day.date)).toEqual([DAY_1, DAY_2, DAY_3]);
    expect(view.days.map((day) => day.totalUnits)).toEqual([2, 0, 5]);
    // Le nombre de COMMANDES, à côté des pièces : 1 240 en 12 commandes et
    // 1 240 en 90 ne se préparent pas de la même façon.
    expect(view.days.map((day) => day.orderCount)).toEqual([1, 0, 1]);
    expect(view.days.every((day) => !day.closed)).toBe(true);
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]?.sku).toBe("VIE-001");
    expect(view.lines[0]?.quantities).toEqual([2, 0, 5]);
    expect(view.lines[0]?.totalUnits).toBe(7);
    expect(view.peakDate).toBe(DAY_3);
    expect(view.totalUnits).toBe(7);
  });

  it("somme plusieurs commandes d'un même jour sur une seule ligne", async () => {
    const companyId = await seedSociete();
    await placeOrder(companyId, DAY_1, [{ sku: "VIE-001", quantity: 3 }]);
    await placeOrder(companyId, DAY_1, [{ sku: "VIE-001", quantity: 4 }]);

    const view = await forecast(DAY_1, DAY_1);

    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]?.quantities).toEqual([7]);
    expect(view.days[0]?.orderCount).toBe(2);
  });

  /**
   * 🔴 La régression que ce fichier existe pour tenir. Avant la clôture, la
   * commande est `placed` et le commerce la porte ; après, elle est basculée et
   * seul le **compte à produire arrêté** la connaît. Le chiffre ne doit pas
   * bouger d'un pouce entre les deux lectures.
   */
  it("garde son chiffre après la clôture, et annonce la journée comme arrêtée", async () => {
    const companyId = await seedSociete();
    await placeOrder(companyId, DAY_1, [{ sku: "VIE-001", quantity: 6 }]);

    const before = await forecast(DAY_1, DAY_1);
    expect(before.days[0]).toEqual({
      date: DAY_1,
      totalUnits: 6,
      orderCount: 1,
      closed: false,
      state: "open",
    });

    await ctx.asSub("staff-e2e").post(`/admin/production/batch/${DAY_1}/close`).expect(201);

    const after = await forecast(DAY_1, DAY_1);
    expect(after.days[0]).toEqual({
      date: DAY_1,
      totalUnits: 6,
      orderCount: 1,
      closed: true,
      state: "closed",
    });
    expect(after.lines[0]?.quantities).toEqual([6]);
  });

  /**
   * Le pendant du cas précédent : une commande TARDIVE sur une journée close
   * n'est pas ajoutée au compte arrêté. Elle est indiscernable d'une commande
   * qu'un abonné défaillant aurait laissée derrière, et fabriquer deux fois
   * coûte plus cher que de la lire sur la feuille d'atelier du jour.
   */
  it("n'ajoute pas une commande passée APRÈS la clôture au compte arrêté", async () => {
    const companyId = await seedSociete();
    await placeOrder(companyId, DAY_1, [{ sku: "VIE-001", quantity: 6 }]);
    await ctx.asSub("staff-e2e").post(`/admin/production/batch/${DAY_1}/close`).expect(201);

    await placeOrder(companyId, DAY_1, [{ sku: "VIE-001", quantity: 4 }]);

    const view = await forecast(DAY_1, DAY_1);
    expect(view.days[0]?.totalUnits).toBe(6);
  });

  it("refuse une plage à l'envers en nommant le cas", async () => {
    const response = await ctx
      .asSub("staff-e2e")
      .get(`/admin/production/forecast?from=${DAY_3}&to=${DAY_1}`)
      .expect(400);
    expect(JSON.stringify(response.body)).toContain("précède");
  });

  it("refuse une borne qui n'est pas un jour", async () => {
    await ctx
      .asSub("staff-e2e")
      .get(`/admin/production/forecast?from=03/09/2026&to=${DAY_1}`)
      .expect(400);
  });

  it("rend une matrice vide plutôt qu'une erreur sur une plage sans commande", async () => {
    await seedSociete();
    const view = await forecast(DAY_1, DAY_3);
    expect(view.lines).toEqual([]);
    expect(view.peakDate).toBeNull();
    expect(view.totalUnits).toBe(0);
    expect(view.days).toHaveLength(3);
  });

  describe("l'état de chaque journée, à l'heure de la maison (A3)", () => {
    const states = async (): Promise<string[]> =>
      (await forecast(DAY_1, DAY_3)).days.map((day) => `${day.date}:${day.state}`);

    it("la veille, passé l'heure d'alerte (manuel, 20:00), la journée non arrêtée est en retard", async () => {
      const companyId = await seedSociete();
      await placeOrder(companyId, DAY_1, [{ sku: "VIE-001", quantity: 6 }]);
      const eve = addDays(DAY_1, -1);

      clock.set(houseInstant(eve, "19:55"));
      expect(await states()).toEqual([`${DAY_1}:open`, `${DAY_2}:open`, `${DAY_3}:open`]);

      clock.set(houseInstant(eve, "20:05"));
      expect(await states()).toEqual([`${DAY_1}:overdue`, `${DAY_2}:open`, `${DAY_3}:open`]);

      clock.set(houseInstant(DAY_2, "08:00"));
      expect(await states()).toEqual([`${DAY_1}:past`, `${DAY_2}:open`, `${DAY_3}:open`]);
    });

    it("un jour fermé du fournil se dit `closedDay`, et rouvert redevient ouvert", async () => {
      await seedSociete();
      await ctx
        .asSub("staff-e2e")
        .post("/admin/production/settings/closed-days")
        .send({ date: DAY_2 })
        .expect(204);
      expect(await states()).toEqual([`${DAY_1}:open`, `${DAY_2}:closedDay`, `${DAY_3}:open`]);

      await ctx
        .asSub("staff-e2e")
        .delete(`/admin/production/settings/closed-days/${DAY_2}`)
        .expect(204);
      expect(await states()).toEqual([`${DAY_1}:open`, `${DAY_2}:open`, `${DAY_3}:open`]);
    });

    it("fermer un jour inscrit la journée au journal des changements (le prévisionnel se relit)", async () => {
      await seedSociete();
      await ctx.prisma.productionDayChange.deleteMany();
      await ctx
        .asSub("staff-e2e")
        .post("/admin/production/settings/closed-days")
        .send({ date: DAY_2 })
        .expect(204);

      const rows = await ctx.prisma.productionDayChange.findMany({ select: { serviceDay: true } });
      expect(rows.map((row) => row.serviceDay)).toContain(DAY_2);
    });
  });
});
