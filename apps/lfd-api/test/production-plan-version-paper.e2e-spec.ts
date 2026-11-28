/**
 * **Le papier par version, et la version de chaque envoi**
 * (`documentation/fournil/les-versions-du-plan.md`) — sur le vrai Postgres et le vrai stockage :
 * arrêt → papier rangé au geste sous la version 1 → révision → papier sous
 * la version 2, la version 1 restant rangée → retirage → envoi du dossier,
 * dont la trace porte la version. Seul le mailer est doublé.
 */
import { Buffer } from "node:buffer";

import { MAILER } from "../src/mail/templates/mailer.tokens.js";
import { DeferredTerm } from "../src/platform/database/client/client.js";
import { ProductionDocumentStore } from "../src/platform/storage/production-document-store.js";
import { SEND_DOSSIER_ON_DAY_CLOSED } from "../src/production/plan/application/handlers/send-dossier-on-day-closed.handler.js";
import { SEND_DOSSIER_ON_DAY_RETAKEN } from "../src/production/plan/application/handlers/send-dossier-on-day-retaken.handler.js";
import { dayDossierPdfKey } from "../src/production/plan/domain/services/day-dossier-pdf.js";
import { productionCountPdfKey } from "../src/production/shared/print/domain/services/atelier-sheet-pdf.js";
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

const ACCOUNT_BUYER = "auth0|plan-version-paper-pro";
const RECIPIENTS = "/admin/production/settings/dossier-recipients";

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

/**
 * Vide la file jusqu'au calme. L'envoi du dossier attend les BL que le
 * commerce fait naître sur le même fait : passé le premier, il est
 * reprogrammé ; on ramène son échéance à hier pour le rejouer tout de suite.
 */
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

async function stored(key: string): Promise<boolean> {
  return (await ctx.app.get(ProductionDocumentStore).readIfPresent(key)) !== null;
}

async function arrestedAt(): Promise<Date> {
  const day = await ctx.prisma.productionDay.findUniqueOrThrow({
    where: { serviceDay: SERVICE_DAY },
    select: { closedAt: true },
  });
  if (day.closedAt === null) {
    throw new RangeError("journée non arrêtée");
  }
  return day.closedAt;
}

describe("le papier par version (H2) et la version de chaque envoi (H2b)", () => {
  it("arrêt → révision → retirage : chaque version a son papier, chaque envoi sa version", async () => {
    const pro = await accountPickup();

    // 1. L'arrêt, sans destinataire : seul le geste range le papier.
    await closePlan(ctx);
    await settle();
    const closedAt = await arrestedAt();
    expect(await stored(productionCountPdfKey(SERVICE_DAY, closedAt, null, 1))).toBe(true);
    // Le dossier, s'il n'a pas pu l'être au geste (BL nés après), l'est à la lecture.
    await ctx.asSub(STAFF).get(`/admin/production/batch/${SERVICE_DAY}/dossier.pdf`).expect(200);
    expect(await stored(dayDossierPdfKey(SERVICE_DAY, closedAt, null, 1))).toBe(true);

    // 2. La révision : la version 2 a son papier, la version 1 reste rangée.
    expect((await reviseQuantity(ctx, pro, 5)).status).toBe(200);
    await settle();
    expect(await stored(productionCountPdfKey(SERVICE_DAY, closedAt, null, 2))).toBe(true);
    expect(await stored(dayDossierPdfKey(SERVICE_DAY, closedAt, null, 2))).toBe(true);
    expect(await stored(dayDossierPdfKey(SERVICE_DAY, closedAt, null, 1))).toBe(true);
    expect(await stored(productionCountPdfKey(SERVICE_DAY, closedAt, null, 1))).toBe(true);

    // 3. Le retirage, avec un destinataire : l'envoi porte la version 3.
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

    const traces = await ctx.prisma.productionDossierDispatch.findMany({
      where: { serviceDay: SERVICE_DAY },
      select: { outcome: true, planVersion: true },
    });
    expect(traces).toEqual([{ outcome: "sent", planVersion: 3 }]);
    expect(await stored(productionCountPdfKey(SERVICE_DAY, closedAt, null, 3))).toBe(true);
    // Le dossier tiré après le retirage ne se range jamais sous une version
    // précédente : celui de la version 2 reste l'exemplaire d'avant.
    const before = await ctx.app
      .get(ProductionDocumentStore)
      .readIfPresent(dayDossierPdfKey(SERVICE_DAY, closedAt, null, 2));
    await ctx.asSub(STAFF).get(`/admin/production/batch/${SERVICE_DAY}/dossier.pdf`).expect(200);
    const after = await ctx.app
      .get(ProductionDocumentStore)
      .readIfPresent(dayDossierPdfKey(SERVICE_DAY, closedAt, null, 2));
    expect(after?.equals(before ?? Buffer.alloc(0))).toBe(true);
    // La commande intégrée au retirage a son BL-1 prévu (le commerce écoute le
    // retirage) : le dossier de la version 3 est complet, donc rangé.
    expect(await stored(dayDossierPdfKey(SERVICE_DAY, closedAt, null, 3))).toBe(true);
  });
});
