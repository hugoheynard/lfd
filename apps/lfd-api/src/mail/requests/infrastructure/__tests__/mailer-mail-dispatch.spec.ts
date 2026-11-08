import {
  MailerInvalidReplyToError,
  type MailReceipt,
  type RenderedMail,
  type SendMailArgs,
} from "@lfd/mailer";

import { b2bMailTemplates, type B2bMails } from "../../../templates/mail-templates.js";
import type { B2bMailer } from "../../../templates/mailer.tokens.js";
import { MailRefusedError } from "../../domain/errors/mail-request.errors.js";
import { MailerMailDispatch } from "../mailer-mail-dispatch.js";

class RecordingMailer implements B2bMailer {
  readonly enabled = true;
  readonly sent: SendMailArgs<B2bMails>[] = [];
  refusal: Error | null = null;

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    this.sent.push(args);
    return Promise.resolve({ providerId: "re_1" });
  }
}

const MAIL = {
  template: "staff.access-suspended",
  to: "equipe@example.test",
  data: { firstName: "Ada" },
  idempotencyKey: "staff.suspended:s1",
};

describe("MailerMailDispatch — le Reply-To d'une demande (S2c)", () => {
  it("passe l'adresse de réponse au mailer quand la demande en porte une", async () => {
    const mailer = new RecordingMailer();
    await new MailerMailDispatch(mailer).dispatch(
      { ...MAIL, replyTo: "auteur@example.test" },
      null,
    );
    expect(mailer.sent[0]).toMatchObject({ replyTo: "auteur@example.test" });
  });

  it("n'en pose aucune sans : le Reply-To par défaut du mailer reste", async () => {
    const mailer = new RecordingMailer();
    await new MailerMailDispatch(mailer).dispatch(MAIL, null);
    expect(mailer.sent[0]).not.toHaveProperty("replyTo");
  });

  it("une adresse de réponse refusée par le mailer est un refus, pas un échec à relancer", async () => {
    const mailer = new RecordingMailer();
    mailer.refusal = new MailerInvalidReplyToError();
    await expect(
      new MailerMailDispatch(mailer).dispatch({ ...MAIL, replyTo: "x<y>@example.test" }, null),
    ).rejects.toThrow(MailRefusedError);
  });
});

/** Le transport qui REND le modèle, comme Resend le ferait, et garde le rendu. */
class RenderingMailer implements B2bMailer {
  readonly enabled = true;
  readonly rendered: RenderedMail[] = [];
  readonly headers: (Readonly<Record<string, string>> | undefined)[] = [];
  private readonly registry = b2bMailTemplates({
    supportEmail: "admin@lfc.test",
    backOfficeUrl: "https://admin.lfc.test",
  });

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.rendered.push(this.registry[args.template](args.data));
    this.headers.push(args.headers);
    return Promise.resolve({ providerId: "re_1" });
  }
}

const UNSUBSCRIBE_URL = "https://shop.lfc.test/api/lfd/mail/unsubscribe/tok";

describe("MailerMailDispatch — les marques d'un e-mail marketing (plan de désinscription, U3)", () => {
  it("pose les en-têtes RFC 8058 et injecte le pied, en HTML et en texte", async () => {
    const mailer = new RenderingMailer();

    await new MailerMailDispatch(mailer).dispatch(MAIL, { unsubscribeUrl: UNSUBSCRIBE_URL });

    expect(mailer.headers[0]).toEqual({
      "List-Unsubscribe": `<${UNSUBSCRIBE_URL}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(mailer.rendered[0]?.html).toContain(`href="${UNSUBSCRIBE_URL}"`);
    expect(mailer.rendered[0]?.html).toContain("se désinscrire");
    expect(mailer.rendered[0]?.text).toContain(UNSUBSCRIBE_URL);
  });

  it("sans marques, ni en-tête ni pied : le rendu d'un transactionnel ne change pas", async () => {
    const marked = new RenderingMailer();
    const plain = new RenderingMailer();

    await new MailerMailDispatch(plain).dispatch(MAIL, null);
    await new MailerMailDispatch(marked).dispatch(MAIL, { unsubscribeUrl: UNSUBSCRIBE_URL });

    expect(plain.headers[0]).toBeUndefined();
    expect(plain.rendered[0]?.html).not.toContain("data-mail-unsubscribe");
    expect(plain.rendered[0]?.text).not.toContain("unsubscribe");
    // Le pied est le SEUL ajout : le reste du HTML est celui du transactionnel.
    const html = marked.rendered[0]?.html ?? "";
    const start = html.indexOf('\n      <tr><td style="padding:0 32px 24px;">');
    const end = html.indexOf("</td></tr>", start) + "</td></tr>".length;
    expect(html.slice(0, start) + html.slice(end)).toBe(plain.rendered[0]?.html);
  });

  it("parle la langue de l'envoi : un modèle qui suit son destinataire", async () => {
    const mailer = new RenderingMailer();
    await new MailerMailDispatch(mailer).dispatch(
      {
        template: "customer.marketing-confirm",
        to: "client@example.test",
        data: { confirmUrl: "https://shop.lfc.test/c", locale: "it" },
        idempotencyKey: "k",
      },
      { unsubscribeUrl: UNSUBSCRIBE_URL },
    );
    expect(mailer.rendered[0]?.html).toContain("annulla l&#39;iscrizione");
  });
});
