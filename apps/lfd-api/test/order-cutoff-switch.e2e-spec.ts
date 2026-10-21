import { randomUUID } from "node:crypto";
/**
 * E2E du **lot O3** de `documentation/commandes/plan-reglages-commandes.md`
 * (§8, §8.1, 2026-10-14) : l'arrêt du plan de production devenu une limite,
 * et le jour même. L'interrupteur de l'heure limite générale, que ce fichier
 * éprouvait aussi, est retiré le 2026-10-21
 * (`limites-de-commande/plan-une-seule-heure.md` §5) : il prouve désormais
 * qu'il ne coupe plus rien.
 *
 * Ce que seul le vrai SQL prouve :
 * - une ligne résiduelle `enabled = false` n'éteint plus l'heure limite, ni à
 *   la passation, ni au fournil (`GET /admin/production/settings`) ;
 * - **O5** : une commande ne passe plus sur un plan arrêté — ni par le client,
 *   ni par l'équipe. Ce test-là échouait avant le lot (201, la commande hors du
 *   compte à produire).
 *
 * Deux frontières doublées : la signature du jeton et la passerelle Stripe.
 */
import type { FulfillmentDayView, OrderCutoffSettingsView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const MEMBER = "auth0|membre-o3";
const STAFF = "staff-e2e";
const ROUTE = "/admin/order-cutoff-settings";

const fakeGateway = {
  createIntent: () => Promise.resolve({ paymentIntentId: "pi_o3", clientSecret: "pi_o3_secret" }),
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
let pickupId = "";
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
  const point = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER, email: "membre-o3@test.fr" });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  companyId = company.id;
  buyerId = member.id;
});

const staff = () => ctx.asSub(STAFF);

/** La limite générale, posée par la route de l'écran : la veille à 00:01. */
async function seedGeneralRule(): Promise<void> {
  await staff()
    .put("/admin/order-cutoffs/general")
    .send({ daysBefore: 1, time: "00:01", graceMinutes: 0 })
    .expect(204);
}

/**
 * L'interrupteur tel qu'un geste d'avant le 2026-10-21 l'a laissé : coupé. La
 * route ne l'écrit plus ; seule une ligne résiduelle peut encore le porter.
 */
async function leaveResidualSwitchOff(): Promise<void> {
  await ctx.prisma.orderCutoffSettings.create({
    data: {
      key: "orders",
      enabled: false,
      sameDayAllowed: true,
      updatedAt: new Date(),
      updatedByStaffId: STAFF,
      updatedByName: "Avant le retrait",
      updatedByRole: "admin",
    },
  });
}

async function setSameDay(sameDayAllowed: boolean): Promise<void> {
  await staff().patch(ROUTE).send({ sameDayAllowed }).expect(204);
}

/** La saisie de l'ÉQUIPE pour le client — la porte qui reçoit « hors plan » (§8.3). */
function staffOrder(day: string) {
  return staff()
    .post("/admin/orders")
    .send({
      companyId,
      buyerUserId: buyerId,
      settlement: "account",
      requestedDeliveryDate: day,
      fulfillmentMethod: "pickup",
      pickupAddressId: pickupId,
      requestedWindow: { start: "07:00", end: "08:00" },
      lines: [{ sku: "VIE-001", quantity: 2 }],
    });
}

function order(day: string): Record<string, unknown> {
  return {
    companyId,
    idempotencyKey: randomUUID(),
    pickupAddressId: pickupId,
    fulfillmentMethod: "pickup",
    // Pas de commande sans créneau (2026-10-14).
    requestedWindow: { start: "07:00", end: "08:00" },
    requestedDeliveryDate: day,
    // Au compte : le fournil compte une commande réglée, pas un paiement en vol.
    settlement: "account",
    note: "",
    lines: [{ sku: "VIE-001", quantity: 3 }],
  };
}

/**
 * Arrête le plan de la journée, par la route du fournil. Une journée vide ne
 * s'arrête pas (`production.day.empty`) : une première commande y entre
 * d'abord, à l'heure — c'est elle que le fournil compte.
 */
async function closePlan(day: string): Promise<void> {
  await ctx.asSub(MEMBER).post("/orders").send(order(day)).expect(201);
  await staff().post(`/admin/production/batch/${day}/close`).expect(201);
  await ctx.drain();
}

describe("l'interrupteur de l'heure limite générale, retiré le 2026-10-21", () => {
  it("la vue ne le porte plus : le jour même seul, sans auteur tant que personne ne l'a réglé", async () => {
    const view = jsonBody<OrderCutoffSettingsView>(await staff().get(ROUTE).expect(200));

    expect(view).toEqual({
      sameDayAllowed: false,
      resupplyCutoffTime: "20:00",
      updatedAt: null,
      updatedBy: null,
    });
  });

  it("refuse (400) une charge qui veut encore le couper, sans rien écrire", async () => {
    await staff().patch(ROUTE).send({ enabled: false }).expect(400);

    expect(await ctx.prisma.orderCutoffSettings.count()).toBe(0);
  });

  /**
   * Régression par construction : coupée, l'heure limite laissait passer les
   * commandes tardives ET n'arrêtait plus le plan. Une ligne résiduelle à
   * `false` ne coupe plus rien.
   */
  it("une ligne résiduelle « désactivée » n'éteint plus l'heure limite, ni au fournil", async () => {
    await seedGeneralRule();
    await leaveResidualSwitchOff();
    // L'heure du réassort au plus tôt (lot R3a) : l'arrêt lu reste l'heure générale.
    await staff().patch(ROUTE).send({ resupplyCutoffTime: "00:00" }).expect(204);
    // Pour AUJOURD'HUI, la limite de la veille à 00:01 est franchie à toute heure.
    const refused = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order(serviceDay(0)))
      .expect(409);
    expect(refused.body).toMatchObject({ code: "orders.cutoff.past" });

    const settings = await staff().get("/admin/production/settings").expect(200);
    expect(settings.body).toMatchObject({ automaticClose: { daysBefore: 1, time: "00:01" } });
  });

  it("le jour même se pose, se relit, et se journalise une seule fois — sans l'interrupteur", async () => {
    await setSameDay(true);
    await setSameDay(true);

    const view = jsonBody<OrderCutoffSettingsView>(await staff().get(ROUTE).expect(200));
    expect(view.sameDayAllowed).toBe(true);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "order_cutoff_settings.updated" },
      select: { payload: true },
    });
    expect(facts).toEqual([
      {
        payload: {
          sameDayAllowed: true,
          resupplyCutoffTime: "20:00",
          previous: { sameDayAllowed: false, resupplyCutoffTime: "20:00" },
        },
      },
    ]);
  });

  /** L'heure du réassort (lot R3a, 2026-10-21) : posée, relue, sans toucher au jour même. */
  it("l'heure du réassort se pose seule, et le jour même reste", async () => {
    await setSameDay(true);
    await staff().patch(ROUTE).send({ resupplyCutoffTime: "21:15" }).expect(204);

    const view = jsonBody<OrderCutoffSettingsView>(await staff().get(ROUTE).expect(200));
    expect(view).toMatchObject({ sameDayAllowed: true, resupplyCutoffTime: "21:15" });
  });

  it("refuse (400) une heure du réassort qui n'existe pas, sans rien écrire", async () => {
    await staff().patch(ROUTE).send({ resupplyCutoffTime: "25:00" }).expect(400);

    expect(await ctx.prisma.orderCutoffSettings.count()).toBe(0);
  });

  it("refuse (400) une charge vide", async () => {
    await staff().patch(ROUTE).send({}).expect(400);

    expect(await ctx.prisma.orderCutoffSettings.count()).toBe(0);
  });
});

describe("l'arrêt du plan est une limite (O5)", () => {
  /**
   * **Régression O5** (`observations-flux-de-commande.md`) : une commande a été
   * acceptée sur un plan arrêté. Elle n'était ni comptée, ni fabriquée, ni
   * préparée — et le client l'avait payée. Ce test échouait avant le lot O3.
   */
  it("refuse au client une journée dont le plan est arrêté, sans rien écrire", async () => {
    const day = serviceDay(3);
    await closePlan(day);

    const response = await ctx.asSub(MEMBER).post("/orders").send(order(day)).expect(409);

    expect(response.body).toMatchObject({ code: "orders.production_plan_closed" });
    expect(await ctx.prisma.order.count()).toBe(1);
  });

  /**
   * §8.3 (Hugo, 2026-10-14) : l'équipe peut encore saisir — la commande est
   * REÇUE, marquée hors plan, et la liste staff la met en alerte jusqu'à ce que
   * le fournil reprenne la journée.
   */
  it("reçoit la saisie de l'équipe, hors plan, jusqu'à la reprise de la journée", async () => {
    const day = serviceDay(3);
    await closePlan(day);

    const placed = jsonBody<{ readonly id: string }>(await staffOrder(day).expect(201));

    const offPlanOf = async (): Promise<boolean | undefined> => {
      const list = await staff().get("/admin/orders").expect(200);
      const rows = (list.body as { readonly rows: readonly { id: string; offPlan: boolean }[] })
        .rows;
      return rows.find((row) => row.id === placed.id)?.offPlan;
    };
    expect(await offPlanOf()).toBe(true);

    // Le retirage l'inscrit au fournil ; le commerce l'apprend à la re-clôture
    // (`production-day-closed.e2e-spec.ts`), et c'est alors qu'elle sort de l'alerte.
    await staff().post(`/admin/production/worksheet/${day}/retake`).expect(201);
    await staff().post(`/admin/production/batch/${day}/close`).expect(201);
    await ctx.drain();
    expect(await offPlanOf()).toBe(false);
  });

  it("laisse passer la journée d'après, dont le plan n'est pas arrêté", async () => {
    await closePlan(serviceDay(3));

    await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order(serviceDay(4)))
      .expect(201);
  });

  it("la boutique ne propose plus une journée arrêtée", async () => {
    await setSameDay(true);
    const today = serviceDay(0);
    await closePlan(today);

    const days = jsonBody<readonly FulfillmentDayView[]>(
      await ctx.http().get("/fulfillment-days").expect(200),
    );

    expect(days[0]).toEqual({ pickupAddressId: null, date: serviceDay(1), orderUntil: null });
  });
});

describe("le jour même, réglage admin (§8.3)", () => {
  it("fermé par défaut : la boutique propose demain, et refuse aujourd'hui au client", async () => {
    const days = jsonBody<readonly FulfillmentDayView[]>(
      await ctx.http().get("/fulfillment-days").expect(200),
    );
    expect(days[0]).toEqual({ pickupAddressId: null, date: serviceDay(1), orderUntil: null });

    const refused = await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send(order(serviceDay(0)))
      .expect(409);
    expect(refused.body).toMatchObject({ code: "orders.same_day_closed" });
  });

  it("fermé : refusé aussi à l'équipe, plan ouvert", async () => {
    const refused = await staffOrder(serviceDay(0)).expect(409);
    expect(refused.body).toMatchObject({ code: "orders.same_day_closed" });
  });

  it("ouvert : la boutique propose aujourd'hui, sans heure limite posée", async () => {
    await setSameDay(true);

    const days = jsonBody<readonly FulfillmentDayView[]>(
      await ctx.http().get("/fulfillment-days").expect(200),
    );
    expect(days[0]).toEqual({ pickupAddressId: null, date: serviceDay(0), orderUntil: null });
  });
});
