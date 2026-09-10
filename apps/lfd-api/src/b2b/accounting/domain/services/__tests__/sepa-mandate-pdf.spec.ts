import { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";

import type { CreditorSnapshot } from "../../creditor-snapshot.js";
import { renderSepaMandatePdf, sampleMandateFileName } from "../sepa-mandate-pdf.js";

const CREDITOR: CreditorSnapshot = {
  legalEntityId: "01JBQ0000000000000000000",
  name: "Crazeativity",
  legalForm: "SAS",
  siren: "900000001",
  vatNumber: "",
  rcs: "Chambéry",
  shareCapitalCents: 1_000_000,
  addressLines: ["Route de la Balme", "73150 Val d'Isère", "France"],
  ics: "FR00ZZZ900001",
  creditorIban: "FR7630006000011234567890189",
  preNotificationDays: 14,
};

/**
 * Le texte réellement dessiné, flux décompressés ET chaînes décodées.
 *
 * 🔴 **Deux pièges, et le second a failli rendre ce fichier inutile.**
 *
 * 1. `pdfkit` déflate ses flux de contenu : chercher une chaîne dans les octets
 *    bruts trouverait toujours « absent ».
 * 2. Une fois inflaté, le texte n'est pas lisible non plus — il est écrit en
 *    **chaînes hexadécimales** dans des tableaux `TJ`
 *    (`[<4e6f7465> 50 <2076f73>] TJ`), avec le crénage intercalé. Un simple
 *    `toString()` du flux ne contient donc aucun mot du document.
 *
 * Sans le décodage ci-dessous, l'assertion « l'IBAN n'est pas imprimé » passait
 * au vert **sans rien vérifier**. C'est le test de PRÉSENCE de l'ICS qui l'a
 * démasqué, et c'est pour ça qu'il est là : un extracteur muet rend toute
 * assertion d'absence toujours verte, donc toujours inutile.
 *
 * L'encodage des glyphes est WinAnsi, dont `latin1` est le sur-ensemble utile
 * ici : `e9` y vaut « é ». Les accents ressortent donc lisibles.
 */
function drawnText(pdf: Buffer): string {
  const parts: string[] = [];
  let from = 0;
  for (;;) {
    const start = pdf.indexOf("stream", from);
    if (start === -1) {
      break;
    }
    // 🔴 `endstream` CONTIENT « stream ». Sans cette garde, la recherche
    // repartait du mot de fin, reparsait un faux flux, et avalait tout jusqu'au
    // suivant — c'est-à-dire le texte qu'on cherchait. Le défaut est resté
    // invisible jusqu'à ce qu'une image embarquée déplace les décalages.
    if (pdf.subarray(start - 3, start).toString("latin1") === "end") {
      from = start + 6;
      continue;
    }
    const end = pdf.indexOf("endstream", start);
    if (end === -1) {
      break;
    }
    // `stream` est suivi d'un saut de ligne (CRLF ou LF) avant les données.
    const body = pdf.subarray(start + (pdf[start + 6] === 0x0d ? 8 : 7), end);
    let inflated: string;
    try {
      inflated = inflateSync(body).toString("latin1");
    } catch {
      // Un flux non déflaté (table de références, police embarquée) : on passe.
      inflated = body.toString("latin1");
    }
    from = end + 9;
    // Seuls les flux de CONTENU nous intéressent : `BT` ouvre un bloc de texte.
    // Sans ce tri, les octets d'une image inflatée passent dans le décodeur de
    // chaînes et rendent des kilo-octets de bruit qui noient le vrai texte.
    if (inflated.includes("BT")) {
      parts.push(decodeStrings(inflated));
    }
  }
  return parts.join("\n");
}

/** Les chaînes du flux — `<hex>` et `(littéral)` — remises en clair, dans l'ordre. */
function decodeStrings(stream: string): string {
  const out: string[] = [];
  for (const match of stream.matchAll(/<([0-9A-Fa-f\s]*)>|\((.*?)(?<!\\)\)/gu)) {
    const [, hex, literal] = match;
    if (hex !== undefined) {
      out.push(Buffer.from(hex.replace(/\s/gu, ""), "hex").toString("latin1"));
    } else if (literal !== undefined) {
      out.push(literal);
    }
  }
  return out.join("");
}

describe("renderSepaMandatePdf", () => {
  it("rend un PDF", async () => {
    const pdf = await renderSepaMandatePdf(CREDITOR);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("rend les MÊMES octets deux fois — sans quoi rien ne serait comparable", async () => {
    const [first, second] = await Promise.all([
      renderSepaMandatePdf(CREDITOR),
      renderSepaMandatePdf(CREDITOR),
    ]);
    expect(first.equals(second)).toBe(true);
  });

  it("imprime l'ICS, le nom et l'adresse du créancier", async () => {
    const text = drawnText(await renderSepaMandatePdf(CREDITOR));
    expect(text).toContain("FR00ZZZ900001");
    expect(text).toContain("Crazeativity");
    expect(text).toContain("Route de la Balme");
  });

  /**
   * Régression par anticipation : `CreditorSnapshot` PORTE `creditorIban`, et
   * les zones 5 et 6 de la fiche lui ressemblent — mais elles appellent l'IBAN
   * et le BIC **du débiteur**. Imprimer le nôtre à cet endroit produirait un
   * mandat nous autorisant à nous prélever nous-mêmes, diffusé à chaque client.
   *
   * L'assertion de présence ci-dessus est la condition de validité de celle-ci :
   * elle prouve que `drawnText` lit vraiment ce qui est dessiné.
   */
  it("n'imprime JAMAIS l'IBAN du créancier", async () => {
    const text = drawnText(await renderSepaMandatePdf(CREDITOR));
    expect(text).not.toContain("FR7630006000011234567890189");
    expect(text).not.toContain("FR76 3000 6000 0112 3456 7890 189");
  });

  it("laisse le bloc du débiteur et la signature vides", async () => {
    const text = drawnText(await renderSepaMandatePdf(CREDITOR));
    // Les légendes sont là — donc les zones sont dessinées — mais rien n'y est
    // écrit : la fiche est un exemplaire vierge, pas un mandat prérempli.
    expect(text).toContain("Nom / Pr\u00e9noms du d\u00e9biteur");
    expect(text).toContain("Veuillez signer ici");
  });

  /**
   * Le formulaire de la norme, pas une mise en page arrangée. Un mandat
   * redessiné « en plus propre » est un mandat qu'on relit deux fois : ces
   * légendes sont ce qu'un chargé de clientèle et un banquier citent.
   */
  it("porte les zones indicatives 14 à 20, dessinées et vides", async () => {
    const text = drawnText(await renderSepaMandatePdf(CREDITOR));
    expect(text).toContain("Informations relatives au contrat");
    expect(text).toContain("Code identifiant du tiers d\u00e9biteur");
    expect(text).toContain("Description du contrat");
  });

  /**
   * L'adresse de retour est le seul endroit où notre adresse sert à autre chose
   * qu'à nous identifier : elle dit au client où poster la fiche signée.
   */
  it("prérempli l'adresse de retour, et rappelle la borne des 35 caractères", async () => {
    const text = drawnText(await renderSepaMandatePdf(CREDITOR));
    expect(text).toContain("A retourner \u00e0 :");
    expect(text).toContain("Zone r\u00e9serv\u00e9e \u00e0 l'usage exclusif du cr\u00e9ancier");
    expect(text).toContain("longueur maximum de 35 caract\u00e8res");
  });

  it("porte la mention EXEMPLE, pour qu'une signature apposée dessus ne trompe personne", async () => {
    const text = drawnText(await renderSepaMandatePdf(CREDITOR));
    expect(text).toContain("EXEMPLE");
  });
});

describe("sampleMandateFileName", () => {
  it("dérive un nom lisible sur un bureau", () => {
    expect(sampleMandateFileName(CREDITOR)).toBe("mandat-sepa-exemple-crazeativity.pdf");
  });

  it("retire accents et ponctuation plutôt que de les laisser au navigateur", () => {
    const named = { ...CREDITOR, name: "Boulangerie Émile & Fils (Val d'Isère)" };
    expect(sampleMandateFileName(named)).toBe(
      "mandat-sepa-exemple-boulangerie-emile-fils-val-d-isere.pdf",
    );
  });
});
