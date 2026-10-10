import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import type { B2bMails } from "../../../../../platform/mailer/mail-templates.js";
import type { B2bMailer } from "../../../../../platform/mailer/mailer.tokens.js";
import { LoginMethodLinkedFact } from "../../../domain/events/login-method-linked.fact.js";
import { OneProfile } from "../../commands/__tests__/member-acts-doubles.js";
import { SendLoginMethodLinkedMail } from "../send-login-method-linked-mail.handler.js";

/** Un doublé qui garde chaque envoi, pour qu'on puisse l'ouvrir. */
class RecordingMailer implements B2bMailer {
  readonly enabled = true;
  readonly sent: SendMailArgs<B2bMails, keyof B2bMails>[] = [];

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.sent.push(args);
    return Promise.resolve({ providerId: "msg_1" });
  }
}

function deliveryFor(userId: string) {
  return {
    eventId: "evt_1",
    ...new LoginMethodLinkedFact(userId, "google-oauth2", "lnk_1").durableFact(),
  };
}

/**
 * Lot E5 (2026-10-10) : l'alerte de rattachement est un abonné DURABLE. Ce
 * qu'on éprouve : à qui elle part, avec quel mot, et qu'un fait illisible
 * lève — un message mort visible plutôt qu'une alerte avalée.
 */
describe("SendLoginMethodLinkedMail — l'alerte au titulaire", () => {
  it("écrit à l'adresse du compte, avec le mot de l'écran", async () => {
    const mailer = new RecordingMailer();

    await new SendLoginMethodLinkedMail(new OneProfile(), mailer).handle(deliveryFor("u1"));

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe("camille@pqmarais.fr");
    expect(mailer.sent[0]?.template).toBe("customer.login-method-linked");
    expect(mailer.sent[0]?.data).toEqual({ firstName: "Camille", methodLabel: "Google" });
    expect(mailer.sent[0]?.idempotencyKey).toBe("login_method.linked:u1:google-oauth2");
  });

  it("n'écrit rien, sans lever, quand le profil a disparu", async () => {
    const mailer = new RecordingMailer();

    await new SendLoginMethodLinkedMail(new OneProfile(), mailer).handle(deliveryFor("u9"));

    expect(mailer.sent).toEqual([]);
  });

  it("lève sur un fait illisible", async () => {
    const mailer = new RecordingMailer();

    await expect(
      new SendLoginMethodLinkedMail(new OneProfile(), mailer).handle({
        eventId: "evt_2",
        type: "account.login_method_linked",
        payload: { userId: "u1" },
      }),
    ).rejects.toThrow("illisible");
    expect(mailer.sent).toEqual([]);
  });
});
