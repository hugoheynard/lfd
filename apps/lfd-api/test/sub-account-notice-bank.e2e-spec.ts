/**
 * E2E des **avis au principal sur le RIB et la preuve de mandat d'un site**
 * (plan `documentation/comptes-client/plan-notifications-sous-comptes.md`,
 * lot N4d).
 *
 * Ce que seul l'e2e prouve : les vraies routes, client et équipe, écrivent le
 * fait durable dans la transaction du RIB ou de la pièce ; ces gestes ne
 * prenaient aucun verrou sur la ligne du site, et `SitePrincipalLock` les
 * range désormais après un rattachement concurrent ; aucun mail ne porte une
 * donnée du compte.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et le courrier.
 */
import { Buffer } from "node:buffer";
import { setTimeout as sleep } from "node:timers/promises";

import { BANK_ACCOUNT_CHANGED } from "../src/b2b/account/domain/events/site-gesture.fact.js";
import { NotifyPrincipalOnBankAccountChanged } from "../src/b2b/sub-account-notices/application/handlers/notify-principal-on-bank-account-changed.handler.js";
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
const IBAN = "FR1420041010050500013M02606";
const RIB = {
  iban: IBAN,
  bic: "CEPAFRPP751",
  holder: "Refuge du Col SARL",
  line1: "12 rue des Alpages",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
};
const PDF = Buffer.from("%PDF-1.4\nmandat signé", "latin1");

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

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Une entité émettrice complète, sans quoi aucun mandat ne se frappe. */
async function declareIssuer(): Promise<void> {
  const response = await staff()
    .post("/admin/accounting/legal-entities")
    .send({
      name: "Crazeativity",
      legalForm: "SAS",
      siren: "900000001",
      rcs: "Chambéry",
      shareCapitalCents: 1_000_000,
      vatNumber: "",
      address: {
        line1: "Route de la Balme",
        line2: "",
        postalCode: "73150",
        city: "Val d'Isère",
        countryCode: "FR",
      },
    })
    .expect(201);
  const id = jsonBody<{ id: string }>(response).id;
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
    .send({ ics: "FR00ZZZ900001" })
    .expect(204);
  await staff()
    .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
    .send({ ...RIB, iban: "FR7630006000011234567890189", holder: "Crazeativity" })
    .expect(204);
}

async function ribAsSite(s: NoticeScene): Promise<void> {
  await ctx.asSub(s.housekeeper).put(`/companies/${s.site}/bank-account`).send(RIB).expect(204);
  await ctx.drain();
}

const notices = (): SentMail[] => mails.filter((mail) => mail.template === TEMPLATE);
const recipients = (sent: readonly SentMail[]): string[] => sent.map((mail) => mail.to).sort();
const gestureOf = (mail: SentMail): unknown => (mail.data as { readonly gesture: unknown }).gesture;

describe("le RIB d'un site", () => {
  it("geste client : owner et billing du principal — ni admin, ni orders, ni l'auteure ; rien du compte", async () => {
    const s = await noticeScene(ctx);

    await ribAsSite(s);

    const sent = notices();
    expect(recipients(sent)).toEqual([mailOf(s.billing), mailOf(s.owner)].sort());
    expect(sent[0]?.data).toEqual({
      gesture: "bank_account_changed",
      siteName: "Chalet Gentiane",
      reference: null,
      byTeam: false,
    });
    const written = JSON.stringify(sent);
    for (const secret of [IBAN, IBAN.slice(-4), RIB.holder, RIB.bic]) {
      expect(written).not.toContain(secret);
    }
  });

  it("geste de l'équipe : « notre équipe »", async () => {
    const s = await noticeScene(ctx);

    await staff().put(`/admin/companies/${s.site}/bank-account`).send(RIB).expect(204);
    await ctx.drain();

    const sent = notices();
    expect(recipients(sent)).toEqual([mailOf(s.billing), mailOf(s.owner)].sort());
    expect(sent.every((mail) => (mail.data as { byTeam: boolean }).byTeam)).toBe(true);
  });

  it("avis coupés : rien ; compte sans principal : rien", async () => {
    const off = await noticeScene(ctx, false);
    await ribAsSite(off);
    expect(notices()).toEqual([]);

    const lone = (await createCompany(ctx.prisma, { raisonSociale: "SAS Seule" })).id;
    const owner = await noticeMember(ctx, lone, CustomerRole.owner);
    await ctx.asSub(owner).put(`/companies/${lone}/bank-account`).send(RIB).expect(204);
    await ctx.drain();
    expect(notices()).toEqual([]);
  });

  it("une relivraison du même fait n'envoie aucun doublon (journal d'envoi)", async () => {
    const s = await noticeScene(ctx);
    await ribAsSite(s);
    const [row] = await ctx.prisma.outboxMessage.findMany({
      where: { type: BANK_ACCOUNT_CHANGED },
    });
    const before = notices().length;

    const subscriber = ctx.app.get(NotifyPrincipalOnBankAccountChanged, { strict: false });
    await ctx.app.get(UnitOfWork, { strict: false }).run(() =>
      subscriber.handle({
        eventId: row?.id ?? "",
        type: BANK_ACCOUNT_CHANGED,
        payload: recordOf(row?.payload),
      }),
    );

    expect(notices()).toHaveLength(before);
  });

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
        ctx.asSub(s.housekeeper).put(`/companies/${s.site}/bank-account`).send(RIB),
      );
      // Le geste part pendant que la ligne est tenue ; il attend le verrou.
      await sleep(400);
    });
    await gesture;
    await ctx.drain();

    const [row] = await ctx.prisma.outboxMessage.findMany({
      where: { type: BANK_ACCOUNT_CHANGED },
    });
    expect(recordOf(row?.payload)["principalCompanyId"]).toBe(other);
    expect(recipients(notices())).toEqual([mailOf(stranger)]);
  });
});

describe("la preuve de mandat d'un site", () => {
  it("dépôt client puis dépôt de l'équipe : deux avis nommés, sans nom de fichier", async () => {
    const s = await noticeScene(ctx);
    await declareIssuer();
    await staff().put("/admin/feature-access/customerMandate").send({ value: "open" }).expect(204);
    // Les mentions du papier : raison sociale du site, forme du titulaire.
    await ctx.prisma.company.update({
      where: { id: s.site },
      data: { raisonSociale: "SARL Chalet Gentiane" },
    });
    await ctx
      .asSub(s.housekeeper)
      .put(`/companies/${s.site}/bank-account`)
      .send({ ...RIB, holderLegalForm: "SARL" })
      .expect(204);
    await ctx.asSub(s.housekeeper).post(`/companies/${s.site}/mandate`).expect(200);
    mails.splice(0);

    await ctx
      .asSub(s.housekeeper)
      .put(`/companies/${s.site}/mandate/proof`)
      .attach("file", PDF, "scan-client.pdf")
      .expect(204);
    await staff()
      .put(`/admin/companies/${s.site}/mandate/proof`)
      .attach("file", PDF, "scan-equipe.pdf")
      .expect(204);
    await ctx.drain();

    const toOwner = notices().filter((mail) => mail.to === mailOf(s.owner));
    expect(toOwner.map(gestureOf)).toEqual(["mandate_proof_attached", "mandate_proof_attached"]);
    expect(toOwner.map((mail) => (mail.data as { byTeam: boolean }).byTeam)).toEqual([false, true]);
    expect(JSON.stringify(notices())).not.toContain("scan-");
  });
});
