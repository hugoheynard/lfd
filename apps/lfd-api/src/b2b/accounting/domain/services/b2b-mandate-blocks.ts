import type { CreditorSnapshot } from "../creditor-snapshot.js";
import type { DebtorSnapshot } from "../debtor-snapshot.js";
import type { MandatePaymentType } from "../value-objects/mandate-defaults.js";
import {
  addressLine,
  cell,
  heading,
  HINT_GRAY,
  LABEL_GRAY,
  LABEL_SIZE,
  labelCell,
  LEFT,
  middle,
  RIGHT,
  value,
  WIDTH,
} from "./b2b-mandate-grid.js";
import {
  BOLD,
  comb,
  type CombGeometry,
  creditorAddressOn,
  creditorNameOn,
  debtorStreetOf,
  type Doc,
  MM,
  put,
  REGULAR,
  splitAddress,
} from "./mandate-pdf-drawing.js";

/**
 * **Les rubriques du mandat interentreprises**, dans l'ordre du gabarit DGFiP :
 * RUM, SIREN, raison sociale, titulaire du compte, IBAN, BIC — puis le bloc du
 * créancier, le type de paiement, le lieu et la date, la signature.
 *
 * Chaque fonction reçoit l'ordonnée de départ et rend celle de fin : la page se
 * lit de haut en bas dans `b2b-mandate-pdf.ts`, sans coordonnée cachée.
 */

/**
 * Le peigne de la RUM : **35 cases**, la borne EPC d'une référence. Le gabarit
 * DGFiP en a autant ; c'est le mandat CORE, avec ses 26 cases, qui borne la
 * frappe (`rum.ts`).
 */
export const B2B_RUM_BOXES = 35;
const IBAN_BOXES = 34;
const BIC_BOXES = 11;
const SIREN_BOXES = 9;
const DATE_HINT = "JJMMAAAA";

const ROW = 8 * MM;
const LINE = 6 * MM;
/** Le corps des valeurs mises en avant : nom du créancier, pays, type de paiement. */
const VALUE_BOLD = 9.5;
const ICS_CELL = 5 * MM;

function geometry(cellWidth: number, height: number): CombGeometry {
  return { cell: cellWidth, height, gap: 0, size: 9 };
}

/**
 * La RUM, en cases. Vide sur un exemplaire ; sur un mandat émis, `comb` refuse
 * une référence de plus de 35 caractères plutôt que de la tronquer.
 */
export function rumBlock(doc: Doc, top: number, reference: string): number {
  const y = heading(doc, top, "Référence Unique de Mandat (RUM) *");
  const height = 6.5 * MM;
  comb(
    doc,
    LEFT,
    y,
    [B2B_RUM_BOXES],
    reference,
    "La référence unique de mandat",
    geometry(WIDTH / B2B_RUM_BOXES, height),
  );
  return y + height;
}

/**
 * Le débiteur : son SIREN en cases, sa raison sociale.
 *
 * ⚠️ Le gabarit écrit « SIREN (ou IDSP) » : l'IDSP est l'identifiant des
 * services publics, propre à un créancier DGFiP. Nos débiteurs sont des
 * sociétés du registre — le libellé dit donc SIREN, seul.
 */
export function debtorBlock(doc: Doc, top: number, debtor: DebtorSnapshot | null): number {
  let y = top;
  const labelWidth = 60 * MM;
  labelCell(doc, LEFT, y, labelWidth, ROW, "SIREN du débiteur *");
  const end = comb(
    doc,
    LEFT + labelWidth,
    y,
    [SIREN_BOXES],
    debtor?.siren ?? "",
    "Le SIREN du débiteur",
    geometry(9 * MM, ROW),
  );
  cell(doc, end, y, RIGHT - end, ROW);
  y += ROW;

  const nameWidth = 35 * MM;
  labelCell(doc, LEFT, y, nameWidth, ROW + 1 * MM, "Raison sociale\ndu débiteur *", null);
  cell(doc, LEFT + nameWidth, y, WIDTH - nameWidth, ROW + 1 * MM);
  value(doc, debtor?.companyName ?? "", LEFT + nameWidth + 2 * MM, y, ROW + 1 * MM);
  return y + ROW + 1 * MM;
}

/**
 * Le titulaire du compte — **pouvant être différent du débiteur**.
 *
 * La forme juridique reste vide (décision Q4 du plan) : le RIB n'en porte pas,
 * et celle de la société serait fausse dès que le titulaire en diffère.
 */
export function holderBlock(doc: Doc, top: number, debtor: DebtorSnapshot | null): number {
  let y = heading(doc, top, "Titulaire du compte bancaire (pouvant être différent du débiteur) *");
  const height = ROW + 1 * MM;
  labelCell(doc, LEFT, y, 32 * MM, height, "Civilité / Forme\njuridique *", null);
  cell(doc, LEFT + 32 * MM, y, 28 * MM, height);
  labelCell(doc, LEFT + 60 * MM, y, 38 * MM, height, "Nom / Prénom\nou Raison sociale *", null);
  cell(doc, LEFT + 98 * MM, y, WIDTH - 98 * MM, height);
  value(doc, debtor?.holder ?? "", LEFT + 100 * MM, y, height);
  y += height;

  const cityLine = debtor === null ? "" : `${debtor.postalCode} ${debtor.city}`;
  return addressBlock(doc, y, [
    ["Numéro, nature et nom de la voie :", debtorStreetOf(debtor)],
    ["Code postal et ville :", cityLine],
    ["Pays :", debtor?.countryCode ?? ""],
  ]);
}

/** Le bloc « Adresse * » : un libellé à gauche, une ligne par couple amorce/valeur. */
function addressBlock(
  doc: Doc,
  top: number,
  lines: readonly (readonly [string, string])[],
): number {
  const labelWidth = 25 * MM;
  const height = LINE * lines.length;
  labelCell(doc, LEFT, top, labelWidth, height, "Adresse *", null);
  cell(doc, LEFT + labelWidth, top, WIDTH - labelWidth, height);
  for (const [index, [prompt, filled]] of lines.entries()) {
    addressLine(doc, LEFT + labelWidth + 1.5 * MM, top + index * LINE, LINE, prompt, filled);
  }
  return top + height;
}

/**
 * L'IBAN en 34 cases — la longueur maximale d'un IBAN — et le BIC en 11.
 *
 * La phrase du BIC est celle du gabarit : il n'est exigé que hors de l'Espace
 * économique européen. On l'imprime quand on l'a, ce qui ne gêne personne.
 */
export function accountBlock(doc: Doc, top: number, debtor: DebtorSnapshot | null): number {
  let y = heading(doc, top, "Coordonnées du compte – IBAN *");
  const ibanHeight = 7 * MM;
  comb(
    doc,
    LEFT,
    y,
    [IBAN_BOXES],
    debtor?.iban ?? "",
    "L'IBAN de ce compte",
    geometry(WIDTH / IBAN_BOXES, ibanHeight),
  );
  y += ibanHeight;

  const bicCell = 5 * MM;
  const bicLeft = RIGHT - bicCell * BIC_BOXES;
  // Deux lignes de consigne sous le libellé : la rangée est plus haute que les
  // autres, sans quoi « Européen » passait sous le filet (vu au rendu).
  const height = ROW + 2.5 * MM;
  cell(doc, LEFT, y, bicLeft - LEFT, height, LABEL_GRAY);
  put(doc, "Bank Identifier Code – BIC.", LEFT + 1.5 * MM, y + 1.4 * MM, {
    size: LABEL_SIZE + 0.5,
    font: BOLD,
  });
  put(
    doc,
    "Vous devez compléter ce champ seulement si l'établissement bancaire est situé hors de " +
      "l'Espace Économique Européen.",
    LEFT + 1.5 * MM,
    y + 4.8 * MM,
    { size: 6.2, width: bicLeft - LEFT - 3 * MM },
  );
  comb(
    doc,
    bicLeft,
    y,
    [BIC_BOXES],
    debtor?.bic ?? "",
    "Le BIC de cette banque",
    geometry(bicCell, height),
  );
  return y + height;
}

/**
 * Le créancier : nom, ICS en cases, adresse — **sans service gestionnaire**
 * (propre à la DGFiP) et le pays tiré de l'adresse, jamais « FRANCE » en dur.
 *
 * 🔴 L'IBAN du créancier n'apparaît nulle part ici : le seul IBAN du document
 * est celui du débiteur, et y mettre le nôtre nous autoriserait à nous prélever.
 */
export function creditorBlock(doc: Doc, top: number, creditor: CreditorSnapshot): number {
  const labelWidth = 45 * MM;
  let y = top;
  labelCell(doc, LEFT, y, labelWidth, LINE, "Nom du créancier");
  cell(doc, LEFT + labelWidth, y, WIDTH - labelWidth, LINE);
  put(doc, creditorNameOn(creditor), LEFT + labelWidth, middle(y, LINE, VALUE_BOLD), {
    size: VALUE_BOLD,
    font: BOLD,
    width: WIDTH - labelWidth,
    align: "center",
  });
  y += LINE;

  y = icsRow(doc, y, labelWidth, creditor.ics);

  const address = splitAddress(creditorAddressOn(creditor));
  const start = y;
  y = addressBlock(doc, y, [
    ["Numéro, nature et nom de la voie :", address.street],
    ["Code postal et ville :", `${address.postalCode} ${address.city}`.trim()],
  ]);
  put(doc, address.country, LEFT, middle(start + LINE, LINE, VALUE_BOLD), {
    size: VALUE_BOLD,
    font: BOLD,
    width: WIDTH - 2 * MM,
    align: "right",
  });
  return y;
}

/**
 * L'ICS en cases, calées à droite sur sa longueur RÉELLE (8 à 35 caractères) ;
 * au-delà de la largeur disponible, en clair — entier, ce qui ne se négocie pas.
 */
function icsRow(doc: Doc, top: number, labelWidth: number, ics: string): number {
  labelCell(doc, LEFT, top, labelWidth, LINE, "Identifiant Créancier SEPA");
  const room = WIDTH - labelWidth;
  if (ics.length * ICS_CELL > room) {
    cell(doc, LEFT + labelWidth, top, room, LINE);
    value(doc, ics, LEFT + labelWidth + 2 * MM, top, LINE);
    return top + LINE;
  }
  const combLeft = RIGHT - ics.length * ICS_CELL;
  cell(doc, LEFT + labelWidth, top, combLeft - LEFT - labelWidth, LINE);
  comb(doc, combLeft, top, [ics.length], ics, "L'identifiant créancier", geometry(ICS_CELL, LINE));
  return top + LINE;
}

/** Le type de paiement — du MANDAT, en toutes lettres, sans case à cocher. */
export function paymentTypeRow(doc: Doc, top: number, paymentType: MandatePaymentType): number {
  labelCell(doc, LEFT, top, 45 * MM, LINE, "Type de paiement");
  cell(doc, LEFT + 45 * MM, top, WIDTH - 45 * MM, LINE);
  const text = paymentType === "recurrent" ? "Paiement récurrent" : "Paiement ponctuel";
  put(doc, text, LEFT, middle(top, LINE, VALUE_BOLD), {
    size: VALUE_BOLD,
    font: BOLD,
    width: WIDTH - 2 * MM,
    align: "right",
  });
  return top + LINE;
}

/** Le lieu, « A …, le », la date en huit cases, puis le cadre de signature. */
export function signatureBlock(doc: Doc, top: number): number {
  const dateCell = 4.5 * MM;
  const dateLeft = RIGHT - dateCell * DATE_HINT.length;
  const dateLabel = dateLeft - 17 * MM;
  labelCell(doc, LEFT, top, 17 * MM, LINE, "Lieu *");
  cell(doc, LEFT + 17 * MM, top, dateLabel - LEFT - 17 * MM, LINE);
  put(doc, "A", LEFT + 19 * MM, middle(top, LINE, VALUE_BOLD), { size: VALUE_BOLD, font: BOLD });
  put(doc, ", le", dateLabel - 8 * MM, middle(top, LINE, VALUE_BOLD), {
    size: VALUE_BOLD,
    font: BOLD,
  });
  labelCell(doc, dateLabel, top, 17 * MM, LINE, "Date *");
  comb(doc, dateLeft, top, [DATE_HINT.length], "", "La date", geometry(dateCell, LINE));
  for (const [index, hint] of [...DATE_HINT].entries()) {
    const hintWidth = doc.font(REGULAR).fontSize(8).widthOfString(hint);
    const x = dateLeft + index * dateCell + (dateCell - hintWidth) / 2;
    put(doc, hint, x, middle(top, LINE, 8), { size: 8, font: REGULAR, color: HINT_GRAY });
  }

  const signature = 24 * MM;
  cell(doc, LEFT, top + LINE, WIDTH, signature);
  put(doc, "Veuillez signer ici *", LEFT + 1.5 * MM, top + LINE + 1.5 * MM, {
    size: LABEL_SIZE + 1,
    font: BOLD,
  });
  return top + LINE + signature;
}
