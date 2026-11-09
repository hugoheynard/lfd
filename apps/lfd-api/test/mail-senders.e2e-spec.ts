/**
 * E2E de **l'identité d'envoi des espaces** (plan
 * `documentation/mail/plan-editeur-par-blocs.md`, § 25, lot
 * C3) : la marque d'une demande est l'espace de son modèle ; la page lit
 * l'identité (ou dit le repli) ; l'enregistrement refuse un domaine non
 * vérifié, envoie un essai à l'auteur sous la nouvelle identité, n'enregistre
 * rien si l'essai est refusé ; l'envoi suivant de l'espace part sous elle ;
 * la sonde de déploiement l'éprouve. Lot U5 du plan
 * `la-desinscription-et-l-accord.md` : l'identité marketing se règle à part,
 * et se replie sur la transactionnelle tant qu'elle ne l'est pas.
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
  replyToAddress: "support@lfd-backoffice.test",
};
const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function change(space: string, expectedRevision = 0, nature?: string) {
  return staff()
    .put(nature === undefined ? `${SENDERS}/${space}` : `${SENDERS}/${space}/${nature}`)
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

  /** Décision du 2026-11-07 : les réponses à une identité sans adresse lue étaient perdues. */
  it("refuse nommément une identité sans adresse de réponse, ou en no-reply (400) : rien d'enregistré", async () => {
    for (const replyToAddress of [null, "no-reply@lfd-backoffice.test"]) {
      const response = await staff()
        .put(`${SENDERS}/lfd`)
        .set(INTENT_KEY, freshIntent())
        .send({ identity: { ...LFD, replyToAddress }, expectedRevision: 0 });
      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain(
        "Les réponses à vos e-mails seraient perdues",
      );
    }
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
        replyTo: "support@lfd-backoffice.test",
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

describe("l'identité d'envoi par nature (U5)", () => {
  it("une identité marketing pas encore réglée dit partir de la transactionnelle", async () => {
    await change("lfc").then((response) => expect(response.status).toBe(204));

    const view = jsonBody<MailSenderView>(
      await staff().get(`${SENDERS}/lfc/marketing`).expect(200),
    );
    expect(view).toMatchObject({
      space: "lfc",
      nature: "marketing",
      identity: null,
      revision: 0,
      fallback: {
        fromAddress: '"La Folie Douce" <no-reply@lfd-backoffice.test>',
        source: "transactional",
      },
    });
  });

  it("enregistre l'identité marketing à part, sans toucher la transactionnelle", async () => {
    await change("lfc").then((response) => expect(response.status).toBe(204));
    await change("lfc", 0, "marketing").then((response) => expect(response.status).toBe(204));

    const rows = await ctx.prisma.mailSenderIdentity.findMany({
      select: { space: true, nature: true, revision: true },
      orderBy: { nature: "asc" },
    });
    expect(rows).toEqual([
      { space: "lfc", nature: "marketing", revision: 1 },
      { space: "lfc", nature: "transactional", revision: 1 },
    ]);
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: {
        type: "mail_copy.sender_changed",
        payload: { path: ["nature"], equals: "marketing" },
      },
    });
    expect(fact.payload).toMatchObject({ space: "lfc", nature: "marketing" });
  });

  /** Règle 19 : l'espace de l'équipe n'envoie jamais de marketing. */
  it("n'offre pas d'identité marketing à l'espace de l'équipe (404 nommé)", async () => {
    const read = await staff().get(`${SENDERS}/lfd/marketing`).expect(404);
    expect(JSON.stringify(read.body)).toContain("n'envoie que des e-mails transactionnels");
    expect((await change("lfd", 0, "marketing")).status).toBe(404);
    expect(transport.sent).toEqual([]);
    expect(await ctx.prisma.mailSenderIdentity.count()).toBe(0);
  });

  it("refuse une nature inconnue (404)", async () => {
    await staff().get(`${SENDERS}/lfc/newsletter`).expect(404);
  });
});
