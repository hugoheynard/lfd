import { MAIL_NATURES } from "@lfd/mail-blocks";

import { mailKeys } from "../../specimens/mail-specimens.js";
import { mailBlockDeclarationOf, natureOf } from "../mail-block-declarations.js";

const MAILS = mailKeys();

describe("la nature des e-mails (plan de désinscription, U1)", () => {
  it("chaque clé de B2bMails déclare une nature connue", () => {
    expect(MAILS).toHaveLength(35);
    for (const mail of MAILS) {
      expect(MAIL_NATURES).toContain(natureOf(mail));
    }
  });

  it("la déclaration servie à l'éditeur porte la même nature", () => {
    for (const mail of MAILS) {
      expect(mailBlockDeclarationOf(mail).nature).toBe(natureOf(mail));
    }
  });

  /**
   * Vrai le 2026-11-08 : les 33 modèles sont des e-mails de service (Hugo ; le
   * 33ᵉ, la confirmation d'inscription de C1, aussi). Le test qui exigeait
   * « aucun marketing tant que U3 n'existe pas » est devenu, avec U3,
   * `marketing/application/__tests__/marketing-send-control.spec.ts` : tout
   * modèle marketing — ceux du registre, et un modèle d'essai — a son pied,
   * ses en-têtes et son contrôle.
   */
  it("la confirmation d'inscription est transactionnelle : elle part à une adresse sans accord", () => {
    expect(natureOf("customer.marketing-confirm")).toBe("transactional");
  });
});
