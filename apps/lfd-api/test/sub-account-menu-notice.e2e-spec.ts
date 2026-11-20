/**
 * E2E : **l'avis au principal quand l'équipe change la carte d'un site**, et
 * le résumé de la carte sur la liste des sites (plan
 * `documentation/comptes-client/plan-carte-des-sites.md`, Q3, § 8 bis).
 *
 * - pose par l'équipe : le propriétaire et l'administrateur ACCEPTÉS du
 *   principal sont prévenus, interrupteur des avis coupé ou non ; ni
 *   `orders`, ni `billing`, ni l'invitée ;
 * - pose par le principal lui-même : personne ;
 * - un second clic de même intention : un seul e-mail ;
 * - la fiche du principal dit, site par site, la carte posée (mode,
 *   visibilité, nombre d'entrées).
 *
 * Doublées : la signature des jetons (le jeton EST le `sub`) et le mailer.
 */
import type { AdminCompanyFicheView, SubAccountMenuPayload } from "@lfd/contracts";

import { MAILER } from "../src/mail/templates/mailer.tokens.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";
import { mailOf, noticeScene, type NoticeScene } from "./sub-account-notice-scene.js";

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

const NO_PASTRY: SubAccountMenuPayload = {
  mode: "except",
  offMenu: "visible_locked",
  entries: [
    { level: "family", ref: "fam_patisserie", effect: "exclude" },
    { level: "sku", ref: "PAI-001-1", effect: "include" },
  ],
};

const notices = (): SentMail[] => mails.filter((mail) => mail.template === TEMPLATE);
const recipients = (sent: readonly SentMail[]): string[] => sent.map((mail) => mail.to).sort();

async function poseByTeam(s: NoticeScene, intent: string = freshIntent()): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .put(`/admin/companies/${s.site}/menu`)
    .set(INTENT_KEY, intent)
    .send(NO_PASTRY)
    .expect(204);
  await ctx.drain();
}

describe("l'équipe change la carte d'un site (Q3)", () => {
  it("prévient le propriétaire et l'administrateur du principal, avis coupés ou non", async () => {
    // Coupés : l'interrupteur règle ce que FONT les sites, pas un geste de l'équipe.
    const s = await noticeScene(ctx, false);

    await poseByTeam(s);

    const sent = notices();
    expect(recipients(sent)).toEqual(
      [mailOf(s.admin), mailOf(s.housekeeper), mailOf(s.owner)].sort(),
    );
    expect(sent[0]?.data).toEqual({
      gesture: "menu_changed",
      siteName: "Chalet Gentiane",
      reference: null,
      byTeam: true,
    });
  });

  it("un second clic de même intention n'envoie rien de plus", async () => {
    const s = await noticeScene(ctx);
    const intent = freshIntent();

    await poseByTeam(s, intent);
    await poseByTeam(s, intent);

    expect(notices().filter((mail) => mail.to === mailOf(s.owner))).toHaveLength(1);
  });

  it("le principal qui pose la carte lui-même ne reçoit rien", async () => {
    const s = await noticeScene(ctx);

    await ctx.asSub(s.owner).put(`/companies/${s.site}/menu`).send(NO_PASTRY).expect(204);
    await ctx.drain();

    expect(notices()).toEqual([]);
  });
});

describe("la liste des sites sur la fiche du principal", () => {
  it("résume la carte de chaque site, et `null` pour un site qui n'en a pas", async () => {
    const s = await noticeScene(ctx, false);
    const before = jsonBody<AdminCompanyFicheView>(
      await ctx.asSub(E2E_STAFF_SUB).get(`/admin/companies/${s.principal}`).expect(200),
    );
    expect(before.hierarchy.subAccounts.map((site) => site.menu)).toEqual([null]);

    await poseByTeam(s);

    const after = jsonBody<AdminCompanyFicheView>(
      await ctx.asSub(E2E_STAFF_SUB).get(`/admin/companies/${s.principal}`).expect(200),
    );
    expect(after.hierarchy.subAccounts.map((site) => site.menu)).toEqual([
      { mode: "except", offMenu: "visible_locked", entryCount: 2 },
    ]);
  });
});
