import {
  MAX_SENDER_NAME_LENGTH,
  senderDomainOf,
  senderHeaderOf,
  validateMailSenderIdentity,
  validateStoredMailSenderIdentity,
  type MailSenderIdentity,
} from "../mail-sender-identity.js";

const IDENTITY: MailSenderIdentity = {
  senderName: "La Folie Douce",
  fromAddress: "no-reply@lfd-backoffice.com",
  replyToAddress: "support@lfd-backoffice.com",
};

function codesOf(identity: MailSenderIdentity): readonly string[] {
  return validateMailSenderIdentity(identity).map((violation) => violation.code);
}

describe("validateMailSenderIdentity", () => {
  it("admet une identité bien formée, avec une adresse de réponse lue", () => {
    expect(validateMailSenderIdentity(IDENTITY)).toEqual([]);
  });

  /** Décision du 2026-11-07 : une identité sans adresse de réponse perdait les réponses. */
  it("refuse nommément une identité sans adresse de réponse", () => {
    expect(validateMailSenderIdentity({ ...IDENTITY, replyToAddress: null })).toEqual([
      {
        code: "reply_to_missing",
        field: "replyToAddress",
        message:
          "Les réponses à vos e-mails seraient perdues : choisissez une adresse que quelqu'un lit (par exemple support@…).",
      },
    ]);
  });

  it.each([
    "no-reply@lfd.fr",
    "NoReply@lfd.fr",
    "no_reply@lfd.fr",
    "no.reply@lfd.fr",
    "DoNotReply@lfd.fr",
    "do-not-reply@lfd.fr",
    "ne-pas-repondre@lfd.fr",
    "nepasrepondre@lfd.fr",
  ])("refuse une adresse de réponse que personne ne lit (%j)", (replyToAddress) => {
    expect(codesOf({ ...IDENTITY, replyToAddress })).toEqual(["reply_to_unattended"]);
  });

  it("admet une partie locale qui contient seulement « reply »", () => {
    expect(codesOf({ ...IDENTITY, replyToAddress: "reply@lfd.fr" })).toEqual([]);
    expect(codesOf({ ...IDENTITY, replyToAddress: "noreply-support@lfd.fr" })).toEqual([]);
  });

  it.each(["", "   "])("refuse un nom vide (%j)", (senderName) => {
    expect(codesOf({ ...IDENTITY, senderName })).toEqual(["sender_name_empty"]);
  });

  it("refuse un nom trop long", () => {
    expect(codesOf({ ...IDENTITY, senderName: "a".repeat(MAX_SENDER_NAME_LENGTH + 1) })).toEqual([
      "sender_name_too_long",
    ]);
  });

  it.each(['La "Folie"', "La <Folie>", "La\\Folie", "La Folie\r\nBcc: x@y.fr", "La\u0000Folie"])(
    "refuse un nom qui casserait l'en-tête (%j)",
    (senderName) => {
      expect(codesOf({ ...IDENTITY, senderName })).toEqual(["sender_name_forbidden_character"]);
    },
  );

  it.each(["no-reply", "no-reply@", "@lfd.fr", "no reply@lfd.fr", "a@lfd", "a@lfd.fr\r\nBcc: x"])(
    "refuse une adresse d'envoi mal formée (%j)",
    (fromAddress) => {
      expect(validateMailSenderIdentity({ ...IDENTITY, fromAddress })).toEqual([
        expect.objectContaining({ code: "address_invalid", field: "fromAddress" }),
      ]);
    },
  );

  it("refuse une adresse de réponse mal formée", () => {
    expect(validateMailSenderIdentity({ ...IDENTITY, replyToAddress: "equipe" })).toEqual([
      expect.objectContaining({ code: "address_invalid", field: "replyToAddress" }),
    ]);
  });
});

describe("validateStoredMailSenderIdentity", () => {
  it("relit une identité d'avant le 2026-11-07 : sans réponse, ou en no-reply", () => {
    expect(validateStoredMailSenderIdentity({ ...IDENTITY, replyToAddress: null })).toEqual([]);
    expect(
      validateStoredMailSenderIdentity({ ...IDENTITY, replyToAddress: "no-reply@lfd.fr" }),
    ).toEqual([]);
  });

  it("refuse toujours une forme fausse", () => {
    expect(validateStoredMailSenderIdentity({ ...IDENTITY, fromAddress: "x" })).toHaveLength(1);
  });
});

describe("senderDomainOf", () => {
  it("rend le domaine en minuscules", () => {
    expect(senderDomainOf("No-Reply@LFD-Backoffice.COM")).toBe("lfd-backoffice.com");
  });
});

describe("senderHeaderOf", () => {
  it("met le nom entre guillemets devant l'adresse", () => {
    expect(senderHeaderOf(IDENTITY)).toBe('"La Folie Douce" <no-reply@lfd-backoffice.com>');
  });
});
