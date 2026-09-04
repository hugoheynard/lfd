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
import type { BillingAddressPayload } from "@lfd/contracts";

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
}): Promise<void> {
  await ctx.prisma.orderCutoff.create({
    data: {
      pickupAddressId: rule.pickupAddressId ?? null,
      weekday: rule.weekday ?? null,
      daysBefore: rule.daysBefore,
      time: rule.time,
    },
  });
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

describe("la saisie du back-office n'y est pas soumise", () => {
  /**
   * Exemption **datée**, et c'est le seul endroit où elle se voit de bout en
   * bout. Elle tombe avec le lot 3 de
   * `documentation/b2b/architecture-heure-limite-de-commande.md` : la dérogation
   * deviendra alors le chemin de sortie, et ce test changera de sens.
   */
  it("laisse l'équipe passer une commande après la limite", async () => {
    await seedCutoff({ daysBefore: 1, time: "00:01" });

    await ctx
      .asSub(STAFF)
      .post("/admin/orders")
      .send({
        companyId,
        // La commande est passée AU NOM du client : le mur porte sur lui, pas
        // sur le membre de l'équipe, qui n'est membre de rien par construction.
        buyerUserId: buyerId,
        settlement: "link",
        requestedDeliveryDate: serviceDay(0),
        fulfillmentMethod: "pickup",
        pickupAddressId: pickupId,
        lines: [{ sku: "VIE-001", quantity: 12 }],
      })
      .expect(201);

    expect(await orderCount()).toBe(1);
  });
});
