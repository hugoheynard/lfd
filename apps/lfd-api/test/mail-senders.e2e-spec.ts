/**
 * E2E de **l'identité d'envoi des espaces** (plan
 * `documentation/editeur-de-contenu/plan-editeur-par-blocs.md`, § 25, lot
 * C3) : la marque d'une demande est l'espace de son modèle ; la page lit
 * l'identité (ou dit le repli) ; l'enregistrement refuse un domaine non
 * vérifié, envoie un essai à l'auteur sous la nouvelle identité, n'enregistre
 * rien si l'essai est refusé ; l'envoi suivant de l'espace part sous elle ;
 * la sonde de déploiement l'éprouve.
 *
 * Resend est doublé deux fois : le transport (`MAIL_TRANSPORT`, sous le texte
 * effectif, qui retient l'expéditeur) et la liste des domaines
 * (`VerifiedSendingDomains`). Le reste est le vrai chemin.
 */
import type { MailSenderView } from "@lfd/mail-blocks";
import type { Mailer, MailReceipt, SendMailArgs } from "@lfd/mailer";
import { MailerSendError } from "@lfd/mailer";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { VerifiedSendingDomains } from "../src/mail/senders/domain/ports/verified-sending-domains.js";
import type { B2bMails } from "../src/mail/templates/mail-templates.js";
import { MAIL_TRANSPORT, MAILER, type B2bMailer } from "../src/mail/templates/mailer.tokens.js";
import {
  bootstrapE2e,
  E2E_STAFF_EMAIL,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** Le transport doublé : il retient l'expéditeur de chaque envoi, ou refuse. */
class SenderRecordingTransport implements Mailer<B2bMails> {
  readonly enabled = true;
  readonly sent: {
    template: string;
    to: string;
    from: string | undefined;
    replyTo: string | undefined;
  }[] = [];
  refuse = false;

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    if (this.refuse) {
      return Promise.reject(new MailerSendError("Resend a refusé l'envoi : domaine refusé."));
    }
    this.sent.push({
      template: String(args.template),
      to: args.to,
      from: args.from,
      replyTo: args.replyTo,
    });
    return Promise.resolve({ providerId: `re_${String(this.sent.length)}` });
  }
}

/** Les domaines de Resend, doublés. */
class FixedDomains extends VerifiedSendingDomains {
  domains: readonly string[] = ["lafoliecoffee.info", "lfd-backoffice.test"];
  verified(): Promise<readonly string[]> {
    return Promise.resolve(this.domains);
  }
}

const transport = new SenderRecordingTransport();
const domains = new FixedDomains();
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MAIL_TRANSPORT, value: transport },
      { token: VerifiedSendingDomains, value: domains },
    ],
  });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  transport.sent.length = 0;
  transport.refuse = false;
  domains.domains = ["lafoliecoffee.info", "lfd-backoffice.test"];
});

const SENDERS = "/admin/mail-senders";
const LFD = {
  senderName: "La Folie Douce",
  fromAddress: "no-reply@lfd-backoffice.test",
  replyToAddress: null,
};
const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function change(space: string, expectedRevision = 0) {
  return staff()
    .put(`${SENDERS}/${space}`)
    .set(INTENT_KEY, freshIntent())
    .send({ identity: LFD, expectedRevision });
}

async function sendRestored(): Promise<void> {
  await ctx.app.get<B2bMailer>(MAILER).send({
    to: "ada@exemple.invalid",
    template: "staff.access-restored",
    data: { firstName: "Ada", backOfficeUrl: "https://bo.lfd.test" },
  });
}

describe("l'identité d'envoi d'un espace (C3)", () => {
  it("un espace jamais réglé dit son repli et les domaines vérifiés, sans rien écrire", async () => {
    const view = jsonBody<MailSenderView>(await staff().get(`${SENDERS}/lfd`).expect(200));
    expect(view).toMatchObject({
      space: "lfd",
      identity: null,
      revision: 0,
      changed: null,
      verifiedDomains: ["lafoliecoffee.info", "lfd-backoffice.test"],
    });
    expect(view.fallback.fromAddress).not.toBe("");
    expect(await ctx.prisma.mailSenderIdentity.count()).toBe(0);
  });

  it("refuse un espace qui n'existe pas (404), `internal` compris", async () => {
    await staff().get(`${SENDERS}/internal`).expect(404);
  });

  it("exige la clé d'intention de l'écran", async () => {
    await staff().put(`${SENDERS}/lfd`).send({ identity: LFD, expectedRevision: 0 }).expect(400);
  });

  it("refuse nommément un domaine non vérifié (409) : aucun essai, rien d'enregistré", async () => {
    domains.domains = ["lafoliecoffee.info"];
    const response = await change("lfd");
    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).toContain(
      "lfd-backoffice.test n'est pas vérifié chez Resend",
    );
    expect(transport.sent).toEqual([]);
    expect(await ctx.prisma.mailSenderIdentity.count()).toBe(0);
  });

  it("un essai refusé par Resend n'enregistre rien (409)", async () => {
    transport.refuse = true;
    expect((await change("lfd")).status).toBe(409);
    expect(await ctx.prisma.mailSenderIdentity.count()).toBe(0);
  });

  it("envoie l'essai à l'auteur sous l'identité, l'enregistre, et l'espace envoie ensuite sous elle", async () => {
    await change("lfd").then((response) => expect(response.status).toBe(204));

    expect(transport.sent).toEqual([
      {
        template: "ops.deploy-check",
        to: E2E_STAFF_EMAIL,
        from: '"La Folie Douce" <no-reply@lfd-backoffice.test>',
        replyTo: "no-reply@lfd-backoffice.test",
      },
    ]);
    const view = jsonBody<MailSenderView>(await staff().get(`${SENDERS}/lfd`).expect(200));
    expect(view).toMatchObject({ identity: LFD, revision: 1 });
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "mail_copy.sender_changed" },
    });
    expect(fact.payload).toMatchObject({ space: "lfd", fromDomain: "lfd-backoffice.test" });

    transport.sent.length = 0;
    await sendRestored();
    expect(transport.sent[0]?.from).toBe('"La Folie Douce" <no-reply@lfd-backoffice.test>');
  });

  it("refuse une révision dépassée (409)", async () => {
    await change("lfd").then((response) => expect(response.status).toBe(204));
    expect((await change("lfd", 0)).status).toBe(409);
  });

  it("un e-mail de l'équipe est rangé sous la marque de son espace, `lfd`", async () => {
    await ctx
      .http()
      .post("/admin/ops/mail-check")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
    const brands = await ctx.prisma.mailRequest.findMany({ select: { brand: true } });
    expect(new Set(brands.map((row) => row.brand))).toEqual(new Set(["lfd"]));
  });

  it("la sonde de déploiement éprouve l'identité de chaque espace qui en a une", async () => {
    await change("lfc").then((response) => expect(response.status).toBe(204));
    transport.sent.length = 0;

    const body = jsonBody<{ senderSpaces: string[] }>(
      await ctx
        .http()
        .post("/admin/ops/mail-check")
        .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
        .expect(200),
    );

    expect(body.senderSpaces).toEqual(["lfc"]);
    expect(transport.sent.map((sent) => sent.from)).toContain(
      '"La Folie Douce" <no-reply@lfd-backoffice.test>',
    );
  });
});
