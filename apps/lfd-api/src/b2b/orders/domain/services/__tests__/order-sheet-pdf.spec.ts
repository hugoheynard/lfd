import { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";

import type { ClientSheet } from "@lfd/contracts";

import {
  orderSheetPdfFileName,
  orderSheetPdfKey,
  renderOrderSheetPdf,
} from "../order-sheet-pdf.js";

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

/**
 * Le texte d'un PDF, flux décompressés **et chaînes décodées**.
 *
 * Deux obstacles, et les deux rendaient un test muet :
 *
 * 1. `pdfkit` comprime ses flux de contenu (`FlateDecode`). Sans l'inflation,
 *    une assertion sur le texte ne trouve jamais rien — et un test qui ne peut
 *    pas échouer est pire qu'un test absent.
 * 2. Il écrit le texte en **hexadécimal**, découpé par le crénage :
 *    `[<4c6120> 30 <466f6c6965> 0] TJ`. Lire le flux brut ne montre donc que des
 *    octets. On recolle les morceaux et on les décode en latin1 — l'encodage
 *    WinAnsi que les polices standard déclarent.
 */
function pdfText(pdf: Buffer): string {
  const streams: string[] = [];
  const raw = pdf.toString("latin1");
  const pattern = /stream\r?\n/gu;
  let match = pattern.exec(raw);
  while (match !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end > start) {
      try {
        streams.push(inflateSync(pdf.subarray(start, end)).toString("latin1"));
      } catch {
        // Un flux qui n'est pas du contenu compressé (une police, un objet
        // binaire) : on l'ignore plutôt que de faire échouer la lecture.
      }
    }
    match = pattern.exec(raw);
  }
  const content = streams.join("\n");
  const decoded: string[] = [];
  for (const hex of content.matchAll(/<([0-9a-fA-F]+)>/gu)) {
    decoded.push(Buffer.from(hex[1] ?? "", "hex").toString("latin1"));
  }
  // Les chaînes littérales, pour les flux que `pdfkit` n'écrit pas en hexa.
  for (const literal of content.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/gu)) {
    decoded.push(literal[1] ?? "");
  }
  return decoded.join("");
}

const LINE = {
  sku: "PAI-BAG-TRA",
  productName: "Baguette tradition",
  quantity: 160,
  // 0,74 € — soit SOIXANTE-QUATORZE MILLE millicentimes. 1 € = 100 000.
  unitPriceMillicents: 74_000,
  vatRate: 5.5,
  lineTotalCents: 11_840,
  priceLabels: [] as readonly string[],
};

function sheet(overrides: Partial<ClientSheet> = {}): ClientSheet {
  return {
    orderId: "ord_1",
    reference: "CMD-4812",
    audience: "client",
    placedAt: "2026-09-02T09:00:00.000Z",
    requestedFor: "2026-09-03",
    issuedAt: "2026-09-02T09:00:00.000Z",
    revision: 0,
    origin: "self_service",
    note: "",
    customer: { tradeName: "Hôtel des Trois Ponts", legalName: "SAS des Trois Ponts" },
    fulfillment: {
      method: "pickup",
      pickupLabel: "Le Labo",
      address: {
        label: "Le Labo",
        ligne1: "route de la Balme",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
      },
      window: { start: "07:00", end: "08:00" },
      contact: null,
      signatureRequired: false,
    },
    lines: [LINE],
    money: {
      subtotalCents: 11_840,
      discountCents: 1_184,
      discountAdjustment: null,
      deliveryFeeCents: 0,
      lateFeeCents: 0,
      vatCents: 586,
      vatShares: [{ rate: 5.5, amountCents: 586 }],
      totalCents: 11_242,
      currency: "EUR",
    },
    ...overrides,
  };
}

describe("le bon de commande en PDF", () => {
  it("rend les MÊMES octets deux fois — l'archivage sans verrou en dépend", async () => {
    const first = await renderOrderSheetPdf(sheet());
    const second = await renderOrderSheetPdf(sheet());

    expect(first.equals(second)).toBe(true);
  });

  it("ne porte NI date de rendu NI numéro de version de la bibliothèque", async () => {
    // Les deux rendraient le fichier différent sans que rien ne paraisse faux :
    // l'un à chaque appel, l'autre à chaque montée de dépendance — et un
    // document archivé changerait sous les pieds de celui qui l'oppose.
    const text = (await renderOrderSheetPdf(sheet())).toString("latin1");

    // Les valeurs du dictionnaire d'informations sont des objets INDIRECTS —
    // `/Producer 11 0 R` — donc on cherche la valeur, pas la paire.
    expect(text).toContain("(La Folie Coffee)");
    expect(text).not.toContain("PDFKit");
    // La date est celle de la RÉVISION, à la seconde près : le 2 septembre à
    // 9 h, pas l'instant du rendu.
    expect(text).toContain("(D:20260902090000Z)");
  });

  it("commence par l'en-tête de format et finit par la marque de fin", async () => {
    const pdf = (await renderOrderSheetPdf(sheet())).toString("latin1");

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
    const text = pdfText(await renderOrderSheetPdf(sheet()));

    expect(text).toContain("0,74");
    expect(text).not.toContain("74,00");
  });

  it("garde les décimales d'un prix DÉRIVÉ, qui n'est pas rond", async () => {
    // Un prix issu d'une remise tombe rarement au centime. L'arrondir ferait que
    // `PU × quantité` ne retombe plus sur le total de ligne — et le client le
    // refait à la calculatrice.
    const text = pdfText(
      await renderOrderSheetPdf(sheet({ lines: [{ ...LINE, unitPriceMillicents: 74_321 }] })),
    );

    expect(text).toContain("0,74321");
  });

  it("écrit un signe moins qui TRAVERSE l'encodage", async () => {
    // 🔴 Régression du 2026-09-07 : le signe « − » (U+2212) n'existe pas en
    // WinAnsi, l'encodage que déclarent les polices standard du PDF. Il sortait
    // en guillemet — « Remise " 58,90 € » — et seul l'œil le voyait.
    const text = pdfText(await renderOrderSheetPdf(sheet()));

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
      await renderOrderSheetPdf(sheet({ money: { ...sheet().money, vatShares: null } })),
    );

    expect(text).toContain("dont TVA");
    expect(text).not.toContain("dont TVA 5,5 %");
  });
});

describe("ce que le bon ne porte pas", () => {
  it("n'imprime AUCUN jeton de remise — la feuille n'en porte pas", async () => {
    // Ce n'est pas une consigne, c'est une impossibilité : `ClientSheet` n'a pas
    // de champ pour le jeton. Ce cas tient que personne ne l'y remettra — le
    // papier d'une livraison voyage dans le carton, où un coursier scannerait
    // son propre colis, et ce fichier est archivé pour toujours.
    const text = pdfText(await renderOrderSheetPdf(sheet()));

    expect(text).not.toContain("tok_");
    expect(text).not.toContain("retrait/");
  });

  it("dit qu'il n'est PAS une facture", async () => {
    // Le seul écart entre les deux pièces est un numéro de série que la
    // plateforme n'a pas. Un document chiffré muet là-dessus est classé comme
    // une facture par le premier comptable qui le reçoit.
    expect(pdfText(await renderOrderSheetPdf(sheet()))).toContain("pas une facture");
  });
});

describe("le rangement", () => {
  it("porte la RÉVISION dans la clé — un avenant n'écrase pas ce qui circule", () => {
    expect(orderSheetPdfKey(sheet({ revision: 2 }))).toBe("orders/ord_1/bon-de-commande-r2.pdf");
  });

  it("propose un nom lisible sur un bureau, pas une clé opaque", () => {
    expect(orderSheetPdfFileName(sheet())).toBe("bon-de-commande-CMD-4812.pdf");
  });
});
