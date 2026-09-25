/**
 * E2E de la **Supervision du jour** (`GET /admin/supervision/day`) — plan
 * `documentation/order/plan-supervision-du-jour.md`.
 *
 * Ce qui ne se prouve qu'avec du vrai SQL : le jour (colonne `date`), le filtre
 * d'argent partagé avec le dossier du jour, le compte des commandes sans date,
 * et le mur de la ressource `b2b_supervision`.
 *
 * ⚠️ Les commandes sont semées par Prisma, comme dans `customer-sheet` : les
 * statuts `ready` / `fulfilled` exigeraient sinon le colisage et le retrait
 * entiers, qui ne sont pas le sujet. Dette notée dans `test/factories.ts`.
 *
 * Toutes les dates sont RELATIVES (`serviceDay`) : la vue compare le créneau à
 * l'horloge.
 */
import type { DaySupervisionView, StaffRole } from "@lfd/contracts";
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import type { OrderStatus, PaymentStatus, Prisma } from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createCompany, createGuest, createUser } from "./factories.js";

const DAY = serviceDay();
const OTHER_DAY = serviceDay(8);
/** Hier : un créneau promis y est toujours passé, quelle que soit l'heure du test. */
const YESTERDAY = serviceDay(-1);

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Une fiche staff active du rôle donné ; rend son agent. */
async function staffAs(role: StaffRole): Promise<request.Agent> {
  const sub = `staff-supervision-${role}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: role,
      email: `supervision-${role}@lfc.test`,
      role,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

interface OrderSeed {
  readonly reference: string;
  readonly day: string | null;
  readonly status?: OrderStatus;
  readonly paymentStatus?: PaymentStatus;
  readonly clientele?: "pro" | "public";
  readonly companyId?: string | null;
  readonly placedByUserId: string;
  readonly fulfillmentMethod?: "pickup" | "delivery";
  readonly fulfillment?: Prisma.InputJsonValue;
}

let seq = 0;

async function seedOrder(seed: OrderSeed): Promise<void> {
  seq += 1;
  await ctx.prisma.order.create({
    data: {
      orderNumber: seed.reference,
      companyId: seed.companyId ?? null,
      placedByUserId: seed.placedByUserId,
      clientele: seed.clientele ?? "pro",
      status: seed.status ?? "placed",
      paymentStatus: seed.paymentStatus ?? "not_required",
      requestedDeliveryDate: seed.day === null ? null : new Date(`${seed.day}T00:00:00.000Z`),
      fulfillmentMethod: seed.fulfillmentMethod ?? "pickup",
      ...(seed.fulfillment === undefined ? {} : { fulfillment: seed.fulfillment }),
      subtotalCents: 1000 + seq,
      totalCents: 1234 + seq,
    },
  });
}

/** Un pro (société + membre) et un particulier sans compte. */
async function seedParties(): Promise<{ companyId: string; memberId: string; guestId: string }> {
  const company = await createCompany(ctx.prisma, { raisonSociale: "Boulangerie du Col" });
  const member = await createUser(ctx.prisma, { auth0Sub: "auth0|pro", email: "pro@col.fr" });
  const guest = await createGuest(ctx.prisma, {
    email: "visiteur@exemple.fr",
    firstName: "Léa",
    phone: "0600000000",
  });
  return { companyId: company.id, memberId: member.id, guestId: guest.id };
}

async function supervise(
  day: string,
  agent = ctx.asSub(E2E_STAFF_SUB),
): Promise<DaySupervisionView> {
  const response = await agent.get(`/admin/supervision/day?date=${day}`).expect(200);
  return jsonBody<DaySupervisionView>(response);
}

describe("la Supervision du jour", () => {
  it("refuse à qui n'a pas le droit (403), même avec les commandes en écriture", async () => {
    const agent = await staffAs("commercial");
    await agent.get(`/admin/supervision/day?date=${DAY}`).expect(403);
  });

  it("refuse une date mal formée (400)", async () => {
    await ctx.asSub(E2E_STAFF_SUB).get("/admin/supervision/day?date=demain").expect(400);
  });

  it("compte le flux du jour par acheminement, sans les autres jours ni les brouillons", async () => {
    const { companyId, memberId } = await seedParties();
    const pro = { companyId, placedByUserId: memberId };
    await seedOrder({ ...pro, reference: "CMD-1", day: DAY, status: "placed" });
    await seedOrder({ ...pro, reference: "CMD-2", day: DAY, status: "confirmed" });
    await seedOrder({ ...pro, reference: "CMD-3", day: DAY, status: "ready" });
    await seedOrder({ ...pro, reference: "CMD-4", day: DAY, status: "fulfilled" });
    await seedOrder({ ...pro, reference: "CMD-5", day: DAY, status: "cancelled" });
    await seedOrder({ ...pro, reference: "CMD-6", day: DAY, status: "draft" });
    await seedOrder({
      ...pro,
      reference: "CMD-7",
      day: DAY,
      status: "ready",
      fulfillmentMethod: "delivery",
    });
    await seedOrder({ ...pro, reference: "CMD-8", day: OTHER_DAY, status: "placed" });

    const view = await supervise(DAY);

    expect(view.date).toBe(DAY);
    expect(view.flow).toEqual([
      {
        fulfillmentMethod: "pickup",
        placed: 1,
        inProduction: 1,
        ready: 1,
        handedOver: 1,
        cancelled: 1,
      },
      {
        fulfillmentMethod: "delivery",
        placed: 0,
        inProduction: 0,
        ready: 1,
        handedOver: 0,
        cancelled: 0,
      },
    ]);
  });

  it("compte à part les commandes OUVERTES sans date de service", async () => {
    const { companyId, memberId } = await seedParties();
    await seedOrder({ companyId, placedByUserId: memberId, reference: "CMD-1", day: null });
    await seedOrder({ companyId, placedByUserId: memberId, reference: "CMD-2", day: DAY });
    // Closes sans date : plus aucun geste à faire, elles ne comptent pas.
    await seedOrder({
      companyId,
      placedByUserId: memberId,
      reference: "CMD-3",
      day: null,
      status: "fulfilled",
    });
    await seedOrder({
      companyId,
      placedByUserId: memberId,
      reference: "CMD-4",
      day: null,
      status: "cancelled",
    });

    const view = await supervise(DAY);

    expect(view.undated).toBe(1);
    expect(view.flow[0]?.placed).toBe(1);
  });

  it("écarte le particulier dont la carte est en l'air, garde le pro en attente", async () => {
    const { companyId, memberId, guestId } = await seedParties();
    await seedOrder({
      reference: "CMD-PUBLIC",
      day: DAY,
      clientele: "public",
      paymentStatus: "pending",
      placedByUserId: guestId,
    });
    await seedOrder({
      reference: "CMD-PRO",
      day: DAY,
      paymentStatus: "pending",
      companyId,
      placedByUserId: memberId,
    });

    const view = await supervise(DAY);

    expect(view.flow[0]?.placed).toBe(1);
  });

  it("signale un créneau promis dépassé, et ne rend ni montant ni e-mail", async () => {
    const { guestId } = await seedParties();
    await seedOrder({
      reference: "CMD-LATE",
      day: YESTERDAY,
      status: "ready",
      clientele: "public",
      paymentStatus: "paid",
      placedByUserId: guestId,
      fulfillment: {
        window: { value: { start: "07:00", end: "08:00" }, source: "override" },
        contact: { value: null, source: "default" },
        signatureRequired: { value: false, source: "default" },
      },
    });

    const view = await supervise(YESTERDAY);

    expect(view.late).toEqual([
      expect.objectContaining({
        reference: "CMD-LATE",
        customerName: "Léa",
        stage: "ready",
        rule: "not_handed_over_after_window",
        window: { start: "07:00", end: "08:00", source: "override" },
      }),
    ]);
    const raw = JSON.stringify(view);
    expect(raw).not.toContain("@");
    expect(raw).not.toMatch(/cents/iu);
    expect(raw).not.toContain("0600000000");
  });

  it("ne juge jamais une heure d'ouverture recopiée", async () => {
    const { companyId, memberId } = await seedParties();
    await seedOrder({
      reference: "CMD-DEFAULT",
      day: YESTERDAY,
      companyId,
      placedByUserId: memberId,
      fulfillment: {
        window: { value: { start: "07:00", end: "08:00" }, source: "default" },
        contact: { value: null, source: "default" },
        signatureRequired: { value: false, source: "default" },
      },
    });

    expect((await supervise(YESTERDAY)).late).toEqual([]);
  });
});
