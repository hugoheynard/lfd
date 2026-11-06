import { MAIL_COPY, mailCopyOf } from "../mail-copy.js";
import { overlaidMailCopy, withMailCopyOverlay } from "../mail-copy-overlay.js";

describe("le périmètre de remplacement des textes d'e-mails (C2)", () => {
  it("hors périmètre, le dictionnaire du code lui-même", () => {
    expect(mailCopyOf("fr")).toBe(MAIL_COPY.fr);
  });

  it("dans un périmètre, le texte remplacé — et lui seul", () => {
    const overlay = {
      fr: { "customer.order-placed": { subject: "Merci {ref}", "totalLabel.paid": "Payé." } },
    };
    withMailCopyOverlay(overlay, () => {
      const copy = mailCopyOf("fr")["customer.order-placed"];
      expect(copy.subject).toBe("Merci {ref}");
      expect(copy.totalLabel.paid).toBe("Payé.");
      expect(copy.totalLabel.due).toBe(MAIL_COPY.fr["customer.order-placed"].totalLabel.due);
      expect(mailCopyOf("en")).toBe(MAIL_COPY.en);
    });
    expect(MAIL_COPY.fr["customer.order-placed"].subject).not.toBe("Merci {ref}");
  });

  it("suit l'envoi à travers un `await`", async () => {
    const overlay = { fr: { "customer.order-placed": { subject: "Après attente {ref}" } } };
    await withMailCopyOverlay(overlay, async () => {
      await Promise.resolve();
      expect(mailCopyOf("fr")["customer.order-placed"].subject).toBe("Après attente {ref}");
    });
  });

  it("ignore un chemin que le code ne connaît pas, ou qui n'est pas un texte", () => {
    const copy = overlaidMailCopy(
      MAIL_COPY.fr,
      {
        fr: {
          "customer.order-placed": { inconnu: "x", totalLabel: "pas un texte" },
          "pas.un.mail": { a: "b" },
        },
      },
      "fr",
    );
    expect(copy["customer.order-placed"].totalLabel).toEqual(
      MAIL_COPY.fr["customer.order-placed"].totalLabel,
    );
    expect(Object.hasOwn(copy["customer.order-placed"], "inconnu")).toBe(false);
    expect(Object.hasOwn(copy, "pas.un.mail")).toBe(false);
  });

  it("calcule une fois par jeu et par langue", () => {
    const overlay = { fr: { "customer.order-placed": { subject: "Une fois {ref}" } } };
    expect(overlaidMailCopy(MAIL_COPY.fr, overlay, "fr")).toBe(
      overlaidMailCopy(MAIL_COPY.fr, overlay, "fr"),
    );
    expect(overlaidMailCopy(MAIL_COPY.fr, { fr: {} }, "fr")).toBe(MAIL_COPY.fr);
  });
});
