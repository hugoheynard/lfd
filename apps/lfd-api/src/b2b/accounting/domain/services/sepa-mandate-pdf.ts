import { Buffer } from "node:buffer";

import PDFDocument from "pdfkit";

import type { CreditorSnapshot } from "../creditor-snapshot.js";

/**
 * **La fiche de mandat SEPA, préremplie de NOTRE côté** — l'exemplaire vierge
 * qu'on imprime pour le faire signer.
 *
 * Le modèle est celui de la norme (EPC / CFONB) : ses zones numérotées et son
 * texte d'autorisation ne sont pas une maquette qu'on arrange. Un mandat dont la
 * mention légale a été reformulée est un mandat que la banque du débiteur peut
 * écarter — et elle l'écarte au moment du prélèvement, c'est-à-dire des semaines
 * après la signature.
 *
 * ## Ce qu'il remplit, et ce qu'il laisse vide
 *
 * **Rempli — notre bloc créancier** (zones 7 à 11) : raison sociale, ICS,
 * adresse. C'est la moitié du document qu'un client ne peut pas connaître, et la
 * seule qu'une erreur de saisie rendrait inexploitable en masse.
 *
 * **Vide — le bloc débiteur** (zones 1 à 6), le lieu, la date et la signature.
 * Ce rendu ne connaît aucun client : c'est un EXEMPLE, tiré depuis la fiche de
 * l'entité. Le mandat nominatif — celui qui porte un débiteur et sa RUM — est un
 * autre document, qui suppose l'agrégat de mandat.
 *
 * ## 🔴 L'IBAN du créancier n'est PAS sur cette fiche
 *
 * `CreditorSnapshot` le porte, et les zones 5 et 6 lui ressemblent — mais elles
 * appellent l'IBAN et le BIC **du débiteur**. Imprimer le nôtre à cet endroit
 * produirait un mandat qui nous autorise à nous prélever nous-mêmes, et le ferait
 * circuler chez chaque client. Ce fichier ne lit donc jamais
 * `creditor.creditorIban`, et un test le tient.
 *
 * ## Les zones 14 à 20 sont absentes, et c'est un choix
 *
 * La norme les range sous « informations relatives au contrat entre le créancier
 * et le débiteur — fournies seulement à titre indicatif » : code identifiant du
 * débiteur, tiers débiteur, tiers créancier, numéro de contrat. Aucune ne
 * conditionne la validité du mandat, et nous n'encaissons ni pour un tiers ni
 * via un tiers. Les imprimer vides ferait une page de zones que personne ne
 * remplit — et une zone vide sur un formulaire se lit comme un oubli.
 *
 * À rouvrir le jour où nous prélèverions pour le compte d'un tiers : c'est la
 * zone 17 qui deviendrait obligatoire.
 *
 * ## La mention « EXEMPLE », et pourquoi elle est dans le dessin
 *
 * Elle est écrite en travers de la page, pas dans un coin. Une fiche vierge
 * imprimée traîne sur un bureau ; sans marque, rien ne la distingue d'un mandat
 * prêt à signer, et une signature apposée dessus créerait un mandat sans RUM —
 * inutilisable, mais que le client croirait avoir donné.
 *
 * ## Déterministe
 *
 * Mêmes entrées, mêmes octets — comme `order-sheet-pdf.ts`, et pour une raison
 * plus simple : cette fiche n'est pas archivée, mais elle est **comparable**. Un
 * test qui rend deux fois la même entité doit obtenir le même fichier, sinon il
 * ne peut rien affirmer. D'où la date figée ci-dessous.
 */

/** A4 en points PostScript, et le millimètre dans lequel le dessin est spécifié. */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MM = PAGE_WIDTH / 210;
const MARGIN_X = 15 * MM;
const MARGIN_Y = 14 * MM;
const CONTENT_LEFT = MARGIN_X;
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN_X;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;

/** La colonne des libellés de gauche — « Votre nom », « Nom du créancier ». */
const LABEL_WIDTH = 38 * MM;
const FIELD_LEFT = CONTENT_LEFT + LABEL_WIDTH;
const FIELD_WIDTH = CONTENT_RIGHT - FIELD_LEFT;

const BLACK = "#000000";
/** Le gris des traits à remplir : visible à l'impression, discret à l'écran. */
const RULE_GRAY = "#767676";
/** Le gris de la mention « EXEMPLE » en travers de la page. */
const WATERMARK_GRAY = "#DCDCDC";

const REGULAR = "Helvetica";
const BOLD = "Helvetica-Bold";
const OBLIQUE = "Helvetica-Oblique";

/**
 * 🔴 **Date figée, et ce n'est pas un contournement du port d'horloge.**
 *
 * `pdfkit` pose sinon une `/CreationDate` tirée de l'horloge système, et deux
 * rendus de la même entité donneraient des octets différents. Cette fiche
 * n'atteste d'aucun instant : elle n'est ni signée, ni archivée, ni opposable —
 * la dater reviendrait à lui prêter une valeur qu'elle n'a pas. Le vrai mandat,
 * lui, portera la date de sa signature.
 *
 * Le domaine reste pur : c'est une CONSTANTE du document, pas une lecture de
 * `new Date()`.
 */
const FROZEN_DATE = new Date(Date.UTC(2000, 0, 1));

/** Le texte d'autorisation de la norme. Le nom du créancier s'y substitue. */
function authorizationText(creditorName: string): string {
  return (
    `En signant ce formulaire de mandat, vous autorisez ${creditorName} à envoyer des instructions ` +
    `à votre banque pour débiter votre compte, et votre banque à débiter votre compte conformément ` +
    `aux instructions de ${creditorName}.`
  );
}

const RIGHTS_TEXT =
  "Vous bénéficiez du droit d'être remboursé par votre banque selon les conditions décrites dans " +
  "la convention que vous avez passée avec elle. Une demande de remboursement doit être présentée : " +
  "dans les 8 semaines suivant la date de débit de votre compte pour un prélèvement autorisé, et " +
  "sans tarder et au plus tard dans les 13 mois en cas de prélèvement non autorisé.";

const CLOSING_NOTE =
  "Note : vos droits concernant le présent mandat sont expliqués dans un document que vous pouvez " +
  "obtenir auprès de votre banque.";

/** Le document en cours de dessin. `pdfkit` tient la plume, on tient le plan. */
type Doc = PDFKit.PDFDocument;

interface TextOptions {
  readonly size: number;
  readonly font?: string;
  readonly width?: number;
  readonly color?: string;
}

/** Pose un texte à une position absolue. `lineBreak: false` sauf largeur donnée. */
function put(doc: Doc, text: string, x: number, y: number, options: TextOptions): void {
  doc
    .font(options.font ?? REGULAR)
    .fontSize(options.size)
    .fillColor(options.color ?? BLACK)
    .text(
      text,
      x,
      y,
      options.width === undefined ? { lineBreak: false } : { width: options.width },
    );
}

/** Un paragraphe justifié, et l'ordonnée où il se termine. */
function paragraph(doc: Doc, text: string, y: number, size: number): number {
  doc.font(REGULAR).fontSize(size).fillColor(BLACK);
  const height = doc.heightOfString(text, { width: CONTENT_WIDTH, align: "justify" });
  doc.text(text, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "justify" });
  return y + height;
}

/** Un filet horizontal. La couleur est REMISE à noir : l'état graphique est global. */
function bar(
  doc: Doc,
  x: number,
  y: number,
  width: number,
  thickness: number,
  color: string,
): void {
  doc.save().rect(x, y, width, thickness).fill(color).restore();
  doc.fillColor(BLACK);
}

/**
 * Le numéro de zone dans la marge — c'est par lui qu'un chargé de clientèle et
 * un banquier désignent la même ligne au téléphone, et la norme les fixe.
 *
 * `null` pour les zones que la norme ne numérote pas : la RUM en est une, et lui
 * inventer un « 0 » ferait référence à une case qui n'existe chez personne.
 */
function boxNumber(doc: Doc, value: number | null, y: number): void {
  if (value === null) {
    return;
  }
  put(doc, String(value), CONTENT_RIGHT + 1.5 * MM, y + 1.5 * MM, { size: 6, color: RULE_GRAY });
}

/** Une zone **à remplir à la main** : le trait, son libellé dessous, son numéro. */
function blankField(
  doc: Doc,
  y: number,
  caption: string,
  box: number | null,
  x = FIELD_LEFT,
  width = FIELD_WIDTH,
): number {
  bar(doc, x, y + 4 * MM, width, 0.4, RULE_GRAY);
  put(doc, caption, x, y + 4.7 * MM, { size: 6.5, color: RULE_GRAY });
  boxNumber(doc, box, y);
  return y + 8 * MM;
}

/** Une zone **préremplie** : la valeur en gras sur le trait, son libellé dessous. */
function filledField(doc: Doc, y: number, value: string, caption: string, box: number): number {
  put(doc, value, FIELD_LEFT, y + 0.5 * MM, { size: 10, font: BOLD, width: FIELD_WIDTH });
  bar(doc, FIELD_LEFT, y + 4 * MM, FIELD_WIDTH, 0.4, RULE_GRAY);
  put(doc, caption, FIELD_LEFT, y + 4.7 * MM, { size: 6.5, color: RULE_GRAY });
  boxNumber(doc, box, y);
  return y + 8 * MM;
}

/** Le libellé de la colonne de gauche, aligné sur la première ligne du bloc. */
function blockLabel(doc: Doc, text: string, y: number): void {
  put(doc, text, CONTENT_LEFT, y, { size: 9, font: BOLD, width: LABEL_WIDTH - 3 * MM });
}

/** Une case à cocher vide et son libellé. Rend l'abscisse de fin du libellé. */
function checkbox(doc: Doc, x: number, y: number, label: string): number {
  doc
    .save()
    .lineWidth(0.5)
    .strokeColor(RULE_GRAY)
    .rect(x, y, 3 * MM, 3 * MM)
    .stroke()
    .restore();
  doc.fillColor(BLACK);
  put(doc, label, x + 4.5 * MM, y + 0.6 * MM, { size: 8.5 });
  return x + 4.5 * MM + doc.font(REGULAR).fontSize(8.5).widthOfString(label);
}

/**
 * La mention « EXEMPLE » en travers de la page, posée **en premier** pour rester
 * sous le texte : par-dessus, elle rendrait les zones illisibles, ce qui
 * transformerait une marque en gêne — et une gêne finit par sauter.
 */
function watermark(doc: Doc): void {
  doc.save();
  doc.rotate(-38, { origin: [PAGE_WIDTH / 2, PAGE_HEIGHT / 2] });
  doc.font(BOLD).fontSize(78).fillColor(WATERMARK_GRAY);
  const text = "EXEMPLE";
  const width = doc.widthOfString(text);
  doc.text(text, PAGE_WIDTH / 2 - width / 2, PAGE_HEIGHT / 2 - 30, { lineBreak: false });
  doc.restore();
  doc.fillColor(BLACK);
}

/** L'en-tête : le titre, l'avertissement, et la zone de RUM laissée vide. */
function header(doc: Doc, creditor: CreditorSnapshot): number {
  let y = MARGIN_Y;
  put(doc, "MANDAT DE PRÉLÈVEMENT SEPA", CONTENT_LEFT, y, { size: 15, font: BOLD });
  put(doc, creditor.name, CONTENT_RIGHT - 60 * MM, y + 1 * MM, {
    size: 11,
    font: BOLD,
    width: 60 * MM,
  });
  y += 7 * MM;

  put(
    doc,
    "Modèle vierge, prérempli du bloc créancier — document non contractuel, à ne pas faire signer en l'état.",
    CONTENT_LEFT,
    y,
    { size: 8, font: OBLIQUE, color: RULE_GRAY, width: CONTENT_WIDTH },
  );
  y += 6 * MM;

  // La RUM reste VIDE, et son libellé dit pourquoi : elle est frappée à la
  // création du mandat, donc elle n'existe pas sur un exemplaire vierge.
  blockLabel(doc, "Référence unique du mandat", y);
  y = blankField(doc, y, "RUM — attribuée par le créancier à la création du mandat", null);
  return y + 1 * MM;
}

/** Le bloc du débiteur : entièrement à remplir. */
function debtorBlock(doc: Doc, y: number): number {
  blockLabel(doc, "Votre nom", y);
  let next = blankField(doc, y, "Nom / prénoms du débiteur", 1);

  blockLabel(doc, "Votre adresse", next);
  next = blankField(doc, next, "Numéro et nom de la rue", 2);
  const half = FIELD_WIDTH / 2 - 3 * MM;
  bar(doc, FIELD_LEFT, next + 4 * MM, half, 0.4, RULE_GRAY);
  put(doc, "Code postal", FIELD_LEFT, next + 4.7 * MM, { size: 6.5, color: RULE_GRAY });
  next = blankField(doc, next, "Ville", 3, FIELD_LEFT + half + 6 * MM, half);
  next = blankField(doc, next, "Pays", 4);

  blockLabel(doc, "Les coordonnées de votre compte", next);
  next = blankField(
    doc,
    next,
    "IBAN — numéro d'identification international du compte bancaire",
    5,
  );
  next = blankField(doc, next, "BIC — code international d'identification de votre banque", 6);
  return next;
}

/**
 * Le bloc du créancier : **notre côté**, recopié du snapshot.
 *
 * L'adresse arrive en lignes déjà composées par le value object. Les deux
 * dernières (code postal / ville, puis pays) occupent les zones 10 et 11 ; ce
 * qui précède tient dans la zone 9.
 */
function creditorBlock(doc: Doc, y: number, creditor: CreditorSnapshot): number {
  blockLabel(doc, "Nom du créancier", y);
  let next = filledField(doc, y, creditor.name, "Nom du créancier", 7);
  next = filledField(doc, next, creditor.ics, "Identifiant créancier SEPA (ICS)", 8);

  const lines = [...creditor.addressLines];
  const country = lines.length > 1 ? (lines.pop() ?? "") : "";
  const cityLine = lines.length > 1 ? (lines.pop() ?? "") : "";
  next = filledField(doc, next, lines.join(", "), "Numéro et nom de la rue", 9);
  next = filledField(doc, next, cityLine, "Code postal et ville", 10);
  next = filledField(doc, next, country, "Pays", 11);
  return next;
}

/** Type de paiement, lieu, date, signature — tout ce que le signataire pose. */
function signatureBlock(doc: Doc, y: number): number {
  blockLabel(doc, "Type de paiement", y);
  const end = checkbox(doc, FIELD_LEFT, y, "Paiement récurrent / répétitif");
  checkbox(doc, end + 10 * MM, y, "Paiement ponctuel");
  boxNumber(doc, 12, y - 1 * MM);
  let next = y + 8 * MM;

  blockLabel(doc, "Signé à", next);
  const half = FIELD_WIDTH / 2 - 3 * MM;
  bar(doc, FIELD_LEFT, next + 4 * MM, half, 0.4, RULE_GRAY);
  put(doc, "Lieu", FIELD_LEFT, next + 4.7 * MM, { size: 6.5, color: RULE_GRAY });
  next = blankField(doc, next, "Date : jj/mm/aaaa", 13, FIELD_LEFT + half + 6 * MM, half);

  blockLabel(doc, "Signature(s)", next);
  bar(doc, FIELD_LEFT, next + 16 * MM, FIELD_WIDTH, 0.4, RULE_GRAY);
  put(doc, "Veuillez signer ici", FIELD_LEFT, next + 16.7 * MM, { size: 6.5, color: RULE_GRAY });
  return next + 21 * MM;
}

function draw(doc: Doc, creditor: CreditorSnapshot): void {
  watermark(doc);
  let y = header(doc, creditor);
  y = paragraph(doc, authorizationText(creditor.name), y, 8.5) + 2 * MM;
  y = paragraph(doc, RIGHTS_TEXT, y, 7.5) + 3 * MM;
  put(doc, "Veuillez compléter les champs marqués *", CONTENT_LEFT, y, { size: 8, font: BOLD });
  y += 6 * MM;
  y = debtorBlock(doc, y) + 2 * MM;
  y = creditorBlock(doc, y, creditor) + 2 * MM;
  y = signatureBlock(doc, y);
  paragraph(doc, CLOSING_NOTE, y, 7);
}

/**
 * Rend la fiche de mandat préremplie. **Déterministe** : mêmes entrées, mêmes
 * octets.
 *
 * Prend le snapshot plutôt que l'agrégat, et c'est ce qui rend l'incomplétude
 * inexprimable : `creditorSnapshot()` refuse de rendre une copie à qui n'a pas
 * d'ICS, donc aucune fiche ne peut sortir avec une zone 8 vide.
 */
export async function renderSepaMandatePdf(creditor: CreditorSnapshot): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    // `Producer` et `Creator` en dur, comme pour le bon de commande : laissés à
    // `pdfkit`, ils porteraient son numéro de version, et une montée de
    // dépendance changerait les octets d'un document qu'on compare.
    info: {
      Title: `Mandat SEPA (exemple) - ${creditor.name}`,
      Author: creditor.name,
      Producer: "La Folie Coffee",
      Creator: "La Folie Coffee",
      CreationDate: FROZEN_DATE,
      ModDate: FROZEN_DATE,
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => {
    doc.on("end", () => {
      resolve();
    });
  });
  draw(doc, creditor);
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

/** Le nom proposé au téléchargement — lisible sur un bureau, pas une clé opaque. */
export function sampleMandateFileName(creditor: CreditorSnapshot): string {
  const slug = creditor.name
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/gu, "")
    .replace(/[^A-Za-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
  return `mandat-sepa-exemple-${slug}.pdf`;
}
