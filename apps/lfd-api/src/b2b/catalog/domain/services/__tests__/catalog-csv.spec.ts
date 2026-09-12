import type { CatalogAdminItemView } from "@lfd/contracts";

import { catalogCsv } from "../catalog-csv.js";

/** « Le PIM a envoyé ces faits ce matin » — une intention, jamais un jour du calendrier. */
const RECEIVED_AT = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

/**
 * Un CSV se lit par un tableur, jamais par nous — donc rien de ce qui casse ici
 * ne remonte en erreur. Ces cas visent les quatre pannes silencieuses connues :
 * un séparateur dans un nom, un accent mal décodé, un vide qui devient zéro, et
 * un article invendable qui se lit « en vente ».
 */
function item(over: Partial<CatalogAdminItemView> = {}): CatalogAdminItemView {
  return {
    sku: "VIE-001-1",
    productSku: "VIE-001",
    name: "Croissant",
    categoryId: "cat_1",
    categoryName: "Viennoiserie",
    pimPriceMillicents: 120_000,
    b2bPriceMillicents: null,
    effectivePriceMillicents: 120_000,
    vatRatePercent: 5.5,
    allergens: [],
    allergensIncomplete: false,
    isHidden: false,
    isFeatured: false,
    decidedBy: null,
    decidedAt: null,
    // Rien de ce qui est testé ici ne LIT cette date — mais le contrat l'exige,
    // et une date en dur dans une fixture est une bombe à retardement même
    // quand personne ne la regarde : le jour où quelqu'un ajoutera une colonne
    // « reçu le », elle serait déjà périmée. Relative, donc, comme le §5 le
    // demande.
    receivedAt: RECEIVED_AT,
    ...over,
  };
}

/** Les lignes du corps, BOM et en-tête retirés. */
function bodyLines(csv: string): string[] {
  return csv
    .replace(/^\uFEFF/u, "")
    .trimEnd()
    .split("\r\n")
    .slice(1);
}

/**
 * **La première ligne de corps, ou un échec qui se lit.**
 *
 * `bodyLines(csv)[0]` rend `string | undefined` : un CSV sans corps donnerait
 * `undefined.endsWith(…)`, c'est-à-dire une pile qui accuse le test au lieu du
 * générateur. Refuser ici nomme la vraie panne — le CSV n'a produit aucune
 * ligne — et c'est toujours celle-là qu'on cherche.
 */
function firstBodyLine(csv: string): string {
  const [line] = bodyLines(csv);
  if (line === undefined) {
    throw new Error("le CSV ne porte aucune ligne de corps");
  }
  return line;
}

describe("catalogCsv", () => {
  it("ouvre par un BOM — sans lui, Excel lit l'UTF-8 en Latin-1", () => {
    const csv = catalogCsv([item({ name: "Crème pâtissière" })]);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Crème pâtissière");
  });

  it("sépare au point-virgule — une virgule ferait une seule colonne en locale FR", () => {
    const csv = catalogCsv([item()]);

    expect(csv.split("\r\n")[0]).toContain("SKU;Article;Catégorie");
  });

  it("écrit les montants en NOMBRE français : virgule, deux décimales, rien d'autre", () => {
    // 2,40 € HT. Ni « 2.40 », que le tableur FR lit en texte, ni « 2,40 € »,
    // qui ne s'additionne pas.
    const csv = catalogCsv([
      item({ pimPriceMillicents: 240_000, effectivePriceMillicents: 240_000 }),
    ]);

    expect(bodyLines(csv)[0]).toContain(";2,40;");
    expect(csv).not.toContain("€ HT;2");
  });

  it("laisse le prix B2B VIDE quand aucune décision n'a été posée", () => {
    // Un « 0,00 » dirait « négocié à zéro euro ». La colonne d'à côté porte déjà
    // ce qui sera facturé.
    const line = firstBodyLine(catalogCsv([item({ b2bPriceMillicents: null })]));

    expect(line).toContain(";;");
  });

  it("porte les TROIS prix, dont celui qui sera facturé", () => {
    const line = firstBodyLine(
      catalogCsv([
        item({
          pimPriceMillicents: 240_000,
          b2bPriceMillicents: 210_000,
          effectivePriceMillicents: 210_000,
        }),
      ]),
    );

    // La règle « B2B s'il existe, PIM sinon » est du domaine ; la refaire à la
    // main dans un tableur est la façon dont on se trompe d'une ligne sur deux.
    expect(line).toContain("2,40;2,10;2,10");
  });

  it("échappe un point-virgule dans un nom — sinon la ligne entière se décale", () => {
    const line = firstBodyLine(catalogCsv([item({ name: "Tarte citron ; meringuée" })]));

    expect(line).toContain('"Tarte citron ; meringuée"');
    expect(line.split(";").length).toBe(9);
  });

  it("double les guillemets, comme le RFC le demande", () => {
    const line = firstBodyLine(catalogCsv([item({ name: 'Pain "spécial"' })]));

    expect(line).toContain('"Pain ""spécial"""');
  });

  it("🔴 dit « Sans taux de TVA » et non « En vente » — l'article n'est pas vendable", () => {
    // Régression de conception : `isHidden` est faux, donc une lecture naïve
    // aurait écrit « En vente » sur un article que la boutique écarte.
    const line = firstBodyLine(catalogCsv([item({ vatRatePercent: null, isHidden: false })]));

    expect(line).toContain("Sans taux de TVA");
    expect(line).not.toContain("En vente");
    // Et le taux reste VIDE : un « 0 » ferait lire un article exonéré.
    expect(line).toContain(";;Sans taux de TVA");
  });

  it("distingue masqué et sans taux — deux causes, deux gestes", () => {
    const lines = bodyLines(
      catalogCsv([
        item({ sku: "A", isHidden: true }),
        item({ sku: "B", vatRatePercent: null }),
        item({ sku: "C" }),
      ]),
    );

    expect(lines[0]).toContain("Masqué");
    expect(lines[1]).toContain("Sans taux de TVA");
    expect(lines[2]).toContain("En vente");
  });

  it("rend l'en-tête seul sur un catalogue vide, pas un fichier vide", () => {
    // Un fichier de zéro octet ressemble à un téléchargement raté. Un en-tête
    // seul dit « rien à exporter », ce qui est une réponse.
    const csv = catalogCsv([]);

    expect(bodyLines(csv)).toEqual([]);
    expect(csv).toContain("SKU;Article");
  });
});
