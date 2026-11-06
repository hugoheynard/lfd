import { RecordingMailRequests } from "../../../../mail/channels/requests/__tests__/recording-mail-requests.js";
import { AppConfig } from "../../../../platform/config/app-config.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { DevCustomerIdentity } from "../dev-customer-identity.js";

/**
 * L'adaptateur de développement garde la FORME de la production (S2b,
 * 2026-11-06) : le lien de mot de passe part par le bloc `mail`, tout de
 * suite, sous la même clé que l'adaptateur Auth0.
 */
describe("DevCustomerIdentity — le lien de mot de passe, par le bloc mail", () => {
  it("envoie tout de suite le lien factice, sous une clé sans donnée personnelle", async () => {
    const mails = new RecordingMailRequests();
    const port = new DevCustomerIdentity(new AppConfig(), mails, new FixedIdGenerator("mail"));

    await port.sendPasswordResetLink("dev|camille@halles.fr", "camille@halles.fr");

    expect(mails.requested).toEqual([]);
    expect(mails.sentNow).toHaveLength(1);
    expect(mails.sentNow[0]).toMatchObject({
      brand: "lfc",
      to: "camille@halles.fr",
      template: "customer.password-reset",
      idempotencyKey: "account.password-reset:mail_000001",
    });
    expect(mails.sentNow[0]?.idempotencyKey).not.toContain("camille");
  });
});
