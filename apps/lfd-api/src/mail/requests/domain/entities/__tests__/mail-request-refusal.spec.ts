import { MailRequestAlreadySettledError } from "../../errors/mail-request.errors.js";
import { MailRequest } from "../mail-request.js";

const AT = new Date(60_000);

function request(): MailRequest {
  return MailRequest.request({
    id: "mail_1",
    template: "customer.order-ready",
    brand: "lfc",
    recipient: "client@example.test",
    locale: "fr",
    idempotencyKey: "news:1",
    requestedAt: new Date(0),
  });
}

describe("MailRequest — le refus à raison fermée (plan de désinscription, U2)", () => {
  it("une demande neuve, ou refusée autrement, n'a pas de raison fermée", () => {
    const refused = request();
    refused.markRefused("modèle inconnu", AT);
    expect(request().snapshot().refusalCode).toBeNull();
    expect(refused.snapshot().refusalCode).toBeNull();
  });

  it.each(["unsubscribed", "no_consent"] as const)(
    "refuse pour « %s » et clôt la demande",
    (code) => {
      const mail = request();

      mail.markRefusedFor(code, AT);

      expect(mail.snapshot()).toMatchObject({ status: "refused", refusalCode: code, failedAt: AT });
      expect(mail.snapshot().failureReason).not.toContain("client@example.test");
      expect(() => mail.markRefusedFor(code, AT)).toThrow(MailRequestAlreadySettledError);
    },
  );
});
