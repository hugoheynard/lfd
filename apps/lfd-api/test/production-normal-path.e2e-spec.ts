/**
 * E2E du **parcours normal du plan** (`documentation/fournil/plan-historique-des-tirages.md`,
 * § 2 bis) : arrêter, télécharger le dossier, l'envoyer, recevoir une commande
 * hors plan de l'équipe, retirer, retélécharger, renvoyer — sans réouverture.
 *
 * Il tient ce que les versions du plan ne doivent pas changer : le statut des
 * routes, le nombre de commandes au plan, le compte à produire, et les e-mails
 * partis (destinataires, nombre). Il ne lit ni le nom du fichier rangé ni
 * l'en-tête du PDF : la version les change, et c'est voulu.
 */
import { Buffer } from "node:buffer";

import { MAILER } from "../src/mail/templates/mailer.tokens.js";
import { ProductionDayRepository } from "../src/production/day/domain/ports/production-day.repository.js";
import { ServiceDay } from "../src/production/day/domain/value-objects/service-day.value-object.js";
import { SEND_DOSSIER_ON_DAY_CLOSED } from "../src/production/plan/application/handlers/send-dossier-on-day-closed.handler.js";
import { SEND_DOSSIER_ON_DAY_RETAKEN } from "../src/production/plan/application/handlers/send-dossier-on-day-retaken.handler.js";
import { daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  place,
  relayGate,
} from "./production-day-fixture.js";
import { placeLateByStaff } from "./staff-late-order.js";

interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly data: { readonly completed?: boolean; readonly orderCount?: number };
}
const sentMails: SentMail[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    sentMails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

const RECIPIENTS = "/admin/production/settings/dossier-recipients";
const DOSSIER = `/admin/production/batch/${SERVICE_DAY}/dossier.pdf`;

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay([{ token: MAILER, value: recordingMailer }]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
  sentMails.splice(0);
});

/** Vide la file, en rejouant l'envoi du dossier passé avant ses bons de livraison. */
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

/** Télécharge le dossier : 200, et un PDF. */
async function downloadDossier(): Promise<void> {
  const response = await ctx
    .asSub(STAFF)
    .get(DOSSIER)
    .buffer()
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        callback(null, Buffer.concat(chunks));
      });
    })
    .expect(200);
  const body = Buffer.isBuffer(response.body) ? response.body : Buffer.alloc(0);
  expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
}

async function planOrderCount(): Promise<number> {
  return ctx.prisma.productionOrder.count({ where: { serviceDay: SERVICE_DAY } });
}

async function croissantCount(): Promise<number | undefined> {
  const count = await ctx.prisma.productionCount.findUnique({
    where: { serviceDay_sku: { serviceDay: SERVICE_DAY, sku: CROISSANT } },
    select: { quantity: true },
  });
  return count?.quantity;
}

function dossierMails(): readonly SentMail[] {
  return sentMails.filter((mail) => mail.template === "staff.production-dossier");
}

describe("le parcours normal du plan (§ 2 bis)", () => {
  it("arrêt → dossier → e-mail → hors plan → retirage → dossier → e-mail, inchangés", async () => {
    for (const email of ["jeanne@imprimerie.fr", "paul@fournil.fr"]) {
      await ctx
        .asSub(STAFF)
        .post(RECIPIENTS)
        .send({ kind: "external", email, firstName: "Fournil", lastName: "Fournil" })
        .expect(201);
    }
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);

    const closed = await ctx
      .asSub(STAFF)
      .post(`/admin/production/batch/${SERVICE_DAY}/close`)
      .expect(201);
    expect(jsonBody<{ absorbed: number; alreadyClosed: boolean }>(closed)).toMatchObject({
      absorbed: 1,
      alreadyClosed: false,
    });
    await settle();
    await downloadDossier();
    expect(await planOrderCount()).toBe(1);
    expect(await croissantCount()).toBe(12);
    expect(
      dossierMails()
        .map((mail) => mail.to)
        .sort(),
    ).toEqual(["jeanne@imprimerie.fr", "paul@fournil.fr"]);
    expect(dossierMails().map((mail) => [mail.data.completed, mail.data.orderCount])).toEqual([
      [false, 1],
      [false, 1],
    ]);

    await placeLateByStaff(ctx, SERVICE_DAY, [{ sku: CROISSANT, quantity: 4 }]);
    const retaken = await ctx
      .asSub(STAFF)
      .post(`/admin/production/worksheet/${SERVICE_DAY}/retake`)
      .expect(201);
    expect(jsonBody<{ absorbed: number }>(retaken).absorbed).toBe(1);
    await settle();
    await downloadDossier();

    expect(await planOrderCount()).toBe(2);
    expect(await croissantCount()).toBe(16);
    const afterRetake = dossierMails().slice(2);
    expect(afterRetake.map((mail) => mail.to).sort()).toEqual([
      "jeanne@imprimerie.fr",
      "paul@fournil.fr",
    ]);
    expect(afterRetake.map((mail) => [mail.data.completed, mail.data.orderCount])).toEqual([
      [true, 2],
      [true, 2],
    ]);
    expect(dossierMails()).toHaveLength(4);

    // Le fournil sait laquelle est arrivée hors plan (§ 1.8, lot H0).
    const day = await ctx.app.get(ProductionDayRepository).load(ServiceDay.of(SERVICE_DAY));
    expect(day.orders.map((order) => order.offPlan).sort()).toEqual([false, true]);
  });
});
