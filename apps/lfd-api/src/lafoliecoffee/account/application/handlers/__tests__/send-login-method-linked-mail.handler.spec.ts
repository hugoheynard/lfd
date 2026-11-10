import { RecordingMail } from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import { LoginMethodLinkedFact } from "../../../domain/events/login-method-linked.fact.js";
import { OneProfile } from "../../commands/__tests__/member-acts-doubles.js";
import { SendLoginMethodLinkedMail } from "../send-login-method-linked-mail.handler.js";

function deliveryFor(userId: string, eventId = "evt_1") {
  return {
    eventId,
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
    const mails = new RecordingMail();

    await new SendLoginMethodLinkedMail(new OneProfile(), mails).handle(deliveryFor("u1"));

    expect(mails.queued).toHaveLength(1);
    expect(mails.queued[0]?.to).toBe("camille@pqmarais.fr");
    expect(mails.queued[0]?.template).toBe("customer.login-method-linked");
    expect(mails.queued[0]?.data).toEqual({ firstName: "Camille", methodLabel: "Google" });
    expect(mails.queued[0]?.idempotencyKey).toBe("login_method.linked:u1:google-oauth2:evt_1");
    expect(mails.queued[0]?.subjects).toEqual([{ type: "account", id: "u1" }]);
    expect(mails.awaitedReceipt).toEqual([]);
  });

  /**
   * Le bloc `mail` garde ses clés un an, et non 24 h comme Resend (S2b,
   * 2026-11-06) : une clé par compte et par méthode tairait l'alerte d'un
   * second rattachement des semaines plus tard.
   */
  it("deux rattachements de la même méthode font deux demandes distinctes", async () => {
    const mails = new RecordingMail();
    const handler = new SendLoginMethodLinkedMail(new OneProfile(), mails);

    await handler.handle(deliveryFor("u1", "evt_1"));
    await handler.handle(deliveryFor("u1", "evt_2"));

    expect(new Set(mails.queued.map((mail) => mail.idempotencyKey)).size).toBe(2);
  });

  it("n'écrit rien, sans lever, quand le profil a disparu", async () => {
    const mails = new RecordingMail();

    await new SendLoginMethodLinkedMail(new OneProfile(), mails).handle(deliveryFor("u9"));

    expect(mails.queued).toEqual([]);
  });

  it("lève sur un fait illisible", async () => {
    const mails = new RecordingMail();

    await expect(
      new SendLoginMethodLinkedMail(new OneProfile(), mails).handle({
        eventId: "evt_2",
        type: "account.login_method_linked",
        payload: { userId: "u1" },
      }),
    ).rejects.toThrow("illisible");
    expect(mails.queued).toEqual([]);
  });
});
