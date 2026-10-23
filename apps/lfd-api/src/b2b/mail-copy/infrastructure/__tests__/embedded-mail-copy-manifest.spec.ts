import { MAIL_COPY } from "../../../../platform/mailer/copy/mail-copy.js";
import { embeddedMailCopyManifest } from "../embedded-mail-copy-manifest.js";

describe("le manifeste des textes d'e-mails que l'API embarque", () => {
  const manifest = embeddedMailCopyManifest();

  it("connaît les 28 e-mails du registre, chacun avec au moins un texte", () => {
    expect(manifest.mails()).toHaveLength(28);
    for (const { mail } of manifest.mails()) {
      expect(manifest.textsOf(mail).length).toBeGreaterThan(0);
    }
    expect(
      manifest
        .mails()
        .map(({ mail }) => mail)
        .sort(),
    ).toEqual(Object.keys(MAIL_COPY.fr).sort());
  });

  it("donne le défaut des trois langues, tel que le dictionnaire l'écrit", () => {
    const subject = manifest.entry("customer.order-placed", "subject");
    expect(subject).toMatchObject({
      defaults: {
        fr: MAIL_COPY.fr["customer.order-placed"].subject,
        en: MAIL_COPY.en["customer.order-placed"].subject,
        it: MAIL_COPY.it["customer.order-placed"].subject,
      },
      allowed: ["ref"],
      required: ["ref"],
    });
  });

  it("dit quels e-mails suivent la langue du destinataire", () => {
    const follows = new Map(manifest.mails().map((mail) => [mail.mail, mail.followsLocale]));
    expect(follows.get("customer.order-placed")).toBe(true);
    expect(follows.get("customer.mandate-to-sign")).toBe(false);
    expect(follows.get("staff.invited")).toBe(false);
  });
});
