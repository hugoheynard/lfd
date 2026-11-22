/**
 * E2E du **balayage des paiements en attente** (plan
 * `documentation/payment/plan-b-balayage-des-paiements-en-attente.md`) : le
 * filet d'un webhook perdu, `POST admin/card-payments/pending/sweep`.
 *
 * Ce que seul le vrai SQL prouve : la sélection (états, rôle, bornes d'âge,
 * curseur, index partiel), le chemin du webhook rejoué dans ses vrais verrous
 * — le sujet d'abord, la ligne ensuite —, et qu'un second passage ne refait
 * rien.
 *
 * Frontières doublées : la signature du jeton staff, le prestataire de carte
 * (il dit l'intention payée sans webhook), la racine publique des liens.
 */
import { randomUUID } from "node:crypto";

import type { CreatedPaymentLink } from "@lfd/contracts";

import type { PendingCardPaymentsSweepReport } from "../src/payment/card/application/commands/sweep-pending-card-payments.command.js";
import { CardProviders } from "../src/payment/card/domain/ports/card-providers.js";
import { FixedOrigins } from "../src/payment/link/application/__tests__/pay-link-doubles.js";
import { PayLinkOrigins } from "../src/payment/link/domain/ports/pay-link-origins.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { cardGatewayDouble } from "./order-factory.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createCompany, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const SWEEP = "/admin/card-payments/pending/sweep";
const CLIENT = "auth0|client-pending-sweep";
const ROOT = "https://app.lfc.test";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const cards = cardGatewayDouble("pi_sweep");

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CardProviders, value: cards },
      {
        token: PayLinkOrigins,
        value: new FixedOrigins([
          { name: "lafoliecoffee", label: "La Folie Coffee", publicRoot: ROOT },
        ]),
      },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  cards.provider.issued.splice(0);
  cards.provider.states.clear();
  await createUser(ctx.prisma, { auth0Sub: CLIENT });
});

async function sweep(): Promise<PendingCardPaymentsSweepReport> {
  const report = jsonBody<PendingCardPaymentsSweepReport>(
    await ctx.http().post(SWEEP).set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN).expect(200),
  );
  await ctx.drain();
  return report;
}

/** Vieillit la ligne de cette intention : le webhook a eu son temps, et s'est perdu. */
async function age(providerRef: string, interval: string): Promise<void> {
  await ctx.prisma.$executeRaw`
    UPDATE "payment"."card_payment"
    SET "created_at" = now() - ${interval}::interval
    WHERE "provider_ref" = ${providerRef}`;
}

async function paymentOf(providerRef: string) {
  return ctx.prisma.cardPayment.findFirstOrThrow({ where: { providerRef } });
}

/** Une commande perso en retrait, carte non réglée ; rend son id et sa référence. */
async function placeUnpaid(): Promise<{ readonly id: string; readonly providerRef: string }> {
  const point = await ctx.prisma.site.create({
    data: {
      label: "Boutique",
      ligne1: "12 rue du Test",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
  });
  const placed = jsonBody<{ orderNumber: string }>(
    await ctx
      .asSub(CLIENT)
      .post(`/orders`)
      .send({
        idempotencyKey: randomUUID(),
        salesTerms: null,
        companyId: null,
        requestedDeliveryDate: serviceDay(),
        fulfillmentMethod: "pickup",
        requestedWindow: { start: "07:00", end: "08:00" },
        pickupAddressId: point.id,
        note: "",
        lines: [{ sku: "VIE-001-1", quantity: 2 }],
      })
      .expect(201),
  );
  const order = await ctx.prisma.order.findUniqueOrThrow({
    where: { orderNumber: placed.orderNumber },
    select: { id: true },
  });
  return { id: order.id, providerRef: cards.provider.issued.at(-1) ?? "" };
}

async function orderPaymentStatus(id: string): Promise<string> {
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id },
    select: { paymentStatus: true },
  });
  return row.paymentStatus;
}

describe("le balayage des paiements en attente", () => {
  it("règle une commande que le prestataire dit payée ; un second passage ne refait rien", async () => {
    const order = await placeUnpaid();
    await age(order.providerRef, "10 minutes");
    cards.provider.states.set(order.providerRef, "succeeded");

    expect(await sweep()).toEqual({
      examined: 1,
      settled: 1,
      replayed: 0,
      refusedBySubject: 0,
      closed: 0,
      pending: 0,
      failedChecks: 0,
    });
    expect(await orderPaymentStatus(order.id)).toBe("paid");
    expect((await paymentOf(order.providerRef)).state).toBe("paid");

    expect((await sweep()).examined).toBe(0);
    expect(await orderPaymentStatus(order.id)).toBe("paid");
  });

  it("laisse cinq minutes au webhook, et ne relit plus un paiement de huit jours", async () => {
    const young = await placeUnpaid();
    cards.provider.states.set(young.providerRef, "succeeded");

    expect((await sweep()).examined).toBe(0);

    await age(young.providerRef, "8 days");
    expect((await sweep()).examined).toBe(0);
    expect((await paymentOf(young.providerRef)).state).toBe("pending");
  });

  it("en attente : la date de relecture avance, et la ligne attend son intervalle", async () => {
    const order = await placeUnpaid();
    await age(order.providerRef, "10 minutes");

    expect(await sweep()).toMatchObject({ examined: 1, pending: 1 });
    expect((await paymentOf(order.providerRef)).providerCheckedAt).not.toBeNull();
    expect((await sweep()).examined).toBe(0);
  });

  it("annulée chez le prestataire : la ligne se ferme", async () => {
    const order = await placeUnpaid();
    await age(order.providerRef, "10 minutes");
    cards.provider.states.set(order.providerRef, "canceled");

    expect(await sweep()).toMatchObject({ examined: 1, closed: 1 });
    expect((await paymentOf(order.providerRef)).state).toBe("closed");
  });

  it("règle le paiement d'un lien", async () => {
    const { id: companyId } = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    const created = jsonBody<CreatedPaymentLink>(
      await ctx
        .asSub(E2E_STAFF_SUB)
        .post("/admin/accounting/payment-links")
        .set(INTENT_KEY, freshIntent())
        .send({ companyId, amountCents: 12_000, label: "Régularisation", nature: "regularization" })
        .expect(201),
    );
    await ctx
      .http()
      .post("/pay-links/intent")
      .send({ token: created.url.slice(`${ROOT}/payer/`.length) })
      .expect(200);
    const providerRef = cards.provider.issued.at(-1) ?? "";
    await age(providerRef, "2 hours");
    cards.provider.states.set(providerRef, "succeeded");

    expect(await sweep()).toMatchObject({ examined: 1, settled: 1 });
    const link = await ctx.prisma.paymentLink.findUniqueOrThrow({ where: { id: created.id } });
    expect(link.status).toBe("paid");
    expect((await sweep()).examined).toBe(0);
  });

  it("refuse un appel sans le jeton de la machine", async () => {
    await ctx.http().post(SWEEP).expect(401);
  });
});
