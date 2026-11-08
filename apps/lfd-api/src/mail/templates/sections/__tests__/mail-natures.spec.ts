import { MAIL_NATURES } from "@lfd/mail-blocks";

import { mailKeys } from "../../specimens/mail-specimens.js";
import { mailBlockDeclarationOf, natureOf } from "../mail-block-declarations.js";

const MAILS = mailKeys();

describe("la nature des e-mails (plan de désinscription, U1)", () => {
  it("chaque clé de B2bMails déclare une nature connue", () => {
    expect(MAILS).toHaveLength(32);
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
   * Vrai le 2026-11-08 : les 32 modèles sont des e-mails de service (Hugo).
   * Ce test doit échouer le jour où un modèle est déclaré `marketing` : tant
   * que le lot U3 n'existe pas, un tel e-mail partirait sans pied de
   * désinscription ni contrôle d'envoi.
   */
  it("aucun modèle n'est marketing tant que U3 n'est pas bâti", () => {
    const marketing = MAILS.filter((mail) => natureOf(mail) === "marketing");
    if (marketing.length > 0) {
      throw new Error(
        `Modèle(s) marketing déclaré(s) : ${marketing.join(", ")}. Avant de les envoyer, bâtir le lot U3 ` +
          "du plan documentation/mail/plan-desinscription-des-e-mails.md (pied de désinscription injecté " +
          "au rendu, en-têtes RFC 8058, contrôle à l'envoi), puis remplacer ce test par celui qui exige " +
          "la section `unsubscribe` sur tout modèle marketing.",
      );
    }
    expect(marketing).toEqual([]);
  });
});
