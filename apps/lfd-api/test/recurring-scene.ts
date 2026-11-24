/**
 * Ce que partagent les e2e du **bloc des paniers récurrents** (plan
 * `documentation/commandes/paniers-recurrents/plan-bloc-recurrent.md`) : les
 * CGV publiées, un gabarit hebdomadaire, l'ouverture par la vraie route, et
 * le balayage par sa route machine.
 *
 * 🔴 Un panier ne s'ouvre pas sans CGV publiées pour sa clientèle (§ 7) : une
 * suite qui ouvre un panier publie d'abord les deux textes, par la route du
 * staff — ce qui demande `ADMIN_VERIFIER_OVERRIDE` au démarrage.
 */
import type { CreateSubscriptionPayload } from "@lfd/contracts";
import { WORKSPACE_HEADER } from "@lfd/contracts";

import type { RecurringOccurrencesSweepReport } from "../src/recurring/occurrence/application/commands/sweep-due-occurrences.command.js";
import { E2E_STAFF_SUB, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { prose } from "./legal-document-writes.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/** Publie les deux textes de CGV (particuliers et pros), révision 1 chacun. */
export async function publishSalesTerms(ctx: E2eContext): Promise<void> {
  for (const mention of ["salesTerms", "salesTermsPro"]) {
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`/admin/content/legal/${mention}/paragraphs`)
      .send({ ...prose("panier"), expectedRevision: 0 })
      .expect(201);
  }
}

/**
 * Un gabarit hebdomadaire au retrait, qui commence dans `startInDays` jours
 * (de Paris) — une intention relative à aujourd'hui, jamais un jour du
 * calendrier.
 */
export function weeklyBasket(
  overrides: Partial<CreateSubscriptionPayload> = {},
  startInDays = 2,
): CreateSubscriptionPayload {
  return {
    fromOrderId: null,
    recurrence: "weekly",
    startDate: serviceDay(startInDays),
    endDate: null,
    fulfillmentMethod: "pickup",
    deliveryAddress: null,
    pickupAddressId: null,
    requestedWindow: { start: "07:00", end: "08:00" },
    lines: [{ sku: "VIE-001-1", quantity: 6 }],
    note: "",
    ...overrides,
  };
}

/** Ouvre un panier par la route du client, dans l'espace donné ; rend son id. */
export async function openBasket(
  ctx: E2eContext,
  sub: string,
  workspace: string,
  payload: CreateSubscriptionPayload = weeklyBasket(),
): Promise<string> {
  const response = await ctx
    .asSub(sub)
    .post("/subscriptions")
    .set(INTENT_KEY, freshIntent())
    .set(WORKSPACE_HEADER, workspace)
    .send(payload)
    .expect(201);
  return jsonBody<{ readonly id: string }>(response).id;
}

/** Le balayage, par sa route machine. */
export async function sweep(ctx: E2eContext): Promise<RecurringOccurrencesSweepReport> {
  const response = await ctx
    .http()
    .post("/admin/subscriptions/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  return jsonBody<RecurringOccurrencesSweepReport>(response);
}

/** Les états des échéances d'un panier, par jour de service croissant. */
export async function occurrenceStates(
  ctx: E2eContext,
  basketId: string,
): Promise<readonly (readonly [string, string])[]> {
  const rows = await ctx.prisma.occurrence.findMany({
    where: { basketId },
    orderBy: { serviceDay: "asc" },
    select: { serviceDay: true, state: true },
  });
  return rows.map((row) => [row.serviceDay.toISOString().slice(0, 10), row.state] as const);
}
