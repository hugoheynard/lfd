import { EMAIL_REPLY_BOUNDS } from "@lfd/contracts";

import { InvalidEmailError } from "../../../account/domain/errors/account-errors.js";
import { TRUNCATION_MARK } from "../email-reply-text.js";
import { EmailReplyMessageIdMissingError } from "../errors/email-reply-errors.js";
import { AT, emailReply, LATER } from "./request-fixtures.js";

const STAFF = { staffUserId: "s1", name: "Camille", role: "" };

describe("CustomerRequest.emailReply — une réponse d'un client à un e-mail", () => {
  it("range le texte sans l'historique cité, et ses détails", () => {
    const state = emailReply().toPersistence();

    expect(state.body).toBe("Merci, parfait.");
    expect(state.author).toEqual({ name: "Jean Martin", email: "jean@exemple.fr", phone: "" });
    expect(state.details).toEqual({
      kind: "email_reply",
      messageId: "in_1",
      subject: "Re: Votre commande ORD-0001",
      attachments: [{ filename: "photo.jpg", contentType: "image/jpeg", sizeBytes: 2048 }],
      authentication: { spf: "pass", dkim: "pass", dmarc: "pass", dkimAligned: true },
      order: { id: "o1", number: "ORD-0001" },
    });
  });

  it("ne refuse JAMAIS un message long : il est tronqué à sa borne", () => {
    const state = emailReply({ text: "x".repeat(EMAIL_REPLY_BOUNDS.body * 2) }).toPersistence();

    expect(state.body.length).toBeLessThanOrEqual(EMAIL_REPLY_BOUNDS.body);
    expect(state.body.endsWith(TRUNCATION_MARK)).toBe(true);
  });

  it("borne l'objet, le nom, la liste et les noms des pièces jointes au lieu de refuser", () => {
    const file = { filename: "n".repeat(1000), contentType: "image/png", sizeBytes: 1 };
    const state = emailReply({
      subject: "s".repeat(1000),
      sender: { name: "N".repeat(1000), email: "jean@exemple.fr" },
      attachments: Array.from({ length: 100 }, () => file),
    }).toPersistence();

    expect(state.author.name).toHaveLength(EMAIL_REPLY_BOUNDS.senderName);
    if (state.details.kind !== "email_reply") throw new RangeError("type inattendu");
    expect(state.details.subject).toHaveLength(EMAIL_REPLY_BOUNDS.subject);
    expect(state.details.attachments).toHaveLength(EMAIL_REPLY_BOUNDS.attachments);
    expect(state.details.attachments[0]?.filename).toHaveLength(EMAIL_REPLY_BOUNDS.attachmentName);
  });

  it("lit le HTML à défaut de texte, et accepte un message vide (pièce jointe seule)", () => {
    expect(emailReply({ text: null, html: "<p>Bonjour</p>" }).toPersistence().body).toBe("Bonjour");
    expect(emailReply({ text: null, html: null }).toPersistence().body).toBe("");
  });

  it("nomme par son adresse un expéditeur sans nom affiché", () => {
    const author = emailReply({ sender: { name: "  ", email: "Jean@Exemple.fr" } }).author;
    expect(author).toMatchObject({ name: "jean@exemple.fr", email: "jean@exemple.fr" });
  });

  it("refuse une adresse illisible et un message sans identifiant", () => {
    expect(() => emailReply({ sender: { name: "J", email: "pas-une-adresse" } })).toThrow(
      InvalidEmailError,
    );
    expect(() => emailReply({ messageId: " " })).toThrow(EmailReplyMessageIdMissingError);
  });

  it("se marque traitée, une fois", () => {
    const request = emailReply();
    request.markHandled(STAFF, LATER);
    expect(request.toPersistence().handling?.at).toBe(LATER);
  });

  it("l'anonymisation vide l'objet, les pièces jointes et la commande ; l'identifiant reste", () => {
    const request = emailReply();

    expect(request.anonymize(AT)).toEqual([]);

    const state = request.toPersistence();
    expect(state).toMatchObject({ body: "", userId: null, author: { name: "", email: "" } });
    expect(state.details).toEqual({
      kind: "email_reply",
      messageId: "in_1",
      subject: "",
      attachments: [],
      authentication: { spf: "pass", dkim: "pass", dmarc: "pass", dkimAligned: true },
      order: null,
    });
  });
});
