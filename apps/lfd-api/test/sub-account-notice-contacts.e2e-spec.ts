/**
 * E2E des **avis au principal sur les contacts d'un site** (plan
 * `documentation/comptes-client/plan-notifications-sous-comptes.md`, lot N4c).
 *
 * Ce que seul l'e2e prouve : les vraies routes, client et équipe, écrivent le
 * fait durable dans leur transaction ; les contacts ne prenaient AUCUN verrou
 * sur la ligne du site, et c'est `SitePrincipalLock` qui range désormais le
 * geste après un rattachement concurrent ; aucun mail ne nomme le contact.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et le courrier.
 */
import { setTimeout as sleep } from "node:timers/promises";

import { CONTACT_ADDED } from "../src/b2b/account/domain/events/site-gesture.fact.js";
import { NotifyPrincipalOnContactAdded } from "../src/b2b/sub-account-notices/application/handlers/notify-principal-on-contact-added.handler.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
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

const CONTACT = {
  firstName: "Karim",
  lastName: "Benali",
  fonction: "Responsable achats",
  email: "karim.benali@chalet.test",
  phone: "06 12 88 54 30",
  role: "orders",
};

async function addAsSite(s: NoticeScene): Promise<string> {
  const response = await ctx
    .asSub(s.housekeeper)
    .post(`/companies/${s.site}/contacts`)
    .send(CONTACT)
    .expect(201);
  await ctx.drain();
  return jsonBody<{ id: string }>(response).id;
}

const notices = (): SentMail[] => mails.filter((mail) => mail.template === TEMPLATE);
const recipients = (sent: readonly SentMail[]): string[] => sent.map((mail) => mail.to).sort();
const gestureOf = (mail: SentMail): unknown => (mail.data as { readonly gesture: unknown }).gesture;

describe("les contacts d'un site", () => {
  it("geste client : owner et admin du principal — ni orders, ni billing, ni l'auteure, ni l'invitée ; personne n'est nommé", async () => {
    const s = await noticeScene(ctx);

    await addAsSite(s);

    const sent = notices();
    expect(recipients(sent)).toEqual([mailOf(s.admin), mailOf(s.owner)].sort());
    expect(sent[0]?.data).toEqual({
      gesture: "contact_added",
      siteName: "Chalet Gentiane",
      reference: null,
      byTeam: false,
    });
    const written = JSON.stringify(sent);
    for (const secret of [CONTACT.firstName, CONTACT.lastName, CONTACT.email, CONTACT.phone]) {
      expect(written).not.toContain(secret);
    }
  });

  it("modifier, retirer, changer le contact principal : un avis par geste, chacun nommé", async () => {
    const s = await noticeScene(ctx);
    const id = await addAsSite(s);
    const site = ctx.asSub(s.housekeeper);

    await site.patch(`/companies/${s.site}/contacts/${id}`).send(CONTACT).expect(200);
    await site.delete(`/companies/${s.site}/contacts/${id}`).expect(204);
    await site.patch(`/companies/${s.site}/contact`).send(CONTACT).expect(200);
    await ctx.drain();

    expect(
      notices()
        .filter((mail) => mail.to === mailOf(s.owner))
        .map(gestureOf),
    ).toEqual(["contact_added", "contact_updated", "contact_removed", "primary_contact_changed"]);
  });

  it("geste de l'équipe : « notre équipe », et la gouvernante est prévenue comme les autres", async () => {
    const s = await noticeScene(ctx);

    await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`/admin/companies/${s.site}/contacts`)
      .send(CONTACT)
      .expect(201);
    await ctx.drain();

    const sent = notices();
    expect(recipients(sent)).toEqual(
      [mailOf(s.admin), mailOf(s.owner), mailOf(s.housekeeper)].sort(),
    );
    expect(sent.every((mail) => (mail.data as { byTeam: boolean }).byTeam)).toBe(true);
  });

  it("un compte sans principal : aucun avis", async () => {
    const lone = (await createCompany(ctx.prisma, { raisonSociale: "SAS Seule" })).id;
    const owner = await noticeMember(ctx, lone, CustomerRole.owner);

    await ctx.asSub(owner).post(`/companies/${lone}/contacts`).send(CONTACT).expect(201);
    await ctx.drain();

    expect(notices()).toEqual([]);
  });

  it("une relivraison du même fait n'envoie aucun doublon (journal d'envoi)", async () => {
    const s = await noticeScene(ctx);
    await addAsSite(s);
    const [row] = await ctx.prisma.outboxMessage.findMany({ where: { type: CONTACT_ADDED } });
    const before = notices().length;

    const subscriber = ctx.app.get(NotifyPrincipalOnContactAdded, { strict: false });
    await ctx.app.get(UnitOfWork, { strict: false }).run(() =>
      subscriber.handle({
        eventId: row?.id ?? "",
        type: CONTACT_ADDED,
        payload: recordOf(row?.payload),
      }),
    );

    expect(notices()).toHaveLength(before);
  });

  /**
   * Le cas que `vitruve` a nommé : un contact n'écrit pas la ligne du site,
   * et rien ne l'aurait rangé après un rattachement en cours. Le geste
   * attend désormais le verrou, puis lit le principal VALIDÉ.
   */
  it("rattachement concurrent : le principal porté est celui lu sous le verrou", async () => {
    const s = await noticeScene(ctx);
    const other = (await createCompany(ctx.prisma, { raisonSociale: "SAS Autre Groupe" })).id;
    const stranger = await noticeMember(ctx, other, CustomerRole.owner);
    await enableNotices(ctx, other);

    let gesture: Promise<unknown> = Promise.resolve();
    await ctx.prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id: s.site }, data: { parentCompanyId: null } });
      await tx.company.update({ where: { id: s.site }, data: { parentCompanyId: other } });
      gesture = Promise.resolve(
        ctx.asSub(s.housekeeper).post(`/companies/${s.site}/contacts`).send(CONTACT),
      );
      // Le geste part pendant que la ligne est tenue ; il attend le verrou.
      await sleep(400);
    });
    await gesture;
    await ctx.drain();

    const [row] = await ctx.prisma.outboxMessage.findMany({ where: { type: CONTACT_ADDED } });
    expect(recordOf(row?.payload)["principalCompanyId"]).toBe(other);
    expect(recipients(notices())).toEqual([mailOf(stranger)]);
  });
});
