/**
 * E2E de **l'envoi du dossier du jour** (plan
 * `documentation/production/dossier-prod-du-jour.md`, décision 2, lot E3).
 *
 * Ce que seul l'e2e prouve : le câblage des deux abonnés durables par la
 * boîte d'envoi réelle, la trace d'envoi dans le schéma `production`, et le
 * PDF fabriqué depuis ce que la journée a figé. Seul le mailer est doublé —
 * on n'écrit à personne depuis un test.
 */
import { Buffer } from "node:buffer";

import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  place,
  retake,
} from "./production-day-fixture.js";

interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly idempotencyKey?: string;
  readonly data: {
    readonly completed?: boolean;
    readonly orderCount?: number;
    readonly firstName?: string;
    readonly arrestedBy?: string;
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

const RECIPIENTS = "/admin/production/settings/dossier-recipients";

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

async function addExternal(email: string, firstName: string): Promise<void> {
  await ctx
    .asSub(STAFF)
    .post(RECIPIENTS)
    .send({ kind: "external", email, firstName, lastName: "Fournil" })
    .expect(201);
}

function dossiers(): readonly SentMail[] {
  return sentMails.filter((mail) => mail.template === "staff.production-dossier");
}

describe("l'envoi du dossier du jour (E3)", () => {
  it("l'arrêt écrit à chaque destinataire, le PDF du jour joint, et le journalise", async () => {
    await addExternal("jeanne@imprimerie.fr", "Jeanne");
    await addExternal("paul@fournil.fr", "Paul");
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);

    await closePlan(ctx);
    await ctx.drain();

    expect(
      dossiers()
        .map((mail) => mail.to)
        .sort(),
    ).toEqual(["jeanne@imprimerie.fr", "paul@fournil.fr"]);
    for (const mail of dossiers()) {
      expect(mail.data.completed).toBe(false);
      expect(mail.data.fileName).toBe(`dossier-du-jour-${SERVICE_DAY}.pdf`);
      const pdf = Buffer.from(mail.data.pdfBase64 ?? "", "base64");
      expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    }
    expect(
      await ctx.prisma.productionDossierDispatch.count({
        where: { serviceDay: SERVICE_DAY, outcome: "sent" },
      }),
    ).toBe(2);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "production_day.dossier_sent" },
      select: { payload: true },
    });
    expect(facts.map((fact) => fact.payload)).toEqual([
      { subjectLabel: SERVICE_DAY, serviceDay: SERVICE_DAY, sent: 2, failed: 0, completed: false },
    ]);
  });

  it("dit qui a arrêté le plan — le nom figé à l'arrêt — et salue un externe sans nom tout court", async () => {
    await ctx
      .asSub(STAFF)
      .post(RECIPIENTS)
      .send({ kind: "external", email: "imprimerie@x.test" })
      .expect(201);
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);

    await closePlan(ctx);
    await ctx.drain();

    expect(dossiers().map((mail) => mail.data)).toMatchObject([
      { firstName: "", arrestedBy: "par Opérateur E2E" },
    ]);
    const day = await ctx.prisma.productionDay.findUnique({ where: { serviceDay: SERVICE_DAY } });
    expect(day?.closedByName).toBe("Opérateur E2E");
  });

  it("un retirage qui absorbe renvoie le dossier « complété » à chacun", async () => {
    await addExternal("jeanne@imprimerie.fr", "Jeanne");
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);
    await ctx.drain();
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);

    await retake(ctx);
    await ctx.drain();

    expect(dossiers().map((mail) => [mail.data.completed, mail.data.orderCount])).toEqual([
      [false, 1],
      [true, 2],
    ]);
  });

  it("un retirage à zéro absorbé ne renvoie rien", async () => {
    await addExternal("jeanne@imprimerie.fr", "Jeanne");
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);
    await ctx.drain();

    const response = await ctx
      .asSub(STAFF)
      .post(`/admin/production/worksheet/${SERVICE_DAY}/retake`)
      .expect(201);
    await ctx.drain();

    expect(jsonBody<{ absorbed: number }>(response).absorbed).toBe(0);
    expect(dossiers()).toHaveLength(1);
    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "production.day_retaken" } }),
    ).toBe(0);
  });

  it("sans destinataire, l'arrêt n'écrit à personne", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);
    await ctx.drain();

    expect(dossiers()).toEqual([]);
  });
});
