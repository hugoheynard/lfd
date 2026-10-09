import { Buffer } from "node:buffer";

import PDFDocument from "pdfkit";

import type { InvoicePdfFonts } from "../ports/invoice-font-source.js";
import { FACTURX_FILE_NAME, facturXXmp } from "./facturx-xmp.js";

/**
 * **Le contenant PDF/A-3 d'une facture Factur-X** (plan
 * `facture-emise.md`) : niveau, profil de couleur,
 * polices embarquées, XML joint, métadonnées. La mise en page, elle, est
 * dans `invoice-pdf.ts` ; ce fichier ne sait rien de ce qui est dessiné.
 *
 * ## PDF/A-3**b**, et pourquoi pas **a**
 *
 * `pdfkit` 0.20 tient le niveau B : profil sRGB en `OutputIntent`, `pdfaid`
 * dans le XMP, polices embarquées. Le niveau A exige en plus un document
 * BALISÉ (arbre de structure complet, chaque texte rattaché à un rôle), que
 * `pdfkit` permet mais ne fait pas tout seul ; un balisage partiel serait un
 * A déclaré et faux. Factur-X demande PDF/A-3 « au moins B ». `3u` n'existe
 * pas dans `pdfkit`.
 *
 * ## Les polices
 *
 * PDF/A interdit une police non embarquée : les quatorze polices standard de
 * `pdfkit` (Helvetica…) en sont exclues, d'où Source Sans 3 (OFL) en deux
 * graisses, reçues en octets par le port `InvoiceFontSource`.
 *
 * ## Déterministe, au bit près
 *
 * Toutes les dates du fichier sont le jour d'émission de la pièce (une
 * donnée, pas l'horloge) ; l'identifiant du fichier en dérive (`pdfkit` le
 * hache de ses métadonnées). Rendre deux fois la même pièce rend les mêmes
 * octets, donc la même empreinte : c'est ce qui permet de reprendre un rendu
 * interrompu entre le dépôt et l'attache sans écraser la pièce gardée.
 * ⚠️ Vrai tant que le logo de l'entité ne change pas entre les deux rendus.
 */

/** Les noms sous lesquels les deux graisses sont enregistrées dans le document. */
export const REGULAR = "invoice-regular";
export const BOLD = "invoice-bold";

/** Le document en cours de dessin. */
export type InvoiceDoc = PDFKit.PDFDocument;

/** Ce que le contenant reçoit — tout sauf le dessin. */
export interface FacturXPdfInput {
  /** « Facture FA-2026-000001 » — le titre du document (Info et XMP). */
  readonly title: string;
  /** `AAAA-MM-JJ` : la date de toutes les métadonnées du fichier. */
  readonly issuedOn: string;
  /** Le XML CII, joint tel quel, octet pour octet. */
  readonly xml: string;
  readonly fonts: InvoicePdfFonts;
}

/**
 * La relation PDF/A-3 de la pièce jointe (`AFRelationship`). `pdfkit` 0.20 la
 * lit ; `@types/pdfkit` 0.17 ne la déclare pas, d'où ce type élargi passé par
 * variable plutôt que par un littéral (qui serait refusé en propriété en trop).
 */
type AttachmentOptions = PDFKit.Mixins.PDFAttachmentOptions & {
  readonly relationship: "Alternative";
};

/** Le producteur gravé : laissé à `pdfkit`, il porterait son numéro de version. */
const PRODUCER = "La Folie Coffee";

/**
 * Ouvre le document PDF/A-3b, laisse `draw` dessiner (pages en mémoire, pour
 * que le pied de page sache le nombre total), joint le XML, rend les octets.
 */
export async function renderFacturXPdf(
  input: FacturXPdfInput,
  draw: (doc: InvoiceDoc) => void,
): Promise<Buffer> {
  const at = new Date(`${input.issuedOn}T00:00:00.000Z`);
  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    pdfVersion: "1.7",
    subset: "PDF/A-3b",
    bufferPages: true,
    lang: "fr-FR",
    info: { Title: input.title, Producer: PRODUCER, Creator: PRODUCER, CreationDate: at },
  });
  doc.registerFont(REGULAR, input.fonts.regular);
  doc.registerFont(BOLD, input.fonts.bold);
  doc.font(REGULAR);
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => {
    doc.on("end", () => {
      resolve();
    });
  });
  draw(doc);
  const attachment: AttachmentOptions = {
    name: FACTURX_FILE_NAME,
    type: "text/xml",
    description: "Factur-X EN 16931",
    relationship: "Alternative",
    creationDate: at,
    modifiedDate: at,
  };
  doc.file(Buffer.from(input.xml, "utf8"), attachment);
  doc.appendXML(facturXXmp());
  doc.end();
  await done;
  return Buffer.concat(chunks);
}
