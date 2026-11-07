import {
  MAX_SENDER_NAME_LENGTH,
  senderDomainOf,
  senderHeaderOf,
  validateMailSenderIdentity,
  type MailSenderIdentity,
} from "../mail-sender-identity.js";

const IDENTITY: MailSenderIdentity = {
  senderName: "La Folie Douce",
  fromAddress: "no-reply@lfd-backoffice.com",
  replyToAddress: null,
};

function codesOf(identity: MailSenderIdentity): readonly string[] {
  return validateMailSenderIdentity(identity).map((violation) => violation.code);
}

describe("validateMailSenderIdentity", () => {
  it("admet une identité bien formée, avec ou sans adresse de réponse", () => {
    expect(validateMailSenderIdentity(IDENTITY)).toEqual([]);
    expect(
      validateMailSenderIdentity({ ...IDENTITY, replyToAddress: "equipe@lafoliedouce.fr" }),
    ).toEqual([]);
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
