import { MarketingConsent } from "../../src/mail/channels/marketing/marketing-consent.js";
import { MailRequest } from "../../src/mail/requests/domain/entities/mail-request.js";
import { MailRequestRepository } from "../../src/mail/requests/domain/ports/mail-request.repository.js";
import type { E2eContext } from "../e2e-harness.js";
import { routeKey, STAFF, type ReplayWorld, type ScenarioSet } from "./scenario.js";

const ADDRESS = "colette@halles.test";
const SENDS = "/admin/mail/sends";
const PREFERENCES = "/admin/mail/preferences";
const MINUTE = 60_000;
const IDENTITY = {
  senderName: "La Folie Douce",
  fromAddress: "no-reply@lfd-backoffice.test",
  replyToAddress: "support@lfd-backoffice.test",
};

/** Un envoi accepté, rangé par le dépôt du bloc. */
async function sentMail({ ctx, clock }: ReplayWorld): Promise<string> {
  const at = new Date(clock.now().getTime() - MINUTE);
  const request = MailRequest.request({
    id: "send_replay",
    template: "customer.access-opened",
    brand: "lfc",
    recipient: ADDRESS,
    locale: "fr",
    idempotencyKey: "e2e:send_replay",
    requestedAt: at,
  });
  request.markSent("re_send_replay", at, 2);
  await ctx.app.get(MailRequestRepository).save(request);
  return "send_replay";
}

/** Un accord marketing donné, par la porte du bloc. */
async function acceptedPreference(ctx: E2eContext): Promise<string> {
  await ctx.app.get(MarketingConsent).request("lfc", ADDRESS, {
    textVersion: "society.v1",
    locale: "fr",
    where: "order",
    ref: "order_e2e",
    verified: true,
  });
  const row = await ctx.prisma.mailMarketingPreference.findFirstOrThrow({
    where: { recipientKey: ADDRESS },
    select: { id: true },
  });
  return row.id;
}

/** Les e-mails : expéditeurs, essais, recherches et révélations d'adresse. */
export const MAIL_SCENARIOS: ScenarioSet = {
  [routeKey("mail/copy/http/admin-mail-copy.controller.ts", "trial")]: () =>
    Promise.resolve({
      sub: STAFF,
      path: "/admin/mail-copy/trials",
      body: { mail: "customer.access-opened", locale: "fr", source: "published" },
    }),

  [routeKey("mail/senders/http/admin-mail-senders.controller.ts", "change")]: () =>
    Promise.resolve({
      sub: STAFF,
      path: "/admin/mail-senders/lfd",
      body: { identity: IDENTITY, expectedRevision: 0 },
    }),

  [routeKey("mail/senders/http/admin-mail-senders.controller.ts", "changeOfNature")]: () =>
    Promise.resolve({
      sub: STAFF,
      path: "/admin/mail-senders/lfd/transactional",
      body: { identity: IDENTITY, expectedRevision: 0 },
    }),

  [routeKey("mail/sends/http/admin-mail-sends.controller.ts", "search")]: async (world) => {
    await sentMail(world);
    return { sub: STAFF, path: `${SENDS}/searches`, body: { address: ADDRESS } };
  },

  [routeKey("mail/sends/http/admin-mail-sends.controller.ts", "reveal")]: async (world) => ({
    sub: STAFF,
    path: `${SENDS}/${await sentMail(world)}/recipient-reveal`,
  }),

  [routeKey("mail/marketing/http/admin-marketing-preferences.controller.ts", "search")]: async ({
    ctx,
  }) => {
    await acceptedPreference(ctx);
    return { sub: STAFF, path: `${PREFERENCES}/searches`, body: { address: ADDRESS } };
  },

  [routeKey("mail/marketing/http/admin-marketing-preferences.controller.ts", "reveal")]: async ({
    ctx,
  }) => ({
    sub: STAFF,
    path: `${PREFERENCES}/${await acceptedPreference(ctx)}/recipient-reveal`,
  }),
};
