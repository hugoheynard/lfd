import { emailReply, contactRequest } from "../../domain/__tests__/request-fixtures.js";
import { UNKNOWN_AUTHENTICATION } from "../../domain/inbound-message.js";
import { attachmentsOf, authenticationOf, emailReplyColumnsOf } from "../email-reply.columns.js";

describe("les colonnes `email_*` d'une demande", () => {
  it("sont nulles pour un autre type", () => {
    expect(emailReplyColumnsOf(contactRequest().details)).toEqual({
      emailMessageId: null,
      emailSubject: null,
      emailAttachments: null,
      emailAuthentication: null,
    });
  });

  it("portent l'identifiant, l'objet, les pièces jointes et le verdict d'une réponse", () => {
    expect(emailReplyColumnsOf(emailReply().details)).toMatchObject({
      emailMessageId: "in_1",
      emailSubject: "Re: Votre commande ORD-0001",
    });
  });

  it("relisent les pièces jointes en taisant une entrée mal formée", () => {
    const ok = { filename: "a.pdf", contentType: "application/pdf", sizeBytes: 3 };
    expect(attachmentsOf([ok, { filename: 1 }, null, "x"])).toEqual([ok]);
    expect(attachmentsOf({ not: "an array" })).toEqual([]);
  });

  it("un verdict illisible est inconnu, donc jamais « vérifié »", () => {
    expect(authenticationOf(null)).toEqual(UNKNOWN_AUTHENTICATION);
    expect(authenticationOf({ dkimAligned: "true" }).dkimAligned).toBe(false);
  });
});
