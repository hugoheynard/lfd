import { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";

// Extrait de `sepa-mandate-pdf.spec.ts` le 2026-09-14 : deux suites lisent
// désormais le texte du mandat (le rendu, et l'accord du schéma avec le lot), et
// un second extracteur recopié retomberait dans les deux pièges ci-dessous.

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
export function drawnText(pdf: Buffer): string {
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
