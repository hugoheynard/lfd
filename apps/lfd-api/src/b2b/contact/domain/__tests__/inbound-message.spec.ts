import {
  authenticationOf,
  isAutomaticReply,
  orderNumberIn,
  readSender,
  UNKNOWN_AUTHENTICATION,
} from "../inbound-message.js";

describe("ce qu'on lit d'un e-mail reçu", () => {
  describe("readSender", () => {
    it.each([
      ["Jean Martin <Jean@Exemple.fr>", { name: "Jean Martin", email: "jean@exemple.fr" }],
      ['"Martin, Jean" <jean@exemple.fr>', { name: "Martin, Jean", email: "jean@exemple.fr" }],
      ["jean@exemple.fr", { name: "", email: "jean@exemple.fr" }],
    ])("lit %s", (from, sender) => {
      expect(readSender(from)).toEqual(sender);
    });

    it.each(["", "Jean Martin", "<pas une adresse>", "jean@"])(
      "rend `null` pour une adresse illisible (%s)",
      (from) => {
        expect(readSender(from)).toBeNull();
      },
    );
  });

  describe("isAutomaticReply", () => {
    it.each([
      [{ "Auto-Submitted": "auto-replied" }],
      [{ "auto-submitted": "auto-generated" }],
      [{ Precedence: "bulk" }],
      [{ precedence: "auto_reply" }],
      [{ Precedence: "list" }],
    ])("écarte %j", (headers) => {
      expect(isAutomaticReply(headers)).toBe(true);
    });

    it.each([[{}], [{ "Auto-Submitted": "no" }], [{ Precedence: "first-class" }]])(
      "garde %j",
      (headers) => {
        expect(isAutomaticReply(headers)).toBe(false);
      },
    );
  });

  describe("authenticationOf", () => {
    it("rend « inconnu » sans `Authentication-Results`", () => {
      expect(authenticationOf({}, "jean@exemple.fr")).toEqual(UNKNOWN_AUTHENTICATION);
    });

    it("lit SPF, DKIM, DMARC, et l'alignement DKIM sur le domaine de l'adresse", () => {
      const headers = {
        "Authentication-Results":
          "mx.resend.com; spf=pass smtp.mailfrom=exemple.fr; dkim=pass header.d=exemple.fr header.s=s1; dmarc=pass header.from=exemple.fr",
      };
      expect(authenticationOf(headers, "jean@mail.exemple.fr")).toEqual({
        spf: "pass",
        dkim: "pass",
        dmarc: "pass",
        dkimAligned: true,
      });
    });

    it("une signature valide d'un AUTRE domaine n'est pas alignée", () => {
      const headers = {
        "authentication-results": "mx; spf=fail; dkim=pass header.d=ailleurs.com; dmarc=fail",
      };
      expect(authenticationOf(headers, "jean@exemple.fr")).toMatchObject({
        spf: "fail",
        dkimAligned: false,
      });
    });

    it("un domaine qui se termine pareil sans être un sous-domaine n'est pas aligné", () => {
      const headers = { "Authentication-Results": "mx; dkim=pass header.d=ple.fr" };
      expect(authenticationOf(headers, "jean@exemple.fr").dkimAligned).toBe(false);
    });
  });

  describe("orderNumberIn", () => {
    it.each([
      ["Re: Votre commande ORD-1234 est prête", "ORD-1234"],
      ["re: ord-ab12cd34-ef56", "ORD-AB12CD34-EF56"],
      ["Bonjour", null],
      ["ORD-0012", null],
    ])("dans « %s » → %s", (subject, number) => {
      expect(orderNumberIn(subject)).toBe(number);
    });
  });
});
