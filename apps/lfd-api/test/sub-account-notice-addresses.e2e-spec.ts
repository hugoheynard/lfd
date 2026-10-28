/**
 * E2E des **avis au principal sur le carnet de livraison d'un site** (plan
 * `documentation/comptes-client/plan-notifications-sous-comptes.md`, lot N4b).
 *
 * Ce que seul l'e2e prouve : les vraies routes, client et équipe, écrivent le
 * fait durable dans la transaction du carnet ; le relais le livre ; le
 * principal porté est celui lu SOUS le verrou de la ligne du site — un
 * rattachement concurrent passe entièrement avant le geste ; le journal
 * d'envoi arrête une relivraison.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et le courrier.
 */
import { setTimeout as sleep } from "node:timers/promises";

import type { BillingAddressPayload, DeliveryAddressPayload } from "@lfd/contracts";

import { DELIVERY_ADDRESS_ADDED } from "../src/b2b/account/domain/events/site-gesture.fact.js";
import { NotifyPrincipalOnDeliveryAddressAdded } from "../src/b2b/sub-account-notices/application/handlers/notify-principal-on-delivery-address-added.handler.js";
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

const POSTAL: BillingAddressPayload = {
  label: "Réserve du chalet",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

const ADDRESS: DeliveryAddressPayload = {
  ...POSTAL,
  isDefault: false,
  specs: {
    signatureRequired: null,
    note: "",
    slotList: { mode: "everyday", slots: [] },
    deliveryContact: null,
    gps: null,
  },
};

async function addAsSite(s: NoticeScene): Promise<string> {
  const response = await ctx
    .asSub(s.housekeeper)
    .post(`/companies/${s.site}/delivery-addresses`)
    .send(ADDRESS)
    .expect(201);
  await ctx.drain();
  return jsonBody<{ id: string }>(response).id;
}

const notices = (): SentMail[] => mails.filter((mail) => mail.template === TEMPLATE);
const recipients = (sent: readonly SentMail[]): string[] => sent.map((mail) => mail.to).sort();
const gestureOf = (mail: SentMail | undefined): unknown =>
  (mail?.data as { readonly gesture?: unknown } | undefined)?.gesture;

describe("le carnet de livraison d'un site", () => {
  it("geste client : owner et admin du principal — ni orders, ni billing, ni l'auteure, ni l'invitée ; rien de l'adresse", async () => {
    const s = await noticeScene(ctx);

    await addAsSite(s);

    const sent = notices();
    expect(recipients(sent)).toEqual([mailOf(s.admin), mailOf(s.owner)].sort());
    expect(sent[0]?.data).toEqual({
      gesture: "delivery_address_added",
      siteName: "Chalet Gentiane",
      reference: null,
      byTeam: false,
    });
    const written = JSON.stringify(sent);
    for (const secret of [POSTAL.label, POSTAL.ligne1, POSTAL.ville, POSTAL.codePostal]) {
      expect(written).not.toContain(secret);
    }
  });

  it("modifier, mettre par défaut, retirer : un avis par geste, chacun nommé", async () => {
    const s = await noticeScene(ctx);
    const id = await addAsSite(s);
    const site = ctx.asSub(s.housekeeper);

    // Régression : les avis partent en tâche de fond ; vidés une seule fois à la
    // fin, ils arrivaient parfois dans le désordre (CI du 2026-10-28). Chaque
    // geste attend son avis : l'ordre attendu est celui des gestes.
    await ctx.drain();
    await site.patch(`/companies/${s.site}/delivery-addresses/${id}`).send(ADDRESS).expect(204);
    await ctx.drain();
    await site.patch(`/companies/${s.site}/delivery-addresses/${id}/default`).expect(204);
    await ctx.drain();
    await site.delete(`/companies/${s.site}/delivery-addresses/${id}`).expect(204);
    await ctx.drain();

    const toOwner = notices().filter((mail) => mail.to === mailOf(s.owner));
    expect(toOwner.map(gestureOf)).toEqual([
      "delivery_address_added",
      "delivery_address_updated",
      "default_delivery_set",
      "delivery_address_removed",
    ]);
  });

  it("geste de l'équipe : « notre équipe », et la gouvernante est prévenue comme les autres", async () => {
    const s = await noticeScene(ctx);

    await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`/admin/companies/${s.site}/delivery-addresses`)
      .send(ADDRESS)
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

    await ctx.asSub(owner).post(`/companies/${lone}/delivery-addresses`).send(ADDRESS).expect(201);
    await ctx.drain();

    expect(notices()).toEqual([]);
  });

  it("une relivraison du même fait n'envoie aucun doublon (journal d'envoi)", async () => {
    const s = await noticeScene(ctx);
    await addAsSite(s);
    const [row] = await ctx.prisma.outboxMessage.findMany({
      where: { type: DELIVERY_ADDRESS_ADDED },
    });
    const before = notices().length;

    const subscriber = ctx.app.get(NotifyPrincipalOnDeliveryAddressAdded, { strict: false });
    await ctx.app.get(UnitOfWork, { strict: false }).run(() =>
      subscriber.handle({
        eventId: row?.id ?? "",
        type: DELIVERY_ADDRESS_ADDED,
        payload: recordOf(row?.payload),
      }),
    );

    expect(notices()).toHaveLength(before);
  });

  /**
   * Un rattachement à un autre principal tient la ligne du site pendant que
   * le site ajoute une adresse : le geste attend le verrou, puis lit le
   * principal VALIDÉ — c'est le nouveau qui est prévenu, jamais un principal
   * que la base ne porte plus.
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
        ctx.asSub(s.housekeeper).post(`/companies/${s.site}/delivery-addresses`).send(ADDRESS),
      );
      // Le geste part pendant que la ligne est tenue ; il attend le verrou.
      await sleep(400);
    });
    await gesture;
    await ctx.drain();

    const [row] = await ctx.prisma.outboxMessage.findMany({
      where: { type: DELIVERY_ADDRESS_ADDED },
    });
    expect(recordOf(row?.payload)["principalCompanyId"]).toBe(other);
    expect(recipients(notices())).toEqual([mailOf(stranger)]);
  });
});
