import { MailerInvalidReplyToError, type MailReceipt, type SendMailArgs } from "@lfd/mailer";

import type { B2bMails } from "../../../templates/mail-templates.js";
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
    await new MailerMailDispatch(mailer).dispatch({ ...MAIL, replyTo: "auteur@example.test" });
    expect(mailer.sent[0]).toMatchObject({ replyTo: "auteur@example.test" });
  });

  it("n'en pose aucune sans : le Reply-To par défaut du mailer reste", async () => {
    const mailer = new RecordingMailer();
    await new MailerMailDispatch(mailer).dispatch(MAIL);
    expect(mailer.sent[0]).not.toHaveProperty("replyTo");
  });

  it("une adresse de réponse refusée par le mailer est un refus, pas un échec à relancer", async () => {
    const mailer = new RecordingMailer();
    mailer.refusal = new MailerInvalidReplyToError();
    await expect(
      new MailerMailDispatch(mailer).dispatch({ ...MAIL, replyTo: "x<y>@example.test" }),
    ).rejects.toThrow(MailRefusedError);
  });
});
