/**
 * **Le renvoi du dossier de la version courante, et le papier d'une version
 * passée** (`documentation/fournil/les-versions-du-plan.md`) —
 * sur le vrai Postgres, la vraie boîte d'envoi du bloc `mail` et le vrai
 * stockage : arrêt (envoi, version 1) → révision → renvoi ciblé (la trace
 * porte la version 2, le PDF joint est celui de la version 2) → rejeu de la
 * même clé (rien de plus) → renvoi à « tous les dépassés » sans personne à
 * servir (aucun e-mail). Puis le papier rangé de la version 1 (200) et un
 * papier non rangé (404). Seul le mailer est doublé.
 */
import { MAILER } from "../src/mail/templates/mailer.tokens.js";
import { DeferredTerm } from "../src/platform/database/client/client.js";
import { ProductionDocumentStore } from "../src/platform/storage/production-document-store.js";
import { SEND_DOSSIER_ON_DAY_CLOSED } from "../src/production/plan/application/handlers/send-dossier-on-day-closed.handler.js";
import { SEND_DOSSIER_ON_DAY_RETAKEN } from "../src/production/plan/application/handlers/send-dossier-on-day-retaken.handler.js";
import { dayDossierPdfKey } from "../src/production/plan/domain/services/day-dossier-pdf.js";
import { productionCountPdfKey } from "../src/production/shared/print/domain/services/atelier-sheet-pdf.js";
import { E2E_STAFF_ID, daysAgo, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { pickupSite, placeOrderForCustomer } from "./order-factory.js";
import { reviseQuantity } from "./order-revise-after-plan-scene.js";
import {
  CROISSANT,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  relayGate,
} from "./production-day-fixture.js";

const ACCOUNT_BUYER = "auth0|plan-version-resend-pro";
const RECIPIENTS = "/admin/production/settings/dossier-recipients";
const VERSIONS = `/admin/production/batch/${SERVICE_DAY}/plan-history`;

interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly data: {
    readonly version?: number;
    readonly sinceVersion?: number;
    readonly pdfBase64?: string;
    readonly fileName?: string;
  };
}
const sentMails: SentMail[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    sentMails.push(args);
    return Promise.resolve({ providerId: null });
  },
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
  sentMails.splice(0);
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

/** Vide la file jusqu'au calme, l'envoi du dossier compris (il attend les BL nés). */
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

async function closedAt(): Promise<Date> {
  const day = await ctx.prisma.productionDay.findUniqueOrThrow({
    where: { serviceDay: SERVICE_DAY },
    select: { closedAt: true },
  });
  if (day.closedAt === null) {
    throw new RangeError("journée non arrêtée");
  }
  return day.closedAt;
}

async function traces(): Promise<readonly { outcome: string; planVersion: number | null }[]> {
  return ctx.prisma.productionDossierDispatch.findMany({
    where: { serviceDay: SERVICE_DAY },
    orderBy: { claimedAt: "asc" },
    select: { outcome: true, planVersion: true },
  });
}

function resend(body: object, key: string) {
  return ctx.asSub(STAFF).post(`${VERSIONS}/resend`).set(INTENT_KEY, key).send(body);
}

describe("le renvoi du dossier de la version courante (H6)", () => {
  it("arrêt → révision → renvoi ciblé, rejeu, renvoi aux dépassés ; puis le papier d'une version passée", async () => {
    const pro = await accountPickup();
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

    // 1. L'arrêt : le dossier part à Jeanne, à la version 1.
    await closePlan(ctx);
    await settle();
    await ctx.asSub(STAFF).get(`/admin/production/batch/${SERVICE_DAY}/dossier.pdf`).expect(200);
    expect(await traces()).toEqual([{ outcome: "sent", planVersion: 1 }]);

    // 2. La révision : version 2 ; Jeanne a la version 1, dépassée.
    expect((await reviseQuantity(ctx, pro, 5)).status).toBe(200);
    await settle();
    const before = await ctx.asSub(STAFF).get(`${VERSIONS}/dispatches`).expect(200);
    const [jeanne] = before.body as readonly { recipientId: string }[];
    expect(jeanne).toBeDefined();
    sentMails.splice(0);

    // 3. Le renvoi ciblé : une demande, la trace à la version 2, le papier de la version 2 joint.
    const key = freshIntent();
    await resend({ target: "recipient", recipientId: jeanne?.recipientId }, key).expect(204);
    await settle();
    expect(await traces()).toEqual([
      { outcome: "sent", planVersion: 1 },
      { outcome: "requested", planVersion: 2 },
    ]);
    expect(sentMails.map((mail) => [mail.to, mail.template])).toEqual([
      ["jeanne@imprimerie.fr", "staff.production-dossier-updated"],
    ]);
    const stored = await ctx.app
      .get(ProductionDocumentStore)
      .readIfPresent(dayDossierPdfKey(SERVICE_DAY, await closedAt(), null, 2));
    expect(stored).not.toBeNull();
    expect(sentMails[0]?.data).toMatchObject({
      version: 2,
      sinceVersion: 1,
      pdfBase64: stored?.toString("base64"),
      fileName: `dossier-du-jour-${SERVICE_DAY}-version-2.pdf`,
    });

    // 4. Le rejeu de la même clé : rien de plus.
    await resend({ target: "recipient", recipientId: jeanne?.recipientId }, key).expect(204);
    await settle();
    expect(sentMails).toHaveLength(1);
    expect(await traces()).toHaveLength(2);

    // 5. La liste voit le renvoi comme dernier envoi, et Jeanne à jour.
    const after = await ctx.asSub(STAFF).get(`${VERSIONS}/dispatches`).expect(200);
    const [mark] = after.body as readonly {
      lastReceived: { planVersion: number | null } | null;
      lastAttempt: { planVersion: number | null; outcome: string } | null;
    }[];
    expect(mark?.lastReceived?.planVersion).toBe(2);
    expect(mark?.lastAttempt).toMatchObject({ planVersion: 2, outcome: "requested" });

    // 6. « Tous les dépassés » sans personne à servir : 204, aucun e-mail.
    await resend({ target: "outdated" }, freshIntent()).expect(204);
    await settle();
    expect(sentMails).toHaveLength(1);
    // Déjà à jour, visée seule : refusée en le disant.
    const upToDate = await resend(
      { target: "recipient", recipientId: jeanne?.recipientId },
      freshIntent(),
    );
    expect(upToDate.status).toBe(409);

    // 7. Le papier rangé de la version 1 : servi ; un papier non rangé : 404.
    const v1 = await ctx.asSub(STAFF).get(`${VERSIONS}/1/dossier.pdf`).expect(200);
    expect(v1.headers["content-type"]).toContain("application/pdf");
    await ctx.app
      .get(ProductionDocumentStore)
      .delete(productionCountPdfKey(SERVICE_DAY, await closedAt(), null, 1));
    await ctx.asSub(STAFF).get(`${VERSIONS}/1/compte-a-produire.pdf`).expect(404);
    await ctx.asSub(STAFF).get(`${VERSIONS}/9/dossier.pdf`).expect(404);
  });

  it("sans clé d'intention, le renvoi est refusé", async () => {
    await ctx.asSub(STAFF).post(`${VERSIONS}/resend`).send({ target: "outdated" }).expect(400);
  });
});
