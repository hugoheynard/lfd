/**
 * **Lire les versions du plan** (`documentation/fournil/plan-historique-des-tirages.md`,
 * lot H4) — sur le vrai Postgres et le vrai stockage : arrêt → révision →
 * retirage, puis la liste (trois versions, leurs causes, leur papier), la
 * comparaison de la 1 à la 3, les envois du dossier, et le refus sans le
 * droit de lire le plan. Seul le mailer est doublé.
 */
import type { DossierDispatchView, PlanVersionDiffView, PlanVersionView } from "@lfd/contracts";

import { MAILER } from "../src/mail/templates/mailer.tokens.js";
import { DeferredTerm } from "../src/platform/database/client/client.js";
import { SEND_DOSSIER_ON_DAY_CLOSED } from "../src/production/plan/application/handlers/send-dossier-on-day-closed.handler.js";
import { SEND_DOSSIER_ON_DAY_RETAKEN } from "../src/production/plan/application/handlers/send-dossier-on-day-retaken.handler.js";
import { E2E_STAFF_ID, daysAgo, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { pickupSite, placeOrderForCustomer } from "./order-factory.js";
import { reviseQuantity } from "./order-revise-after-plan-scene.js";
import {
  CROISSANT,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  relayGate,
  retake,
} from "./production-day-fixture.js";
import { placeLateByStaff } from "./staff-late-order.js";

const ACCOUNT_BUYER = "auth0|plan-versions-read-pro";
const RECIPIENTS = "/admin/production/settings/dossier-recipients";
const VERSIONS = `/admin/production/batch/${SERVICE_DAY}/plan-versions`;

const recordingMailer = {
  enabled: true,
  send: (): Promise<{ providerId: null }> => Promise.resolve({ providerId: null }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay([{ token: MAILER, value: recordingMailer }]));
});

afterAll(async () => {
  relayGate.open = true;
  await ctx.close();
});

beforeEach(async () => {
  relayGate.open = true;
  await ctx.reset();
});

/** Une commande au compte d'un pro, que l'équipe peut réviser après l'arrêt. */
async function accountPickup(): Promise<string> {
  const company = await createCompany(ctx.prisma);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const buyer = await createUser(ctx.prisma, { auth0Sub: ACCOUNT_BUYER });
  await attachTo(ctx.prisma, buyer.id, company.id);
  const placed = await placeOrderForCustomer(ctx, {
    buyerUserId: buyer.id,
    companyId: company.id,
    staffUserId: E2E_STAFF_ID,
    settlement: "account",
    forDay: SERVICE_DAY,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: CROISSANT, quantity: 3 }],
  });
  return placed.id;
}

/** Vide la file jusqu'au calme, l'envoi du dossier compris (cf. le papier par version). */
async function settle(): Promise<void> {
  await ctx.drain();
  for (let round = 0; round < 4; round += 1) {
    const pending = await ctx.prisma.outboxDelivery.updateMany({
      where: {
        deliveredAt: null,
        subscriber: { in: [SEND_DOSSIER_ON_DAY_CLOSED, SEND_DOSSIER_ON_DAY_RETAKEN] },
      },
      data: { nextAttemptAt: new Date(daysAgo(1)) },
    });
    if (pending.count === 0) {
      return;
    }
    await relayGate.relay?.sweep();
    await ctx.drain();
  }
}

/** Arrêt → révision → retirage, avec un destinataire du dossier inscrit avant le retirage. */
async function playDay(): Promise<void> {
  const pro = await accountPickup();
  await closePlan(ctx);
  await settle();
  expect((await reviseQuantity(ctx, pro, 5)).status).toBe(200);
  await settle();
  await ctx
    .asSub(STAFF)
    .post(RECIPIENTS)
    .send({
      kind: "external",
      email: "jeanne@imprimerie.fr",
      firstName: "Jeanne",
      lastName: "Roux",
    })
    .expect(201);
  await placeLateByStaff(ctx, SERVICE_DAY, [{ sku: CROISSANT, quantity: 4 }]);
  await retake(ctx);
  await settle();
  // Le dossier de la version courante, s'il n'a pas pu être rangé au geste, l'est à la lecture.
  await ctx.asSub(STAFF).get(`/admin/production/batch/${SERVICE_DAY}/dossier.pdf`).expect(200);
}

describe("lire les versions du plan (H4)", () => {
  it("une journée jamais arrêtée n'a aucune version", async () => {
    const response = await ctx.asSub(STAFF).get(VERSIONS).expect(200);

    expect(response.body).toEqual([]);
  });

  it("arrêt → révision → retirage : trois versions, leur papier, la comparaison et les envois", async () => {
    await playDay();

    const list = await ctx.asSub(STAFF).get(VERSIONS).expect(200);
    const views = list.body as readonly PlanVersionView[];
    expect(views).toEqual([
      expect.objectContaining({ version: 1, cause: "closed", printRun: 1, shipmentCount: 1 }),
      expect.objectContaining({ version: 2, cause: "order_revised", printRun: 1 }),
      expect.objectContaining({ version: 3, cause: "retaken", printRun: 2, shipmentCount: 2 }),
    ]);
    expect(views[1]).toMatchObject({ author: { kind: "staff" } });
    // Le papier se lit au stockage : le compte de chaque version est rangé au
    // geste, le dossier quand il a pu l'être fidèlement (la version 2 l'est).
    expect(views.map((view) => view.paper.count)).toEqual([true, true, true]);
    expect(views[1]).toMatchObject({ paper: { version: 2, dossier: true } });
    expect(typeof views[2]?.paper.dossier).toBe("boolean");

    const diff = await ctx.asSub(STAFF).get(`${VERSIONS}/compare?from=1&to=3`).expect(200);
    expect(diff.body).toMatchObject({
      from: { version: 1, cause: "closed" },
      to: { version: 3, cause: "retaken" },
      baselineUnknown: false,
      production: [{ sku: CROISSANT, before: 3, after: 9, delta: 6 }],
      toCheck: [],
    });
    expect((diff.body as PlanVersionDiffView).changes.map((change) => change.kind)).toEqual([
      "revised",
      "entered",
    ]);

    const dispatches = await ctx.asSub(STAFF).get(`${VERSIONS}/dispatches`).expect(200);
    const received = (dispatches.body as readonly DossierDispatchView[]).map((row) => [
      row.name,
      row.lastReceived?.planVersion,
    ]);
    expect(received).toEqual([["Jeanne Roux", 3]]);
  });

  it("refuse une plage inversée (400), mal formée (400) et une version inconnue (404)", async () => {
    await playDay();

    const inverted = await ctx.asSub(STAFF).get(`${VERSIONS}/compare?from=3&to=1`).expect(400);
    expect((inverted.body as { code: string }).code).toBe("production.plan_version.range_inverted");
    await ctx.asSub(STAFF).get(`${VERSIONS}/compare?from=0&to=2`).expect(400);
    const unknown = await ctx.asSub(STAFF).get(`${VERSIONS}/compare?from=1&to=9`).expect(404);
    expect((unknown.body as { code: string }).code).toBe("production.plan_version.not_found");
  });

  // Ce harnais résout tout jeton staff vers la même fiche : le droit lui est retiré.
  it("sans le droit de lire le plan, ni la liste, ni la comparaison, ni les envois", async () => {
    const staff = await ctx.prisma.staffUser.findFirstOrThrow({
      where: { auth0Id: STAFF },
      select: { id: true },
    });
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId: staff.id, resource: "production_plan", action: "read", effect: "deny" },
    });

    await ctx.asSub(STAFF).get(VERSIONS).expect(403);
    await ctx.asSub(STAFF).get(`${VERSIONS}/compare?from=1&to=2`).expect(403);
    await ctx.asSub(STAFF).get(`${VERSIONS}/dispatches`).expect(403);
  });
});
