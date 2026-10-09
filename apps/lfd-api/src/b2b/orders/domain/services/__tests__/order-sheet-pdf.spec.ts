import type { ClientSheet } from "@lfd/contracts";

import {
  orderSheetPdfFileName,
  orderSheetPdfKey,
  renderOrderSheetPdf,
} from "../order-sheet-pdf.js";
import { ART, LINE, sheet } from "./client-sheet.fixture.js";
import { pdfText } from "./pdf-text.js";

/**
 * Un PDF ne se relit pas : on le PROUVE.
 *
 * Ces cas ouvrent les octets produits et lisent le texte qu'ils portent, plutôt
 * que d'assurer sur une structure. C'est ce qui permet d'attraper les défauts
 * qui ne se voient qu'à l'œil — un montant cent fois trop grand, un caractère
 * qui sort en guillemet — et qu'aucun test de forme n'aurait vus.
 *
 * ⚠️ Ils portent aussi la propriété dont dépend le rangement en R2 : **les mêmes
 * entrées rendent les mêmes octets**. Sans elle, l'écriture au premier
 * téléchargement cesse d'être idempotente, et deux onglets simultanés peuvent
 * laisser en magasin un fichier différent de celui qui a été servi.
 */

describe("le bon de commande en PDF", () => {
  it("rend les MÊMES octets deux fois — l'archivage sans verrou en dépend", async () => {
    const first = await renderOrderSheetPdf(sheet(), ART);
    const second = await renderOrderSheetPdf(sheet(), ART);

    expect(first.equals(second)).toBe(true);
  });

  it("ne porte NI date de rendu NI numéro de version de la bibliothèque", async () => {
    // Les deux rendraient le fichier différent sans que rien ne paraisse faux :
    // l'un à chaque appel, l'autre à chaque montée de dépendance — et un
    // document archivé changerait sous les pieds de celui qui l'oppose.
    const text = (await renderOrderSheetPdf(sheet(), ART)).toString("latin1");

    // Les valeurs du dictionnaire d'informations sont des objets INDIRECTS —
    // `/Producer 11 0 R` — donc on cherche la valeur, pas la paire.
    expect(text).toContain("(La Folie Coffee)");
    expect(text).not.toContain("PDFKit");
    // La date est celle de la RÉVISION, à la seconde près : le 2 septembre à
    // 9 h, pas l'instant du rendu.
    expect(text).toContain("(D:20260902090000Z)");
  });

  it("commence par l'en-tête de format et finit par la marque de fin", async () => {
    const pdf = (await renderOrderSheetPdf(sheet(), ART)).toString("latin1");

    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });
});

describe("les montants", () => {
  it("rend un prix unitaire en EUROS, pas cent fois trop", async () => {
    // 🔴 Régression du 2026-09-07 : `unitPrice` divisait par 10 au lieu de
    // 100 000, et une baguette à 0,74 € s'imprimait « 74,00 € » sur le document
    // qu'un client garde. La faute n'était pas le facteur, c'était d'avoir
    // refait l'arithmétique de l'argent au lieu d'appeler `@lfd/money`.
    const text = pdfText(await renderOrderSheetPdf(sheet(), ART));

    expect(text).toContain("0,74");
    expect(text).not.toContain("74,00");
  });

  it("garde les décimales d'un prix DÉRIVÉ, qui n'est pas rond", async () => {
    // Un prix issu d'une remise tombe rarement au centime. L'arrondir ferait que
    // `PU × quantité` ne retombe plus sur le total de ligne — et le client le
    // refait à la calculatrice.
    const text = pdfText(
      await renderOrderSheetPdf(sheet({ lines: [{ ...LINE, unitPriceMillicents: 74_321 }] }), ART),
    );

    expect(text).toContain("0,74321");
  });

  it("écrit un signe moins qui TRAVERSE l'encodage", async () => {
    // 🔴 Régression du 2026-09-07 : le signe « − » (U+2212) n'existe pas en
    // WinAnsi, l'encodage que déclarent les polices standard du PDF. Il sortait
    // en guillemet — « Remise " 58,90 € » — et seul l'œil le voyait.
    const text = pdfText(await renderOrderSheetPdf(sheet(), ART));

    expect(text).toContain("- 11,84");
    expect(text).not.toContain('" 11,84');
  });
});

describe("la ventilation de TVA", () => {
  it("détaille chaque taux quand la commande l'a figée", async () => {
    const text = pdfText(
      await renderOrderSheetPdf(
        sheet({
          money: {
            ...sheet().money,
            vatShares: [
              { rate: 5.5, amountCents: 400 },
              { rate: 10, amountCents: 186 },
            ],
          },
        }),
        ART,
      ),
    );

    expect(text).toContain("dont TVA 5,5 %");
    expect(text).toContain("dont TVA 10 %");
  });

  it("n'en dit qu'UNE ligne quand la commande est antérieure au gel", async () => {
    // `null` = commande d'avant la colonne. On affiche le total, qui est vrai,
    // plutôt qu'un détail reconstitué qui pourrait ne pas être celui qu'on a
    // facturé — c'est toute la raison de figer la ventilation.
    const text = pdfText(
      await renderOrderSheetPdf(sheet({ money: { ...sheet().money, vatShares: null } }), ART),
    );

    expect(text).toContain("dont TVA");
    expect(text).not.toContain("dont TVA 5,5 %");
  });
});

describe("ce que le bon ne porte pas", () => {
  it("dit qu'il n'est PAS une facture", async () => {
    // Le seul écart entre les deux pièces est un numéro de série que la
    // plateforme n'a pas. Un document chiffré muet là-dessus est classé comme
    // une facture par le premier comptable qui le reçoit.
    expect(pdfText(await renderOrderSheetPdf(sheet(), ART))).toContain("pas une facture");
  });
});

describe("le rangement", () => {
  it("porte la RÉVISION dans la clé — un avenant n'écrase pas ce qui circule", () => {
    expect(orderSheetPdfKey(sheet({ revision: 2 }))).toBe("orders/ord_1/bon-de-commande-r2-d2.pdf");
  });

  it("propose un nom lisible sur un bureau, pas une clé opaque", () => {
    expect(orderSheetPdfFileName(sheet())).toBe("bon-de-commande-CMD-4812.pdf");
  });
});

/**
 * 🔴 **R3 (2026-09-21) — le bon d'un particulier parle sa langue.**
 *
 * Le rayon (D13) et le panier (R2) disent le TTC ; ce document disait encore le
 * hors taxe. Un client qui a lu 2,00 € partout recevait un bon à 1,90 €.
 */
describe("l'assiette du document", () => {
  /** 118,40 € HT → 124,91 € TTC à 5,5 %, et 0,74 € la pièce → 0,78 €. */
  const SCELLE = { ...LINE, unitPriceTtcCents: 78, lineTotalTtcCents: 12_491 };

  const rendu = async (sheetToDraw: ClientSheet): Promise<string> =>
    pdfText(await renderOrderSheetPdf(sheetToDraw, ART));

  it("garde le HORS TAXE quand rien n'est scellé — un pro, ou un bon d'avant R3", async () => {
    const text = await rendu(sheet());

    expect(text).toContain("PU HT");
    expect(text).toContain("Total HT");
    expect(text).not.toContain("PU TTC");
  });

  it("🔴 bascule les DEUX colonnes ET leurs titres dès que le TTC est scellé", async () => {
    const text = await rendu(sheet({ lines: [SCELLE] }));

    expect(text).toContain("PU TTC");
    expect(text).toContain("Total TTC");
    // Le montant scellé, pas le hors taxe — c'est ce que le titre promet.
    expect(text).toContain("124,91");
    expect(text).not.toContain("PU HT");
  });

  /**
   * 🔴 **Le pied DIT « HT », il ne le sous-entend plus.**
   *
   * Avec une colonne en TTC au-dessus, un pied qui disait « Sous-total »
   * invitait à une addition qui ne tombe pas — et l'écart n'est pas un arrondi,
   * c'est la TVA entière : 124,91 € face à 118,40 €. Deux registres nommés ne
   * mentent pas ; un registre muet, si.
   */
  it("🔴 nomme son sous-total « HT », quelle que soit l'assiette des lignes", async () => {
    expect(await rendu(sheet())).toContain("Sous-total HT");
    expect(await rendu(sheet({ lines: [SCELLE] }))).toContain("Sous-total HT");
  });

  /**
   * ⚠️ Une feuille dont UNE SEULE ligne porte un TTC n'est pas un document
   * mixte : c'est un état qui ne devrait pas exister. Le rendu retombe alors
   * entièrement en hors taxe plutôt que de titrer « TTC » au-dessus d'une
   * colonne dont une case dirait autre chose.
   */
  it("retombe en hors taxe si UNE ligne seulement porte un TTC", async () => {
    const text = await rendu(sheet({ lines: [SCELLE, { ...LINE }] }));

    expect(text).toContain("PU HT");
    expect(text).not.toContain("PU TTC");
  });
});

/**
 * F5 (plan `bons-et-facture-concordants`) : la TVA d'un pro au compte se
 * calcule une fois sur le mois. Le bon ne chiffre donc que le HT — un TTC par
 * bon différerait de la facture de quelques centimes.
 */
describe("le bon d'un pro au compte (F5)", () => {
  const rendu = async (settlement: ClientSheet["money"]["settlement"]): Promise<string> =>
    pdfText(await renderOrderSheetPdf(sheet({ money: { ...sheet().money, settlement } }), ART));

  it("au compte : le total HT et la mention, AUCUN chiffre de TVA ni de TTC", async () => {
    const text = await rendu("account");

    expect(text).toContain("Total HT");
    // 118,40 − 11,84 de remise = 106,56 € HT.
    expect(text).toContain("106,56");
    expect(text).toContain("TVA et TTC sur la facture du mois.");
    expect(text).not.toContain("Total TTC");
    expect(text).not.toContain("dont TVA");
    expect(text).not.toContain("112,42");
    expect(text).not.toContain("5,86");
  });

  it.each(["paid", "due", "free"] as const)(
    "%s : le pied taxé reste tel quel, sans la mention",
    async (settlement) => {
      const text = await rendu(settlement);

      expect(text).toContain("Total avant TVA");
      expect(text).toContain("dont TVA 5,5 %");
      expect(text).toContain("112,42");
      expect(text).not.toContain("facture du mois");
    },
  );
});
