/**
 * E2E des **avis au principal sur les paniers récurrents d'un site** (plan
 * `documentation/comptes-client/plan-notifications-sous-comptes.md`, lot N4e).
 *
 * Ce que seul l'e2e prouve : la création lit la société de l'en-tête d'espace
 * et la copie sur le panier ; chaque geste écrit son fait durable dans sa
 * transaction ; le mur du rattachement actuel refuse un ancien membre ; une
 * seule ligne `subscription.created` au journal (la croissance), le fait
 * durable du même nom vivant dans la boîte d'envoi.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et le courrier.
 */
import { setTimeout as sleep } from "node:timers/promises";

import { PERSONAL_WORKSPACE, WORKSPACE_HEADER } from "@lfd/contracts";

import { SUBSCRIPTION_CREATED } from "../src/b2b/account/domain/events/site-gesture.fact.js";
import { NotifyPrincipalOnSubscriptionCreated } from "../src/b2b/sub-account-notices/application/handlers/notify-principal-on-subscription-created.handler.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";
import {
  enableNotices,
  mailOf,
  noticeMember,
  noticeScene,
  recordOf,
  type NoticeScene,
} from "./sub-account-notice-scene.js";

const TEMPLATE = "customer.sub-account-gesture";

interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly data: unknown;
}
const mails: SentMail[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    mails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: MAILER, value: recordingMailer }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  mails.splice(0);
});

const PANIER = {
  fromOrderId: null,
  recurrence: "weekly",
  startDate: "2026-08-10",
  endDate: null,
  fulfillmentMethod: "pickup",
  deliveryAddress: null,
  pickupAddressId: null,
  lines: [{ sku: "VIE-001", quantity: 3 }],
  note: "Le lundi, sonner chez Mme Durand",
};

/** La gouvernante est membre de deux sociétés : l'en-tête d'espace choisit. */
async function create(s: NoticeScene, workspace: string = s.site): Promise<string> {
  const response = await ctx
    .asSub(s.housekeeper)
    .post("/subscriptions")
    .set(WORKSPACE_HEADER, workspace)
    .send(PANIER)
    .expect(201);
  await ctx.drain();
  return jsonBody<{ id: string }>(response).id;
}

const notices = (): SentMail[] => mails.filter((mail) => mail.template === TEMPLATE);
const recipients = (sent: readonly SentMail[]): string[] => sent.map((mail) => mail.to).sort();
const gestureOf = (mail: SentMail): unknown => (mail.data as { readonly gesture: unknown }).gesture;

describe("un panier récurrent créé dans l'espace d'un site", () => {
  it("porte la société ; owner, admin, orders du principal sont prévenus, sans rien du panier", async () => {
    const s = await noticeScene(ctx);

    const id = await create(s);

    const row = await ctx.prisma.subscription.findUniqueOrThrow({ where: { id } });
    expect(row.companyId).toBe(s.site);
    expect(recipients(notices())).toEqual(
      [mailOf(s.admin), mailOf(s.orders), mailOf(s.owner)].sort(),
    );
    expect(notices()[0]?.data).toEqual({
      gesture: "subscription_created",
      siteName: "Chalet Gentiane",
      reference: null,
      byTeam: false,
    });
    const written = JSON.stringify(notices());
    expect(written).not.toContain("VIE-001");
    expect(written).not.toContain("Durand");
  });

  it("une seule ligne `subscription.created` au journal — la croissance, pas le fait durable", async () => {
    const s = await noticeScene(ctx);
    await create(s);

    expect(await ctx.prisma.activityEvent.count({ where: { type: "subscription.created" } })).toBe(
      1,
    );
    expect(await ctx.prisma.outboxMessage.count({ where: { type: SUBSCRIPTION_CREATED } })).toBe(1);
  });

  it("en perso : société nulle, aucun avis", async () => {
    const s = await noticeScene(ctx);
    const id = await create(s, PERSONAL_WORKSPACE);

    expect((await ctx.prisma.subscription.findUniqueOrThrow({ where: { id } })).companyId).toBe(
      null,
    );
    expect(notices()).toEqual([]);
  });

  it("pause, reprise, arrêt : un avis chacun, nommé", async () => {
    const s = await noticeScene(ctx);
    const id = await create(s);
    const site = ctx.asSub(s.housekeeper);

    await site.patch(`/subscriptions/${id}/status`).send({ status: "paused" }).expect(204);
    await site.patch(`/subscriptions/${id}/status`).send({ status: "active" }).expect(204);
    await site.delete(`/subscriptions/${id}`).expect(204);
    await ctx.drain();

    expect(
      notices()
        .filter((mail) => mail.to === mailOf(s.owner))
        .map(gestureOf),
    ).toEqual([
      "subscription_created",
      "subscription_paused",
      "subscription_resumed",
      "subscription_stopped",
    ]);
  });

  it("une échéance dérogée ne prévient pas", async () => {
    const s = await noticeScene(ctx);
    const id = await create(s);
    const before = notices().length;

    await ctx
      .asSub(s.housekeeper)
      .put(`/subscriptions/${id}/occurrences/2026-08-17`)
      .send({ skipped: true })
      .expect(204);
    await ctx.drain();

    expect(notices()).toHaveLength(before);
  });

  it("avis coupés : rien", async () => {
    const s = await noticeScene(ctx, false);
    await create(s);
    expect(notices()).toEqual([]);
  });

  it("une relivraison du même fait n'envoie aucun doublon (journal d'envoi)", async () => {
    const s = await noticeScene(ctx);
    await create(s);
    const [row] = await ctx.prisma.outboxMessage.findMany({
      where: { type: SUBSCRIPTION_CREATED },
    });
    const before = notices().length;

    const subscriber = ctx.app.get(NotifyPrincipalOnSubscriptionCreated, { strict: false });
    await ctx.app.get(UnitOfWork, { strict: false }).run(() =>
      subscriber.handle({
        eventId: row?.id ?? "",
        type: SUBSCRIPTION_CREATED,
        payload: recordOf(row?.payload),
      }),
    );

    expect(notices()).toHaveLength(before);
  });
});

/** Le trou du mur : une personne qui a quitté la société gardait la main sur le panier du site. */
describe("le mur du rattachement actuel", () => {
  it("un ancien membre du site est refusé, nommément ; un membre actuel passe", async () => {
    const s = await noticeScene(ctx);
    const id = await create(s);
    const housekeeper = await ctx.prisma.user.findUniqueOrThrow({
      where: { auth0Sub: s.housekeeper },
    });

    await ctx
      .asSub(s.housekeeper)
      .patch(`/subscriptions/${id}/status`)
      .send({
        status: "paused",
      })
      .expect(204);

    await ctx.prisma.membership.deleteMany({
      where: { userId: housekeeper.id, companyId: s.site },
    });
    const refused = await ctx
      .asSub(s.housekeeper)
      .patch(`/subscriptions/${id}/status`)
      .send({ status: "active" })
      .expect(403);
    expect(JSON.stringify(refused.body)).toContain(
      "Vous n'êtes plus membre de Chalet Gentiane : cet abonnement ne se gère plus depuis votre compte.",
    );
    await ctx.asSub(s.housekeeper).delete(`/subscriptions/${id}`).expect(403);
    expect(await ctx.prisma.subscription.count({ where: { id } })).toBe(1);
  });
});

describe("rattachement concurrent", () => {
  it("le principal porté par l'arrêt est celui lu sous le verrou", async () => {
    const s = await noticeScene(ctx);
    const id = await create(s);
    const other = (await createCompany(ctx.prisma, { raisonSociale: "SAS Autre Groupe" })).id;
    const stranger = await noticeMember(ctx, other, CustomerRole.owner);
    await enableNotices(ctx, other);
    mails.splice(0);

    let gesture: Promise<unknown> = Promise.resolve();
    await ctx.prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id: s.site }, data: { parentCompanyId: null } });
      await tx.company.update({ where: { id: s.site }, data: { parentCompanyId: other } });
      gesture = Promise.resolve(ctx.asSub(s.housekeeper).delete(`/subscriptions/${id}`));
      // Le geste part pendant que la ligne est tenue ; il attend le verrou.
      await sleep(400);
    });
    await gesture;
    await ctx.drain();

    expect(recipients(notices())).toEqual([mailOf(stranger)]);
  });
});
