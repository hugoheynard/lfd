import { randomUUID } from "node:crypto";
/**
 * E2E de **la feuille de route du jour** (`GET admin/livraison/feuille-de-route`,
 * plan `documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 1), sur
 * le vrai Postgres jetable.
 *
 * Ce que seule cette suite prouve : le lien d'adresse est écrit à la passation
 * sous le mur, la feuille relit consignes et procédure sous le mur aussi — une
 * procédure d'une AUTRE maison ne sort jamais —, le filtre est celui de la file
 * (retrait et brouillon écartés), aucun montant ne sort, et la production dit
 * quelle commande n'a pas de feuille d'atelier.
 */
import type {
  AdminCompanyDetailView,
  DeliveryProcedureView,
  DeliveryRunSheetView,
  StaffRole,
} from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { settleCardPayments } from "./card-payments.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { pngOf } from "./delivery-procedure-scene.js";
import { addVehicle, assign, openRound } from "./delivery-rounds-scene.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const OWNER = "auth0|run-sheet-owner";
const OTHER_OWNER = "auth0|run-sheet-other";
const DAY = serviceDay();

const SITE = {
  label: "Boutique",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

const SPECS = {
  note: "Sonner à l'interphone B",
  slotList: { mode: "everyday", slots: [] },
  deliveryContact: { prenom: "Camille", nom: "Rousseau", telephone: "0142710844" },
  gps: { lat: 45.448, lng: 6.98 },
  signatureRequired: true,
  stopMinutes: 20,
};

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let intentCount = 0;
const issuedIntents: string[] = [];
const fakeGateway = {
  createIntent: () => {
    intentCount += 1;
    const id = `pi_e2e_run_sheet_${String(intentCount)}`;
    issuedIntents.push(id);
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
  });
  await ctx.prisma.pickupAddress.create({ data: { ...SITE, isDefault: true } });
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Une société active, son gestionnaire, et une adresse de carnet avec ses consignes. */
async function seedCompany(
  sub: string,
  raisonSociale: string,
): Promise<{ companyId: string; addressId: string }> {
  const owner = await createUser(ctx.prisma, { auth0Sub: sub });
  const company = await createCompany(ctx.prisma, { status: "active", raisonSociale });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  const address = await ctx.prisma.address.create({
    data: {
      ...SITE,
      companyId: company.id,
      kind: "delivery",
      isDefault: true,
      deliverySpecs: SPECS,
    },
    select: { id: true },
  });
  return { companyId: company.id, addressId: address.id };
}

/** Une étape de procédure, posée par la route du client, avec ou sans photo. */
async function addStep(
  sub: string,
  companyId: string,
  addressId: string,
  title: string,
  photo: Buffer | null = null,
) {
  const pending = ctx
    .asSub(sub)
    .post(`/companies/${companyId}/delivery-addresses/${addressId}/procedure/steps`)
    .field("title", title)
    .field("body", "");
  await (photo === null ? pending : pending.attach("photo", photo, "portail.png")).expect(201);
}

/** Passe et règle une commande pour le jour ; rend son id commerce. */
async function place(
  sub: string,
  fulfillment: "pickup" | "delivery",
  deliveryAddressId: string | null = null,
): Promise<string> {
  const point = await ctx.prisma.pickupAddress.findFirstOrThrow({ select: { id: true } });
  const where =
    fulfillment === "pickup"
      ? { pickupAddressId: point.id }
      : {
          deliveryAddress: SITE,
          deliveryAddressId,
          requestedWindow: { start: null, end: "10:00" },
        };
  const placed = jsonBody<{ orderNumber: string }>(
    await ctx
      .asSub(sub)
      .post(`/orders`)
      .send({
        idempotencyKey: randomUUID(),
        requestedDeliveryDate: DAY,
        fulfillmentMethod: fulfillment,
        ...where,
        note: "par la cour",
        lines: [{ sku: "VIE-001", quantity: 4 }],
      })
      .expect(201),
  );
  await settleCardPayments(ctx, issuedIntents);
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { orderNumber: placed.orderNumber },
    select: { id: true },
  });
  return row.id;
}

async function runSheet(): Promise<DeliveryRunSheetView> {
  return jsonBody<DeliveryRunSheetView>(
    await staff().get(`/admin/livraison/feuille-de-route?jour=${DAY}`).expect(200),
  );
}

describe("la feuille de route du jour", () => {
  it("refuse un jour mal formé (400)", async () => {
    await staff().get(`/admin/livraison/feuille-de-route?jour=demain`).expect(400);
  });

  /**
   * Régression : `orders.delivery_address_id` n'était écrit par RIEN — la
   * feuille de route ne pouvait atteindre ni la procédure ni la note de
   * l'adresse livrée (constaté le 2026-09-29).
   */
  it("🔴 écrit le lien d'adresse à la passation, et sert note, GPS et procédure", async () => {
    const { companyId, addressId } = await seedCompany(OWNER, "Boulangerie du Col");
    await addStep(OWNER, companyId, addressId, "Portail", pngOf(40, 30));
    await addStep(OWNER, companyId, addressId, "Cour");
    const orderId = await place(OWNER, "delivery", addressId);

    const stored = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { deliveryAddressId: true },
    });
    expect(stored.deliveryAddressId).toBe(addressId);

    const stop = (await runSheet()).stops.find((entry) => entry.orderId === orderId);
    expect(stop).toMatchObject({
      customerLabel: "Boulangerie du Col",
      orderNote: "par la cour",
      signatureRequired: true,
      contact: SPECS.deliveryContact,
      address: SITE,
      addressBook: {
        companyId,
        addressId,
        note: SPECS.note,
        gps: SPECS.gps,
        stopMinutes: SPECS.stopMinutes,
        procedure: [
          { title: "Portail", body: "", hasPhoto: true },
          { title: "Cour", body: "", hasPhoto: false, photoRevision: null },
        ],
      },
    });
    // La révision est CELLE de la procédure staff : l'écran compose la même URL.
    const staffView = jsonBody<DeliveryProcedureView>(
      await staff()
        .get(`/admin/companies/${companyId}/delivery-addresses/${addressId}/procedure`)
        .expect(200),
    );
    const staffRevision = staffView.steps[0]?.photoRevision;
    expect(staffRevision).toEqual(expect.any(String));
    expect(stop?.addressBook?.procedure[0]?.photoRevision).toBe(staffRevision);
  });

  it("écarte les retraits et les brouillons, et ne sert AUCUN champ monétaire", async () => {
    const { addressId } = await seedCompany(OWNER, "Boulangerie du Col");
    const delivery = await place(OWNER, "delivery", addressId);
    await place(OWNER, "pickup");
    const draft = await place(OWNER, "delivery", addressId);
    // Un brouillon de commande n'est plus produit par la passation : c'est un
    // état hérité que la file écarte — on le pose en base, comme la Supervision.
    await ctx.prisma.order.update({ where: { id: draft }, data: { status: "draft" } });

    const view = await runSheet();

    expect(view.stops.map((stop) => stop.orderId)).toEqual([delivery]);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toMatch(/cents|price|amount|"total(?!Units)/iu);
  });

  it("🔴 ne relie PAS une commande à l'adresse d'une autre société", async () => {
    await seedCompany(OWNER, "Boulangerie du Col");
    const other = await seedCompany(OTHER_OWNER, "Autre Maison");
    await addStep(OTHER_OWNER, other.companyId, other.addressId, "Code secret du portail");

    const orderId = await place(OWNER, "delivery", other.addressId);

    const stored = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { deliveryAddressId: true },
    });
    expect(stored.deliveryAddressId).toBeNull();
    const stop = (await runSheet()).stops.find((entry) => entry.orderId === orderId);
    expect(stop?.addressBook).toBeNull();
  });

  it("🔴 ne sert JAMAIS la procédure d'une autre société, même si le lien existe en base", async () => {
    const own = await seedCompany(OWNER, "Boulangerie du Col");
    const other = await seedCompany(OTHER_OWNER, "Autre Maison");
    await addStep(OTHER_OWNER, other.companyId, other.addressId, "Code secret du portail");
    const orderId = await place(OWNER, "delivery", own.addressId);
    // Une donnée ancienne ou réparée à la main : le lien pointe chez l'autre.
    await ctx.prisma.order.update({
      where: { id: orderId },
      data: { deliveryAddressId: other.addressId },
    });

    const view = await runSheet();

    expect(view.stops.find((entry) => entry.orderId === orderId)?.addressBook).toBeNull();
    expect(JSON.stringify(view)).not.toContain("Code secret du portail");
  });

  it("🔴 signale la retardataire, passée après la clôture, sans feuille d'atelier", async () => {
    const { addressId } = await seedCompany(OWNER, "Boulangerie du Col");
    const planned = await place(OWNER, "delivery", addressId);

    const open = await runSheet();
    // Journée ouverte : personne n'a encore de feuille, personne n'est en retard.
    expect(open.stops.every((stop) => !stop.withoutAtelierSheet)).toBe(true);
    expect(open.stops).toHaveLength(1);

    await staff().post(`/admin/production/batch/${DAY}/close`).expect(201);
    const late = await place(OWNER, "delivery", addressId);

    const closed = await runSheet();
    expect(closed.stops.map((stop) => [stop.orderId, stop.withoutAtelierSheet]).sort()).toEqual(
      [
        [late, true],
        [planned, false],
      ].sort(),
    );
  });
});

/**
 * La procédure sous son propre droit (`plan-droits-par-geste.md`, DG-D8) : la
 * feuille s'ouvre sous `delivery_run_sheet` et la fiche sous `b2b_companies`,
 * mais le texte, les photos et le nombre d'étapes ne sortent qu'avec
 * `delivery_procedures:read`. Le masquage est AU SERVEUR : la réponse elle-même
 * ne les porte pas.
 */
describe("la tournée et le rang de chaque arrêt (2026-10-06)", () => {
  it("dit la tournée et le rang d'une placée, `null` pour une non placée, et compte les tournées du jour", async () => {
    const { addressId } = await seedCompany(OWNER, "Boulangerie du Col");
    const first = await place(OWNER, "delivery", addressId);
    const second = await place(OWNER, "delivery", addressId);
    const loose = await place(OWNER, "delivery", addressId);
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo blanc"));
    await openRound(ctx, DAY, await addVehicle(ctx, "Trafic"));
    await assign(ctx, DAY, roundId, first);
    await assign(ctx, DAY, roundId, second);

    const sheet = await runSheet();
    const byId = new Map(sheet.stops.map((stop) => [stop.orderId, stop]));

    expect(sheet.roundCount).toBe(2);
    expect(byId.get(second)?.round).toEqual({ roundId, label: "Kangoo blanc", position: 2 });
    expect(byId.get(first)?.round).toMatchObject({ roundId, position: 1 });
    expect(byId.get(loose)?.round).toBeNull();
  });

  it("compte zéro tournée un jour sans composition", async () => {
    expect((await runSheet()).roundCount).toBe(0);
  });
});

describe("la procédure, sous `delivery_procedures`", () => {
  /** Une fiche du rôle donné ; `withoutProcedures` lui retire la lecture des procédures. */
  async function staffAs(
    role: StaffRole,
    withoutProcedures = false,
  ): Promise<ReturnType<E2eContext["asSub"]>> {
    const sub = `staff-${role}-procedures`;
    const row = await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: role,
        email: `${role}-procedures@lfc.test`,
        role,
        status: "active",
        auth0Id: sub,
      },
    });
    if (withoutProcedures) {
      // Le réglage visé à l'écran (DG-D7) : le support lit la feuille, pas les procédures.
      await ctx.prisma.staffPermissionOverride.create({
        data: {
          staffUserId: row.id,
          resource: "delivery_procedures",
          action: "read",
          effect: "deny",
        },
      });
    }
    return ctx.asSub(sub);
  }

  async function seedProcedure(): Promise<{ companyId: string; orderId: string }> {
    const { companyId, addressId } = await seedCompany(OWNER, "Boulangerie du Col");
    await addStep(OWNER, companyId, addressId, "Code secret du portail", pngOf(40, 30));
    await addStep(OWNER, companyId, addressId, "Cour");
    const orderId = await place(OWNER, "delivery", addressId);
    return { companyId, orderId };
  }

  it("🔴 le support sans `delivery_procedures:read` lit la feuille de route SANS procédure", async () => {
    const { orderId } = await seedProcedure();
    const support = await staffAs("support", true);

    const view = jsonBody<DeliveryRunSheetView>(
      await support.get(`/admin/livraison/feuille-de-route?jour=${DAY}`).expect(200),
    );

    const stop = view.stops.find((entry) => entry.orderId === orderId);
    expect(stop?.addressBook).toMatchObject({ note: SPECS.note, procedure: [] });
    expect(JSON.stringify(view)).not.toContain("Code secret du portail");
  });

  it("le commercial lit la feuille de route AVEC la procédure", async () => {
    const { orderId } = await seedProcedure();
    const commercial = await staffAs("commercial");

    const view = jsonBody<DeliveryRunSheetView>(
      await commercial.get(`/admin/livraison/feuille-de-route?jour=${DAY}`).expect(200),
    );

    const stop = view.stops.find((entry) => entry.orderId === orderId);
    expect(stop?.addressBook?.procedure.map((step) => step.title)).toEqual([
      "Code secret du portail",
      "Cour",
    ]);
  });

  it("🔴 le carnet de la fiche client tait le nombre d'étapes au support, le sert au commercial", async () => {
    const { companyId } = await seedProcedure();
    const support = await staffAs("support", true);
    const commercial = await staffAs("commercial");

    const masked = jsonBody<AdminCompanyDetailView>(
      await support.get(`/admin/companies/${companyId}`).expect(200),
    );
    const served = jsonBody<AdminCompanyDetailView>(
      await commercial.get(`/admin/companies/${companyId}`).expect(200),
    );

    expect(masked.addresses.deliveries.map((address) => address.procedureStepCount)).toEqual([0]);
    expect(served.addresses.deliveries.map((address) => address.procedureStepCount)).toEqual([2]);
  });
});
