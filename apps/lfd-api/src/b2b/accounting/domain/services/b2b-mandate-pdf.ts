import type { Buffer } from "node:buffer";

import {
  accountBlock,
  creditorBlock,
  debtorBlock,
  holderBlock,
  paymentTypeRow,
  rumBlock,
  signatureBlock,
} from "./b2b-mandate-blocks.js";
import { BAND_GRAY, cell, LEFT, RIGHT, WIDTH } from "./b2b-mandate-grid.js";
import {
  BLACK,
  BOLD,
  BOLD_OBLIQUE,
  box,
  creditorAddressOn,
  creditorNameOn,
  type Doc,
  type MandateDrawing,
  MM,
  put,
  REGULAR,
  watermark,
} from "./mandate-pdf-drawing.js";
import type { CreditorSnapshot } from "../creditor-snapshot.js";
import { SEPA_MANDATE_WORDING } from "./sepa-mandate-wording.js";

/**
 * **Le mandat interentreprises (SDD B2B)** — d'après le gabarit de la DGFiP
 * (`mandat_prelevement_sepa_interentreprise.pdf`), dans le même ordre de blocs.
 *
 * Ce qui en est retiré, et pourquoi (§3.2 de `documentation/comptabilite/plan-mandat-deux-schemas.md`) :
 *
 * - **Marianne, logo et nom de la DGFiP, service gestionnaire, préfixe `DGFIP`
 *   de la RUM** : ils désignent le créancier du gabarit, pas nous. Notre logo
 *   d'entité prend la place de l'en-tête, et reste une place vide sans logo ;
 * - **les zones 14, 19 et 20** (code débiteur, numéro et description du
 *   contrat) : le gabarit n'en a pas (décision Q2) ;
 * - **la mention loi 78-17, articles 38 et suivants** : l'article cité n'est
 *   plus la base de ces droits depuis 2018. Une mention RGPD au nom du créancier
 *   la remplace — 🟠 **texte à relire par Hugo** (décision Q5).
 *
 * 🔴 Le **filigrane EXEMPLE** survit à la mise en page : un seul paramètre,
 * `issuance`, commande la RUM et sa disparition, comme en CORE.
 */

/**
 * La mention « données personnelles », au nom du créancier imprimé.
 * `{creditor}` est remplacé à l'impression.
 */
const PERSONAL_DATA_NOTICE =
  "Les informations de ce mandat sont traitées par {creditor}, responsable du traitement, pour " +
  "la gestion de vos prélèvements SEPA, sur la base du contrat qui nous lie. Elles ne sont " +
  "communiquées qu'aux établissements bancaires qui exécutent ces prélèvements, et conservées " +
  "pendant la durée du mandat puis pendant les délais légaux de contestation et de conservation " +
  "comptable. Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation et " +
  "d'opposition, en écrivant au créancier à l'adresse ci-dessus, ainsi que du droit d'introduire " +
  "une réclamation auprès de la CNIL.";

const TEXT_SIZE = 9;
const WHITE = "#FFFFFF";
/** L'écart entre le pavé de texte et le tableau, puis entre débiteur et créancier. */
const GAP = 4 * MM;

/** Dessine le mandat interentreprises, de haut en bas. */
export function drawB2bMandate(doc: Doc, drawing: MandateDrawing): void {
  const { creditor, debtor, issuance } = drawing;
  if (issuance === null) {
    watermark(doc);
  }
  let y = title(doc, letterhead(doc, creditor, drawing.logo), issuance !== null);
  y = instructions(doc, y);
  y = authorization(doc, y, creditorNameOn(creditor));

  y = rumBlock(doc, y + GAP, issuance?.reference ?? "");
  y = debtorBlock(doc, y, debtor);
  y = holderBlock(doc, y, debtor);
  y = accountBlock(doc, y, debtor);

  const creditorTop = y + GAP;
  y = creditorBlock(doc, creditorTop, creditor);
  y = paymentTypeRow(doc, y, drawing.form.paymentType);
  y = signatureBlock(doc, y);
  y = personalDataNotice(doc, y, creditorNameOn(creditor));
  box(doc, LEFT, creditorTop, WIDTH, y - creditorTop);
}

/** Le côté du carré où le logo s'inscrit ; le texte du bandeau se centre sur lui. */
const LETTERHEAD_SIDE = 22 * MM;
const LETTERHEAD_TOP = 10 * MM;
/** Le gris des lignes secondaires du bandeau : lisible, et qui laisse le nom devant. */
const LETTERHEAD_GRAY = "#4D4D4D";

/**
 * **L'en-tête du créancier** — logo à gauche, identité à sa droite, un filet
 * dessous. Là où le gabarit DGFiP porte la Marianne et le logo des Finances
 * publiques : ils désignent SON créancier, et les recopier ferait croire à un
 * document de l'administration.
 *
 * Le nom imprimé est celui que la banque connaît (`creditorNameOn`), le même que
 * dans le pavé d'autorisation : un en-tête qui dirait la raison sociale du
 * registre au-dessus d'une autorisation donnée au titulaire du compte montrerait
 * deux noms au débiteur pour une seule autorisation.
 *
 * Sans logo, l'identité prend la place à gauche — jamais une case vide ni un
 * « logo manquant » imprimé. Le logo garde ses proportions (`fit`) : le VO le
 * garantit sensiblement carré, pas exactement.
 *
 * @returns l'ordonnée où le titre commence.
 */
function letterhead(doc: Doc, creditor: CreditorSnapshot, logo: Buffer | null): number {
  const top = LETTERHEAD_TOP;
  let textX = LEFT;
  if (logo !== null) {
    doc.image(logo, LEFT, top, {
      fit: [LETTERHEAD_SIDE, LETTERHEAD_SIDE],
      align: "center",
      valign: "center",
    });
    textX = LEFT + LETTERHEAD_SIDE + 6 * MM;
  }
  const width = RIGHT - textX;
  const lines = [
    { text: creditorNameOn(creditor), size: 13, font: BOLD, color: BLACK },
    {
      text: creditorAddressOn(creditor).join(" · "),
      size: 8.5,
      font: REGULAR,
      color: LETTERHEAD_GRAY,
    },
    {
      text: `Identifiant créancier SEPA : ${creditor.ics}`,
      size: 8.5,
      font: REGULAR,
      color: LETTERHEAD_GRAY,
    },
  ];
  const gap = 1.2 * MM;
  let total = gap * (lines.length - 1);
  for (const line of lines) {
    total += doc.font(line.font).fontSize(line.size).heightOfString(line.text, { width });
  }

  let y = top + Math.max(0, (LETTERHEAD_SIDE - total) / 2);
  for (const line of lines) {
    doc
      .font(line.font)
      .fontSize(line.size)
      .fillColor(line.color)
      .text(line.text, textX, y, { width });
    y = doc.y + gap;
  }
  doc.fillColor(BLACK);

  const rule = Math.max(top + LETTERHEAD_SIDE, y) + 3 * MM;
  doc.moveTo(LEFT, rule).lineTo(RIGHT, rule).lineWidth(0.6).strokeColor(BAND_GRAY).stroke();
  doc.strokeColor(BLACK);
  return rule + 4 * MM;
}

/** Le titre encadré. Le sous-titre « exemple » tombe avec le filigrane. */
function title(doc: Doc, top: number, issued: boolean): number {
  const wording = SEPA_MANDATE_WORDING.B2B;
  const height = 7 * MM;
  box(doc, LEFT, top, WIDTH, height);
  put(doc, issued ? wording.issuedTitle : wording.sampleTitle, LEFT, top + 2.1 * MM, {
    size: 10.5,
    font: BOLD,
    width: WIDTH,
    align: "center",
  });
  return top + height + 3 * MM;
}

/**
 * Le bandeau gris : transmettre le mandat à sa banque, et lui faire enregistrer
 * la RUM. C'est une ÉTAPE, pas une remarque — en interentreprises, la banque du
 * débiteur refuse le premier prélèvement d'un mandat qu'elle ne connaît pas.
 */
function instructions(doc: Doc, top: number): number {
  const text = SEPA_MANDATE_WORDING.B2B.bankDeclaration ?? "";
  const width = WIDTH - 8 * MM;
  doc.font(BOLD_OBLIQUE).fontSize(10.5);
  const height = doc.heightOfString(text, { width, align: "center" }) + 5 * MM;
  cell(doc, LEFT, top, WIDTH, height, BAND_GRAY);
  doc
    .font(BOLD_OBLIQUE)
    .fontSize(10.5)
    .fillColor(WHITE)
    .text(text, LEFT + 4 * MM, top + 2.5 * MM, { width, align: "center", underline: true });
  doc.fillColor(BLACK);
  return top + height;
}

/**
 * Le pavé d'autorisation, **au nom du créancier imprimé** là où le gabarit
 * nomme la DGFiP — aux deux occurrences, sans quoi le papier autoriserait un
 * nom et en nommerait un autre.
 */
function authorization(doc: Doc, top: number, creditorName: string): number {
  const wording = SEPA_MANDATE_WORDING.B2B;
  const x = LEFT + 3 * MM;
  const width = WIDTH - 6 * MM;
  const justified = { width, align: "justify" } as const;

  doc.font(REGULAR).fontSize(TEXT_SIZE).fillColor(BLACK);
  doc.text(
    `En signant ce formulaire de mandat, vous autorisez ${creditorName} à envoyer des ` +
      "instructions à votre banque pour débiter votre compte, et votre banque à débiter votre " +
      `compte conformément aux instructions de ${creditorName}.`,
    x,
    top + 3 * MM,
    justified,
  );

  doc.text(`${wording.authorizationTerms.join(" ")} `, x, doc.y + 2 * MM, {
    ...justified,
    continued: true,
  });
  doc.font(BOLD).text(wording.refundWaiver ?? "", { continued: false });

  doc.font(REGULAR).text("Veuillez ", x, doc.y + 2.5 * MM, { continued: true });
  doc.font(BOLD).text("obligatoirement compléter les", { continued: true });
  doc.font(REGULAR).text(" champs marqués *.", { continued: false });

  const bottom = doc.y + 3 * MM;
  box(doc, LEFT, top, WIDTH, bottom - top);
  return bottom;
}

/** Le pied : la mention RGPD, justifiée, dans le cadre du créancier. */
function personalDataNotice(doc: Doc, top: number, creditorName: string): number {
  const text = PERSONAL_DATA_NOTICE.replace("{creditor}", creditorName);
  const width = WIDTH - 4 * MM;
  put(doc, text, LEFT + 2 * MM, top + 1.5 * MM, { size: 6.8, width, align: "justify" });
  const bottom = doc.y + 1.5 * MM;
  doc.save().lineWidth(0.6).moveTo(LEFT, top).lineTo(RIGHT, top).stroke().restore();
  return bottom;
}
