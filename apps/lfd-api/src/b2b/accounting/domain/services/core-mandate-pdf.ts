import type { Buffer } from "node:buffer";

import type { CreditorSnapshot } from "../creditor-snapshot.js";
import type { DebtorSnapshot } from "../debtor-snapshot.js";
import {
  BOX_LEFT,
  BOX_RIGHT,
  caption,
  dottedRow,
  FIELD_RIGHT,
  FIELD_X,
  label,
  LABEL_X,
  leader,
  ROW,
  zone,
} from "./core-mandate-rows.js";
import { creditorZones, debtorZones, signatureZones } from "./core-mandate-zones.js";
import {
  BLACK,
  BOLD,
  box,
  comb,
  creditorAddressOn,
  creditorNameOn,
  type Doc,
  HAIRLINE,
  line,
  type MandateDrawing,
  MM,
  OBLIQUE,
  put,
  REGULAR,
  RULE,
  vline,
  watermark,
} from "./mandate-pdf-drawing.js";
import { SEPA_MANDATE_WORDING } from "./sepa-mandate-wording.js";

/**
 * **Le mandat CORE** — la mise en page du modèle EPC / CFONB : zones numérotées
 * 1 à 20, phrase (A)/(B), cases de type de paiement, zones de contrat.
 *
 * C'était LE rendu jusqu'au 2026-09-15, quand le schéma est devenu un réglage
 * de l'entité (`documentation/comptabilite/plan-mandat-deux-schemas.md`). Son texte est
 * celui de `SEPA_MANDATE_WORDING.CORE` — droit au remboursement, 8 semaines,
 * 13 mois —, restauré depuis `dfeca850^`. Le mandat interentreprises a sa propre
 * mise en page (`b2b-mandate-pdf.ts`), d'après le gabarit DGFiP.
 *
 * Le texte d'autorisation n'est pas une maquette qu'on arrange : un mandat dont
 * la mention légale a été reformulée est un mandat que la banque du débiteur
 * peut écarter — au moment du prélèvement, des semaines après la signature.
 *
 * ## Les zones 14 à 20
 *
 * La norme les range sous « informations relatives au contrat — fournies
 * seulement à titre indicatif ». **14, 19, 20** sont les nôtres à proposer
 * (code débiteur, numéro et description du contrat) ; **15, 16** sont au
 * signataire s'il paie pour un tiers ; **17, 18** restent vides tant que nous
 * n'encaissons pour personne.
 */

const CLOSING_NOTE =
  "Note : vos droits concernant le présent mandat sont expliqués dans un document que vous " +
  "pouvez obtenir auprès de votre banque.";

const CONTRACT_HEADING =
  "Informations relatives au contrat entre le créancier et le débiteur - fournies seulement à " +
  "titre indicatif.";

/** Les deux refends verticaux de la ligne d'en-tête. */
const HEAD_SPLIT_LEFT = 55 * MM;
const HEAD_SPLIT_RIGHT = 163 * MM;

/**
 * Le peigne de la RUM en CORE : 26 cases. Élargi, il dépasserait le refend de
 * l'en-tête et entrerait dans la cellule du logo (vérifié le 2026-09-12).
 */
const CORE_RUM_BOXES = 26;

/**
 * Dessine le mandat CORE.
 *
 * 🔴 **Le filigrane et la RUM sont liés par construction** : il tombe si, et
 * seulement si, une référence est imprimée.
 */
export function drawCoreMandate(doc: Doc, drawing: MandateDrawing): void {
  const { creditor, debtor, issuance } = drawing;
  if (issuance === null) {
    watermark(doc);
  }
  const top = title(doc, issuance !== null);
  let y = header(doc, top, drawing.logo, issuance?.reference ?? "");
  y = authorization(doc, y, creditorNameOn(creditor));
  y = debtorZones(doc, y, debtor);
  y = creditorZones(doc, y, creditor);
  y = signatureZones(doc, y, drawing.form.paymentType);
  y = closingNote(doc, y);
  y = contractZones(doc, y, creditor, debtor);
  y = footer(doc, y, creditor);

  // Le cadre général en dernier : dessiné avant, les remplissages de cases le
  // recouvriraient par endroits.
  box(doc, BOX_LEFT, top, BOX_RIGHT - BOX_LEFT, y - top);
  put(doc, "(1) Cette ligne a une longueur maximum de 35 caractères", BOX_LEFT, y + 2 * MM, {
    size: 7.2,
  });
}

/** Le bandeau de titre, hors cadre — comme sur le modèle. */
function title(doc: Doc, issued: boolean): number {
  // Le sous-titre disparaît AVEC le filigrane : les deux disent « ceci ne se
  // signe pas », et c'est le texte, pas le filigrane, qu'un client lit.
  const wording = SEPA_MANDATE_WORDING.CORE;
  put(doc, issued ? wording.issuedTitle : wording.sampleTitle, BOX_LEFT, 9 * MM, {
    size: 11.5,
    font: BOLD,
    width: BOX_RIGHT - BOX_LEFT,
    align: "center",
  });
  return 14 * MM;
}

/**
 * La ligne d'en-tête : trois cellules, dont le peigne de la **RUM** — vide sur
 * un exemplaire, rempli sur un mandat émis. `comb` refuse au-delà de 26
 * caractères plutôt que de tronquer (`documentation/comptabilite/rum.md` §2).
 */
function header(doc: Doc, top: number, logo: Buffer | null, reference: string): number {
  const bottom = top + 19 * MM;
  vline(doc, HEAD_SPLIT_LEFT, top, bottom, HAIRLINE);
  vline(doc, HEAD_SPLIT_RIGHT, top, bottom, HAIRLINE);

  put(doc, SEPA_MANDATE_WORDING.CORE.headerCell ?? "", FIELD_X + 1 * MM, top + 2 * MM, {
    size: 11,
    font: BOLD,
  });
  comb(
    doc,
    FIELD_X + 1 * MM,
    top + 7 * MM,
    [CORE_RUM_BOXES],
    reference,
    "La référence unique de mandat",
  );
  caption(doc, "Référence unique du mandat", FIELD_X + 1 * MM, top + 12 * MM);

  // 🔴 **Sans logo, la cellule reste VIDE** — ni cadre, ni « logo manquant » :
  // un « logo manquant » IMPRIMÉ se lit comme un défaut du document, et la
  // norme n'exige pas de logo. Le VO garantit une image sensiblement carrée,
  // d'où `width` ET `height`.
  if (logo !== null) {
    const logoSide = 14 * MM;
    const cellWidth = BOX_RIGHT - HEAD_SPLIT_RIGHT;
    doc.image(logo, HEAD_SPLIT_RIGHT + (cellWidth - logoSide) / 2, top + 2.5 * MM, {
      width: logoSide,
      height: logoSide,
    });
  }

  line(doc, BOX_LEFT, bottom, BOX_RIGHT, RULE);
  return bottom;
}

/**
 * Le pavé d'autorisation : la phrase (A)/(B), qui intercale le nom du créancier
 * en italique, puis les paragraphes CORE du texte indexé par le schéma.
 */
function authorization(doc: Doc, top: number, creditorName: string): number {
  const width = BOX_RIGHT - BOX_LEFT - 4 * MM;
  const x = BOX_LEFT + 2 * MM;

  doc.font(REGULAR).fontSize(8.6).fillColor(BLACK);
  doc.text("En signant ce formulaire de mandat, vous autorisez (A) ", x, top + 2 * MM, {
    continued: true,
    width,
  });
  doc.font(OBLIQUE).text(`(${creditorName})`, { continued: true });
  doc
    .font(REGULAR)
    .text(
      " à envoyer des instructions à votre banque pour débiter votre compte, et (B) votre banque à débiter votre compte conformément aux instructions de ",
      { continued: true },
    );
  doc.font(OBLIQUE).text(`(${creditorName})`, { continued: true });
  doc.font(REGULAR).text(".", { continued: false });
  let y = doc.y + 1 * MM;

  for (const paragraph of SEPA_MANDATE_WORDING.CORE.authorizationTerms) {
    put(doc, paragraph, x, y, { size: 8.6, width });
    y = doc.y;
  }

  put(doc, "Veuillez compléter les champs marqués *", x, y + 0.8 * MM, {
    size: 8.6,
    font: OBLIQUE,
  });
  const bottom = y + 5.5 * MM;
  line(doc, BOX_LEFT, bottom, BOX_RIGHT, RULE);
  return bottom;
}

function closingNote(doc: Doc, top: number): number {
  put(doc, CLOSING_NOTE, BOX_LEFT + 2 * MM, top, {
    size: 7.2,
    width: BOX_RIGHT - BOX_LEFT - 4 * MM,
  });
  const bottom = top + 5 * MM;
  line(doc, BOX_LEFT, bottom, BOX_RIGHT, RULE);
  return bottom;
}

/** Les zones 14 à 20 — indicatives, et remplies pour trois d'entre elles. */
function contractZones(
  doc: Doc,
  top: number,
  creditor: CreditorSnapshot,
  debtor: DebtorSnapshot | null,
): number {
  const optional = { required: false } as const;
  put(doc, CONTRACT_HEADING, BOX_LEFT + 2 * MM, top + 1.5 * MM, { size: 7.6, font: BOLD });
  let y = top + 6 * MM;

  label(doc, "Code identifiant\ndu débiteur", y, 9);
  dottedRow(
    doc,
    y,
    "Indiquer ici tout code que vous souhaitez voir restitué par votre banque",
    14,
    {
      ...optional,
      value: debtor?.debtorReference ?? "",
    },
  );
  y += ROW;

  y = thirdPartyDebtor(doc, y, creditorNameOn(creditor));

  dottedRow(doc, y, "Code identifiant du tiers débiteur", 16, optional);
  y += ROW;
  dottedRow(
    doc,
    y,
    "Nom du tiers créancier : le créancier doit compléter cette section s'il remet des prélèvements pour le compte d'un tiers.",
    17,
    optional,
  );
  y += ROW;
  dottedRow(doc, y, "Code identifiant du tiers créancier", 18, optional);
  y += ROW;

  label(doc, "Contrat concerné", y, 9);
  dottedRow(doc, y, "Numéro d'identification du contrat", 19, {
    ...optional,
    value: debtor?.contractNumber ?? "",
  });
  y += ROW;

  dottedRow(doc, y, "Description du contrat", 20, {
    ...optional,
    value: creditor.mandateContractDescription,
  });
  const bottom = y + ROW;
  line(doc, BOX_LEFT, bottom, BOX_RIGHT, RULE);
  return bottom;
}

/** La zone 15 — le tiers débiteur, et ses trois lignes de consigne. */
function thirdPartyDebtor(doc: Doc, y: number, creditorName: string): number {
  label(
    doc,
    "Tiers débiteur pour\nle compte duquel le\npaiement est effectué\n(si différent du débiteur\nlui-même)",
    y,
    9,
  );
  leader(doc, FIELD_X, y + 4 * MM, FIELD_RIGHT);
  zone(doc, 15, y);
  caption(
    doc,
    `Nom du tiers débiteur : si votre paiement concerne un accord passé entre (${creditorName}) et un tiers`,
    FIELD_X,
    y + 4.6 * MM,
  );
  caption(
    doc,
    "(par exemple, vous payez la facture d'une autre personne), veuillez indiquer ici son nom.",
    FIELD_X,
    y + 7.2 * MM,
  );
  caption(doc, "Si vous payez pour votre propre compte, ne pas remplir.", FIELD_X, y + 9.8 * MM);
  return y + 13.5 * MM;
}

/**
 * Le pied : « A retourner à » et la zone réservée au créancier. L'adresse de
 * retour est **préremplie** : elle dit au client où poster la fiche signée.
 */
function footer(doc: Doc, top: number, creditor: CreditorSnapshot): number {
  // Quatre lignes possibles (raison sociale + trois d'adresse) à 3,1 mm : une
  // cellule plus courte laisserait le pays sortir SOUS le cadre, ce qui est arrivé.
  const bottom = top + 18 * MM;
  const split = 115 * MM;
  vline(doc, split, top, bottom, HAIRLINE);

  put(doc, "A retourner à :", LABEL_X, top + 2 * MM, { size: 9.5 });
  put(
    doc,
    [creditorNameOn(creditor), ...creditorAddressOn(creditor)].join("\n"),
    LABEL_X,
    top + 6.5 * MM,
    { size: 7.5, width: split - LABEL_X - 4 * MM },
  );
  put(doc, "Zone réservée à l'usage exclusif du créancier", split + 2 * MM, top + 2 * MM, {
    size: 8,
  });
  return bottom;
}
