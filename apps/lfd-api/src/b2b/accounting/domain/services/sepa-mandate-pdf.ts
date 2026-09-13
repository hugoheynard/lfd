import { Buffer } from "node:buffer";

import PDFDocument from "pdfkit";

import type { CreditorSnapshot } from "../creditor-snapshot.js";
import type { DebtorSnapshot } from "../debtor-snapshot.js";
import type { MandatePaymentType } from "../value-objects/mandate-defaults.js";
import { MandateFieldTooLongError } from "../errors/accounting-errors.js";

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
 * ## Les zones 14 à 20 sont DESSINÉES, et trois d'entre elles se remplissent
 *
 * ⚠️ Ce paragraphe affirmait le contraire — « les zones 14 à 20 sont absentes,
 * et c'est un choix » — jusqu'au 2026-09-12, pendant que `contractZones` les
 * dessinait juste en dessous. Deux justifications opposées dans le même
 * fichier : celle-ci décrivait une intention abandonnée, et elle aurait fait
 * « restaurer » des zones déjà là.
 *
 * La norme les range sous « informations relatives au contrat entre le créancier
 * et le débiteur — fournies seulement à titre indicatif ». Aucune ne conditionne
 * la validité du mandat. Elles se répartissent en trois camps :
 *
 * - **14, 19, 20** — le code que le débiteur veut voir revenir sur son relevé,
 *   le numéro et la description du contrat. Ce sont les nôtres à proposer, et
 *   ils se saisissent sur la fiche du client ;
 * - **15, 16** — le tiers débiteur. C'est au signataire de les remplir s'il
 *   paie pour quelqu'un d'autre ; nous ne pouvons pas le deviner ;
 * - **17, 18** — le tiers créancier. Vides parce que nous n'encaissons pour
 *   personne. À rouvrir le jour où ce serait le cas : la 17 devient obligatoire.
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

/** A4 en points PostScript, et le millimètre dans lequel tout le dessin est spécifié. */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MM = PAGE_WIDTH / 210;

/**
 * Les colonnes du formulaire, relevées sur le modèle officiel.
 *
 * Le cadre général et ses filets ne sont pas décoratifs : c'est ce quadrillage
 * qui fait qu'un chargé de clientèle reconnaît la fiche au premier coup d'œil et
 * qu'un banquier y retrouve la zone qu'il cite. Un mandat redessiné « en plus
 * propre » est un mandat qu'on relit deux fois.
 */
const BOX_LEFT = 10 * MM;
const BOX_RIGHT = 200 * MM;
const LABEL_X = 12 * MM;
/** La colonne des astérisques — la norme marque ainsi ce qui est obligatoire. */
const STAR_X = 51 * MM;
const FIELD_X = 55 * MM;
const FIELD_RIGHT = 191 * MM;
/** Le numéro de zone, dans la marge intérieure droite. */
const NUM_X = 194 * MM;
/** Les deux refends verticaux de la ligne d'en-tête. */
const HEAD_SPLIT_LEFT = 55 * MM;
const HEAD_SPLIT_RIGHT = 163 * MM;
/** La colonne « Ville » des lignes qui portent un code postal. */
const CITY_STAR_X = 112 * MM;
const CITY_X = 116 * MM;

/** Le pas d'une ligne de zone. Serré : le modèle tient en une page, et doit. */
const ROW = 8.5 * MM;

const BLACK = "#000000";
/** Le gris de la mention « EXEMPLE » en travers de la page. */
const WATERMARK_GRAY = "#DCDCDC";

const REGULAR = "Helvetica";
const BOLD = "Helvetica-Bold";
const OBLIQUE = "Helvetica-Oblique";

const HAIRLINE = 0.6;
/** Les filets qui séparent les grands pavés, plus marqués que ceux des zones. */
const RULE = 0.9;

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

const CLOSING_NOTE =
  "Note : vos droits concernant le présent mandat sont expliqués dans un document que vous " +
  "pouvez obtenir auprès de votre banque.";

const CONTRACT_HEADING =
  "Informations relatives au contrat entre le créancier et le débiteur - fournies seulement à " +
  "titre indicatif.";

/** Le document en cours de dessin. `pdfkit` tient la plume, on tient le plan. */
type Doc = PDFKit.PDFDocument;

interface TextOptions {
  readonly size: number;
  readonly font?: string;
  readonly width?: number;
  readonly color?: string;
  readonly align?: "left" | "center" | "right";
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
      options.width === undefined
        ? { lineBreak: false }
        : { width: options.width, align: options.align ?? "left" },
    );
}

/** Un trait horizontal plein — les filets de structure du formulaire. */
function line(doc: Doc, x1: number, y: number, x2: number, thickness: number): void {
  doc.save().lineWidth(thickness).strokeColor(BLACK).moveTo(x1, y).lineTo(x2, y).stroke().restore();
}

/** Un trait vertical — les refends de l'en-tête et du pied. */
function vline(doc: Doc, x: number, y1: number, y2: number, thickness: number): void {
  doc.save().lineWidth(thickness).strokeColor(BLACK).moveTo(x, y1).lineTo(x, y2).stroke().restore();
}

/** Un rectangle au trait. */
function box(doc: Doc, x: number, y: number, width: number, height: number): void {
  doc.save().lineWidth(HAIRLINE).strokeColor(BLACK).rect(x, y, width, height).stroke().restore();
}

/**
 * La **ligne de pointillés** à remplir.
 *
 * Dessinée point par point plutôt qu'avec `dash()` : le tireté de `pdfkit` pose
 * des segments, pas des points ronds, et le formulaire officiel est en points.
 * La différence se voit à l'impression, et c'est le genre d'écart qui fait
 * hésiter la personne qui compare la fiche reçue à celle qu'elle connaît.
 */
function leader(doc: Doc, x1: number, y: number, x2: number): void {
  doc.save().lineWidth(0.7).strokeColor(BLACK).lineCap("round");
  const step = 1.7 * MM;
  for (let x = x1; x <= x2; x += step) {
    doc.moveTo(x, y).lineTo(x + 0.1, y);
  }
  doc.stroke().restore();
}

/**
 * Un **peigne de cases** — une case par caractère.
 *
 * La norme les emploie partout où la saisie doit se relire chiffre à chiffre :
 * RUM, code postal, IBAN, BIC, date. Ce n'est pas de la décoration — un IBAN
 * écrit à main levée sur une ligne continue est un IBAN qu'on ressaisit à
 * l'aveugle, et la clé mod-97 ne rattrape qu'une faute sur cent.
 *
 * `groups` décrit le découpage (`[4, 4, 4, 3]`) ; `filled` pose éventuellement
 * une valeur, un caractère par case.
 *
 * 🔴 **Il REFUSE ce qui déborde, depuis le 2026-09-12.** Il remplissait case par
 * case et ignorait tout caractère au-delà de la dernière : aucune erreur, aucun
 * débordement visible. Un IBAN de 31 caractères — Malte en a 31, la France 27 —
 * sortait donc amputé sur le papier que le client signe, pendant que la base en
 * gardait la forme entière. L'écart ne se serait vu qu'en contestation.
 *
 * Le refus vaut pour TOUS les peignes, pas seulement l'IBAN : la RUM, le BIC, le
 * code postal. C'est la même erreur, et elle devient inexprimable partout d'un
 * coup plutôt que gardée à chaque appel — où il aurait suffi d'en oublier un.
 *
 * @throws {MandateFieldTooLongError} la valeur dépasse le nombre de cases.
 */
function comb(
  doc: Doc,
  x: number,
  y: number,
  groups: readonly number[],
  filled = "",
  field = "Cette valeur",
): number {
  const capacity = groups.reduce((total, size) => total + size, 0);
  if (filled.length > capacity) {
    throw new MandateFieldTooLongError(field, filled.length, capacity);
  }
  const cell = 4.1 * MM;
  const gap = 1.6 * MM;
  const height = 4.3 * MM;
  let cursor = x;
  let index = 0;
  for (const [position, size] of groups.entries()) {
    for (let n = 0; n < size; n += 1) {
      box(doc, cursor, y, cell, height);
      const char = filled[index];
      if (char !== undefined) {
        put(doc, char, cursor + cell / 2 - 1.2 * MM, y + 1 * MM, { size: 9, font: BOLD });
      }
      cursor += cell;
      index += 1;
    }
    if (position < groups.length - 1) {
      cursor += gap;
    }
  }
  return cursor;
}

/**
 * Un libellé suivi de sa case. Rend l'abscisse de fin de la case.
 *
 * La croix est **dessinée**, pas écrite : un « X » en Helvetica ne remplit pas
 * la case de la même façon selon la police substituée, et la lettre déborde sur
 * les bords à cette taille.
 */
function checkbox(doc: Doc, x: number, y: number, text: string, checked = false): number {
  put(doc, text, x, y, { size: 9.5 });
  const width = doc.font(REGULAR).fontSize(9.5).widthOfString(text);
  const left = x + width + 2 * MM;
  const top = y - 0.5 * MM;
  const side = 3.4 * MM;
  box(doc, left, top, side, side);
  if (checked) {
    const inset = 0.8 * MM;
    doc.save();
    doc.lineWidth(RULE).strokeColor(BLACK);
    doc
      .moveTo(left + inset, top + inset)
      .lineTo(left + side - inset, top + side - inset)
      .moveTo(left + side - inset, top + inset)
      .lineTo(left + inset, top + side - inset)
      .stroke();
    doc.restore();
  }
  return left + side;
}

/** L'astérisque de la norme : ce qui est marqué doit être rempli. */
function star(doc: Doc, x: number, y: number): void {
  put(doc, "*", x, y + 0.6 * MM, { size: 9 });
}

/**
 * Le numéro de zone, dans la marge intérieure droite, **à hauteur de la ligne**
 * qu'il désigne — pas du haut de la rangée. Décalé, il se lit comme le numéro de
 * la zone précédente, ce qui est exactement ce qu'un numéro de zone ne doit pas
 * faire quand deux personnes s'en servent pour désigner la même case.
 */
function zone(doc: Doc, value: number, y: number): void {
  put(doc, String(value), NUM_X, y + 2.4 * MM, { size: 8, font: BOLD });
}

/** La légende sous une ligne — « Nom / Prénoms du débiteur ». */
function caption(doc: Doc, text: string, x: number, y: number): void {
  put(doc, text, x, y, { size: 6.2 });
}

/** Le libellé de la colonne de gauche. */
function label(doc: Doc, text: string, y: number, size = 9.5): void {
  put(doc, text, LABEL_X, y, { size, width: STAR_X - LABEL_X - 2 * MM });
}

/**
 * Une zone à **ligne pointillée** : astérisque, pointillés, légende, numéro.
 * `value` la préremplit — c'est ce qui distingue notre bloc de celui du client.
 */
function dottedRow(
  doc: Doc,
  y: number,
  legend: string,
  number_: number | null,
  value = "",
  x = FIELD_X,
  right = FIELD_RIGHT,
  required = true,
): void {
  if (required) {
    star(doc, x - 4 * MM, y);
  }
  if (value !== "") {
    put(doc, value, x + 1 * MM, y - 0.4 * MM, { size: 9.5, font: BOLD });
  }
  leader(doc, x, y + 4 * MM, right);
  caption(doc, legend, x, y + 4.6 * MM);
  if (number_ !== null) {
    zone(doc, number_, y);
  }
}

/**
 * La mention « EXEMPLE » en travers de la page, posée **en premier** pour rester
 * sous le dessin : par-dessus, elle rendrait les zones illisibles, ce qui
 * transformerait une marque en gêne — et une gêne finit par sauter.
 *
 * Elle est en travers et non dans un coin parce qu'une fiche vierge imprimée
 * traîne sur un bureau : sans marque, rien ne la distingue d'un mandat prêt à
 * signer, et une signature apposée dessus créerait un mandat sans RUM —
 * inutilisable, mais que le client croirait avoir donné.
 */
function watermark(doc: Doc): void {
  doc.save();
  doc.rotate(-38, { origin: [PAGE_WIDTH / 2, PAGE_HEIGHT / 2] });
  doc.font(BOLD).fontSize(92).fillColor(WATERMARK_GRAY);
  const text = "EXEMPLE";
  doc.text(text, PAGE_WIDTH / 2 - doc.widthOfString(text) / 2, PAGE_HEIGHT / 2 - 34, {
    lineBreak: false,
  });
  doc.restore();
  doc.fillColor(BLACK);
}

/** Le bandeau de titre, hors cadre — comme sur le modèle. */
function title(doc: Doc, issued: boolean): number {
  // Le sous-titre disparaît AVEC le filigrane, et pour la même raison : les deux
  // disent « ceci ne se signe pas ». En laisser un seul ferait un document qui
  // se contredit — et c'est le texte, pas le filigrane, qu'un client lit.
  const heading = issued
    ? "MANDAT DE PRELEVEMENT SEPA"
    : "MANDAT SEPA (exemple - document non contractuel)";
  put(doc, heading, BOX_LEFT, 9 * MM, {
    size: 11.5,
    font: BOLD,
    width: BOX_RIGHT - BOX_LEFT,
    align: "center",
  });
  return 14 * MM;
}

/**
 * La ligne d'en-tête : trois cellules, dont le peigne de la **RUM**.
 *
 * Le peigne reste vide sur un exemplaire vierge — la référence est frappée à la
 * création du mandat, elle n'existe donc pas avant. Sur un mandat émis, elle
 * s'imprime case par case.
 *
 * 🔴 `comb` **refuse** au-delà de 26 caractères plutôt que de tronquer : c'est
 * la borne du peigne, et une RUM rognée en silence serait imprimée fausse sur un
 * papier signé. Voir `documentation/comptabilite/rum.md` §2.
 */
function header(doc: Doc, top: number, logo: Buffer | null, reference: string): number {
  const bottom = top + 19 * MM;
  vline(doc, HEAD_SPLIT_LEFT, top, bottom, HAIRLINE);
  vline(doc, HEAD_SPLIT_RIGHT, top, bottom, HAIRLINE);

  put(doc, "MANDAT de Prélèvement SEPA", FIELD_X + 1 * MM, top + 2 * MM, { size: 11, font: BOLD });
  comb(doc, FIELD_X + 1 * MM, top + 7 * MM, [26], reference, "La référence unique de mandat");
  caption(doc, "Référence unique du mandat", FIELD_X + 1 * MM, top + 12 * MM);

  // La cellule de droite porte « Nom du créancier et logo » sur le modèle
  // vierge. Nous n'y mettons que le LOGO : le nom est déjà écrit deux fois sur
  // la page — en zone 7, et dans le texte d'autorisation — et une troisième
  // occurrence à trois centimètres de la deuxième n'apprend rien.
  //
  // 🔴 **Sans logo, la cellule reste VIDE** — ni cadre, ni « logo manquant », ni
  // texte de remplacement. Une cellule vide sur un formulaire se lit comme une
  // cellule à remplir ; un « logo manquant » IMPRIMÉ se lit comme un défaut du
  // document, et c'est le client qui le lit. Le mandat reste valide sans rond :
  // la norme n'exige pas de logo.
  if (logo !== null) {
    const cellWidth = BOX_RIGHT - HEAD_SPLIT_RIGHT;
    const logoSide = 14 * MM;
    // `width` ET `height` : le VO garantit une image sensiblement carrée, donc
    // la case n'écrase rien de perceptible. C'est cette garantie-là qui autorise
    // à forcer les deux, et c'est pour ça qu'elle est portée par le domaine.
    doc.image(logo, HEAD_SPLIT_RIGHT + (cellWidth - logoSide) / 2, top + 2.5 * MM, {
      width: logoSide,
      height: logoSide,
    });
  }

  line(doc, BOX_LEFT, bottom, BOX_RIGHT, RULE);
  return bottom;
}

/**
 * Le pavé d'autorisation. Le texte est celui de la norme, au mot près : un
 * mandat dont la mention légale a été reformulée est un mandat que la banque du
 * débiteur peut écarter — et elle l'écarte au moment du prélèvement, des
 * semaines après la signature.
 */
function authorization(doc: Doc, top: number, creditorName: string): number {
  const width = BOX_RIGHT - BOX_LEFT - 4 * MM;
  const x = BOX_LEFT + 2 * MM;
  let y = top + 2 * MM;

  doc.font(REGULAR).fontSize(8.6).fillColor(BLACK);
  doc.text("En signant ce formulaire de mandat, vous autorisez (A) ", x, y, {
    continued: true,
    width,
  });
  doc.font(OBLIQUE).text(`(${creditorName})`, { continued: true });
  doc
    .font(REGULAR)
    .text(
      " à envoyer des instructions à votre banque pour débiter votre compte, et (B) votre banque à débiter votre compte conformément aux instructions de ",
      {
        continued: true,
      },
    );
  doc.font(OBLIQUE).text(`(${creditorName})`, { continued: true });
  doc.font(REGULAR).text(".", { continued: false });
  y = doc.y + 1 * MM;

  for (const paragraphe of [
    "Vous bénéficiez du droit d'être remboursé par votre banque selon les conditions décrites dans la convention que vous avez passée avec elle.",
    "Une demande de remboursement doit être présentée :",
    "- dans les 8 semaines suivant la date de débit de votre compte pour un prélèvement autorisé,",
    "- sans tarder et au plus tard dans les 13 mois en cas de prélèvement non autorisé.",
  ]) {
    put(doc, paragraphe, x, y, { size: 8.6, width });
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

/** Les zones 1 à 6 : tout ce que le débiteur remplit lui-même. */
function debtorZones(doc: Doc, top: number, debtor: DebtorSnapshot | null): number {
  let y = top + 3 * MM;
  // `null` laisse les six zones vierges : c'est la fiche que le client remplit
  // à la main. Un `??` par champ plutôt qu'une seconde fonction — le dessin est
  // le MÊME, seuls les remplissages changent, et deux dessins jumeaux
  // divergeraient au premier ajustement de mise en page.
  const at = (value: string): string => (debtor === null ? "" : value);

  label(doc, "Votre Nom", y);
  dottedRow(doc, y, "Nom / Prénoms du débiteur", 1, at(debtor?.holder ?? ""));
  y += ROW;

  label(doc, "Votre adresse", y);
  dottedRow(doc, y, "Numéro et nom de la rue", 2, at(addressLineOf(debtor)));
  y += ROW;

  star(doc, FIELD_X - 4 * MM, y);
  comb(doc, FIELD_X, y + 0.4 * MM, [5], at(debtor?.postalCode ?? ""), "Le code postal");
  caption(doc, "Code Postal", FIELD_X, y + 5.2 * MM);
  dottedRow(doc, y, "Ville", 3, at(debtor?.city ?? ""), CITY_X, FIELD_RIGHT);
  star(doc, CITY_STAR_X, y);
  y += ROW;

  dottedRow(doc, y, "Pays", 4, at(debtor?.countryCode ?? ""));
  y += ROW;

  label(doc, "Les coordonnées\nde votre compte", y);
  star(doc, FIELD_X - 4 * MM, y);
  comb(
    doc,
    FIELD_X,
    y + 0.4 * MM,
    [4, 4, 4, 4, 4, 4, 3],
    at(debtor?.iban ?? ""),
    "L'IBAN de ce compte",
  );
  caption(
    doc,
    "Numéro d'identification international du compte bancaire - IBAN (International Bank Account Number)",
    FIELD_X,
    y + 5.2 * MM,
  );
  zone(doc, 5, y);
  y += ROW;

  star(doc, FIELD_X - 4 * MM, y);
  comb(doc, FIELD_X, y + 0.4 * MM, [11], at(debtor?.bic ?? ""), "Le BIC de cette banque");
  caption(
    doc,
    "Code international d'identification de votre banque - BIC (Bank Identifier Code)",
    FIELD_X,
    y + 5.2 * MM,
  );
  zone(doc, 6, y);
  return y + ROW;
}

/**
 * L'adresse du débiteur sur UNE ligne — le formulaire n'en a qu'une.
 *
 * Le complément est recollé derrière plutôt qu'abandonné : « Bâtiment B » perdu,
 * le courrier de la banque n'arrive pas. La ligne est pointillée et non
 * découpée en cases, donc un dépassement ne tronque rien — il déborde
 * visiblement, ce qui se corrige en regardant la prévisualisation.
 */
function addressLineOf(debtor: DebtorSnapshot | null): string {
  if (debtor === null) {
    return "";
  }
  return debtor.addressLine2 === ""
    ? debtor.addressLine1
    : `${debtor.addressLine1}, ${debtor.addressLine2}`;
}

/**
 * Les zones 7 à 11 : **notre côté**, recopié du snapshot.
 *
 * C'est la moitié du document qu'un client ne peut pas connaître, et la seule
 * qu'une erreur de saisie rendrait inexploitable en masse.
 *
 * 🔴 L'IBAN du créancier n'apparaît nulle part ici. Les zones 5 et 6 lui
 * ressemblent, mais elles appellent l'IBAN et le BIC **du débiteur** : imprimer
 * le nôtre produirait un mandat nous autorisant à nous prélever nous-mêmes, et
 * le ferait circuler chez chaque client.
 */
function creditorZones(doc: Doc, top: number, creditor: CreditorSnapshot): number {
  let y = top;

  label(doc, "Nom du créancier", y);
  dottedRow(doc, y, "Nom du créancier", 7, creditorNameOn(creditor));
  y += ROW;

  icsRow(doc, y, creditor.ics);
  y += ROW;

  const address = splitAddress(creditorAddressOn(creditor));
  dottedRow(doc, y, "Numéro et nom de la rue", 9, address.street);
  y += ROW;

  star(doc, FIELD_X - 4 * MM, y);
  comb(doc, FIELD_X, y + 0.4 * MM, [5], address.postalCode);
  caption(doc, "Code Postal", FIELD_X, y + 5.2 * MM);
  dottedRow(doc, y, "Ville", 10, address.city, CITY_X, FIELD_RIGHT);
  star(doc, CITY_STAR_X, y);
  y += ROW;

  dottedRow(doc, y, "Pays", 11, address.country);
  return y + ROW;
}

/**
 * Type de paiement, lieu et date, signature — tout ce que le signataire pose.
 *
 * ⚠️ La **zone 12 est cochée pour lui**, depuis le 2026-09-12 : le régime est un
 * réglage de l'entité émettrice, pas un choix du client. La laisser vide
 * demandait au débiteur de trancher une question qu'il ne se pose pas — et une
 * case non cochée sur un mandat signé est une ambiguïté qui se découvre au
 * premier prélèvement refusé.
 */
function signatureZones(doc: Doc, top: number, paymentType: MandatePaymentType): number {
  let y = top;

  label(doc, "Type de paiement", y);
  star(doc, FIELD_X - 4 * MM, y);
  // La case se pose après le texte MESURÉ (`widthOfString`). À un décalage
  // deviné, elle vient toucher la dernière lettre — et un libellé traduit ou
  // une police substituée déplacerait la faute ailleurs sans qu'on la voie.
  const afterRecurring = checkbox(
    doc,
    FIELD_X,
    y,
    "Paiement récurrent / répétitif",
    paymentType === "recurrent",
  );
  checkbox(doc, afterRecurring + 10 * MM, y, "Paiement ponctuel", paymentType === "one_off");
  zone(doc, 12, y);
  y += ROW;

  label(doc, "Signé à", y);
  star(doc, FIELD_X - 4 * MM, y);
  leader(doc, FIELD_X, y + 4 * MM, FIELD_X + 45 * MM);
  // Le renvoi (1) du modèle : cette ligne est bornée à 35 caractères, et la
  // note de pied le rappelle. C'est une contrainte de la norme, pas un détail
  // de mise en page — un lieu plus long est tronqué par la banque.
  put(doc, "(1)", FIELD_X + 46 * MM, y + 2.6 * MM, { size: 6.2 });
  caption(doc, "Lieu", FIELD_X, y + 4.6 * MM);
  comb(doc, CITY_X, y + 0.4 * MM, [2, 2, 4]);
  caption(doc, "Date : JJ/MM/AAAA", CITY_X, y + 5.2 * MM);
  zone(doc, 13, y);
  y += ROW;

  label(doc, "Signature(s)", y + 2 * MM);
  put(doc, "Veuillez signer ici", FIELD_X, y + 2 * MM, { size: 9.5 });
  box(doc, FIELD_X + 30 * MM, y + 1 * MM, FIELD_RIGHT - FIELD_X - 30 * MM, 16 * MM);
  y += 20 * MM;

  put(doc, CLOSING_NOTE, BOX_LEFT + 2 * MM, y, {
    size: 7.2,
    width: BOX_RIGHT - BOX_LEFT - 4 * MM,
  });
  const bottom = y + 5 * MM;
  line(doc, BOX_LEFT, bottom, BOX_RIGHT, RULE);
  return bottom;
}

/**
 * Les zones 14 à 20 — indicatives, et remplies pour trois d'entre elles.
 *
 * Dessinées parce que le formulaire les porte et qu'une fiche amputée ne se
 * reconnaît plus. Les zones du **tiers** (15 à 18) restent vides : les deux
 * premières sont au signataire, les deux autres ne nous concernent pas tant que
 * nous n'encaissons pour personne.
 */
function contractZones(
  doc: Doc,
  top: number,
  creditor: CreditorSnapshot,
  debtor: DebtorSnapshot | null,
): number {
  const creditorName = creditorNameOn(creditor);
  put(doc, CONTRACT_HEADING, BOX_LEFT + 2 * MM, top + 1.5 * MM, { size: 7.6, font: BOLD });
  let y = top + 6 * MM;

  label(doc, "Code identifiant\ndu débiteur", y, 9);
  dottedRow(
    doc,
    y,
    "Indiquer ici tout code que vous souhaitez voir restitué par votre banque",
    14,
    debtor?.debtorReference ?? "",
    FIELD_X,
    FIELD_RIGHT,
    false,
  );
  y += ROW;

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
  y += 13.5 * MM;

  dottedRow(doc, y, "Code identifiant du tiers débiteur", 16, "", FIELD_X, FIELD_RIGHT, false);
  y += ROW;

  dottedRow(
    doc,
    y,
    "Nom du tiers créancier : le créancier doit compléter cette section s'il remet des prélèvements pour le compte d'un tiers.",
    17,
    "",
    FIELD_X,
    FIELD_RIGHT,
    false,
  );
  y += ROW;

  dottedRow(doc, y, "Code identifiant du tiers créancier", 18, "", FIELD_X, FIELD_RIGHT, false);
  y += ROW;

  label(doc, "Contrat concerné", y, 9);
  dottedRow(
    doc,
    y,
    "Numéro d'identification du contrat",
    19,
    debtor?.contractNumber ?? "",
    FIELD_X,
    FIELD_RIGHT,
    false,
  );
  y += ROW;

  dottedRow(
    doc,
    y,
    "Description du contrat",
    20,
    creditor.mandateContractDescription,
    FIELD_X,
    FIELD_RIGHT,
    false,
  );
  const bottom = y + ROW;
  line(doc, BOX_LEFT, bottom, BOX_RIGHT, RULE);
  return bottom;
}

/**
 * Le pied : « A retourner à » et la zone réservée au créancier.
 *
 * L'adresse de retour est **préremplie**, et c'est le seul endroit du document
 * où notre adresse sert à autre chose qu'à nous identifier : elle dit au client
 * où poster la fiche signée. La laisser vide sur une fiche préremplie serait la
 * seule question qu'il aurait à nous reposer.
 */
function footer(doc: Doc, top: number, creditor: CreditorSnapshot): number {
  // Quatre lignes possibles (raison sociale + trois d'adresse) à 3,1 mm :
  // la hauteur est déduite du contenu, pas fixée au jugé. Une cellule trop
  // courte laisserait le pays sortir SOUS le cadre, ce qui est arrivé.
  const bottom = top + 18 * MM;
  const split = 115 * MM;
  vline(doc, split, top, bottom, HAIRLINE);

  put(doc, "A retourner à :", LABEL_X, top + 2 * MM, { size: 9.5 });
  put(
    doc,
    [creditorNameOn(creditor), ...creditorAddressOn(creditor)].join("\n"),
    LABEL_X,
    top + 6.5 * MM,
    {
      size: 7.5,
      width: split - LABEL_X - 4 * MM,
    },
  );

  put(doc, "Zone réservée à l'usage exclusif du créancier", split + 2 * MM, top + 2 * MM, {
    size: 8,
  });
  return bottom;
}

/**
 * L'adresse du snapshot, répartie sur les zones 9, 10 et 11.
 *
 * Le code postal et la ville arrivent sur une même ligne (« 73150 Val d'Isère »)
 * parce que c'est ainsi qu'une adresse s'écrit ; le formulaire, lui, les sépare
 * en un peigne et une ligne. La coupe se fait sur le premier groupe de chiffres.
 */
function splitAddress(lines: readonly string[]): {
  street: string;
  postalCode: string;
  city: string;
  country: string;
} {
  const rest = [...lines];
  const country = rest.length > 1 ? (rest.pop() ?? "") : "";
  const cityLine = rest.length > 1 ? (rest.pop() ?? "") : "";
  const matched = /^\s*(\d{4,5})\s+(.*)$/u.exec(cityLine);
  return {
    street: rest.join(", "),
    postalCode: matched?.[1] ?? "",
    city: matched?.[2] ?? cityLine,
    country,
  };
}

function draw(
  doc: Doc,
  creditor: CreditorSnapshot,
  logo: Buffer | null,
  debtor: DebtorSnapshot | null,
  issuance: MandateIssuance | null,
): void {
  // 🔴 **Le filigrane et la RUM sont liés par construction.** Il tombe si, et
  // seulement si, une référence est imprimée. Les découpler laisserait sortir un
  // document d'apparence signable et sans référence — que le client signerait,
  // et qui ne vaudrait rien : une autorisation qu'il ne peut opposer à sa banque
  // et que nous ne pouvons rattacher à aucun prélèvement.
  if (issuance === null) {
    watermark(doc);
  }
  const top = title(doc, issuance !== null);
  let y = header(doc, top, logo, issuance?.reference ?? "");
  y = authorization(doc, y, creditorNameOn(creditor));
  y = debtorZones(doc, y, debtor);
  y = creditorZones(doc, y, creditor);
  y = signatureZones(doc, y, creditor.mandatePaymentType);
  y = contractZones(doc, y, creditor, debtor);
  y = footer(doc, y, creditor);

  // Le cadre général en dernier : dessiné avant, les remplissages de cases le
  // recouvriraient par endroits.
  box(doc, BOX_LEFT, top, BOX_RIGHT - BOX_LEFT, y - top);
  put(doc, "(1) Cette ligne a une longueur maximum de 35 caractères", BOX_LEFT, y + 2 * MM, {
    size: 7.2,
  });
}

/**
 * Rend la fiche de mandat préremplie. **Déterministe** : mêmes entrées, mêmes
 * octets.
 *
 * Prend le snapshot plutôt que l'agrégat, et c'est ce qui rend l'incomplétude
 * inexprimable : `creditorSnapshot()` refuse de rendre une copie à qui n'a pas
 * d'ICS, donc aucune fiche ne peut sortir avec une zone 8 vide.
 *
 * `logo` est le logo de **l'entité qui émet**, et non plus une constante du
 * produit : une seconde entité émettrice aurait le sien, et un logo de marque
 * figé dans un rendu générique était la singularité que la table
 * `legal_entities` avait justement évitée en base. `null` laisse la cellule
 * vide, sans placeholder — voir {@link header}.
 */
/**
 * Ce qui transforme un exemplaire en **document signable** : une RUM.
 *
 * Un seul champ, et c'est voulu — tout le reste du mandat existe déjà sans lui.
 * Le jour où l'émission portera autre chose (une date d'émission imprimée, un
 * numéro d'exemplaire), il entrera ici plutôt que de s'ajouter en paramètre.
 */
export interface MandateIssuance {
  /** La RUM, telle qu'elle s'imprimera dans le peigne de 26 cases. */
  readonly reference: string;
}

/**
 * Rend le mandat SEPA.
 *
 * 🔴 `issuance` commande **deux** choses d'un seul geste : la référence
 * imprimée, et la disparition du filigrane EXEMPLE. Les séparer en deux
 * paramètres permettrait de retirer l'avertissement sans donner de référence,
 * c'est-à-dire de produire le seul document dangereux que ce rendu puisse
 * fabriquer.
 *
 * ⚠️ **Le rendu n'est plus déterministe quand `issuance` est fourni** : la RUM
 * porte un tirage et une date de frappe. Les tests qui comparent des octets
 * doivent viser le cas SANS émission ; le cas avec s'éprouve sur le texte.
 */
export async function renderSepaMandatePdf(
  creditor: CreditorSnapshot,
  logo: Buffer | null,
  debtor: DebtorSnapshot | null = null,
  issuance: MandateIssuance | null = null,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    // `Producer` et `Creator` en dur, comme pour le bon de commande : laissés à
    // `pdfkit`, ils porteraient son numéro de version, et une montée de
    // dépendance changerait les octets d'un document qu'on compare.
    info: {
      Title:
        issuance === null
          ? `Mandat SEPA (exemple) - ${creditor.name}`
          : `Mandat SEPA ${issuance.reference} - ${creditor.name}`,
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
  draw(doc, creditor, logo, debtor, issuance);
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

/**
 * Le nom du créancier **tel que la banque le connaît** — le titulaire du compte.
 *
 * 🔴 Et pas la raison sociale du registre, alors que les deux coïncident presque
 * toujours (branché le 2026-09-12). C'est « presque » qui décide : le débiteur
 * verra sur son relevé le libellé que SA banque tire du nôtre, et c'est le
 * titulaire du compte qui le produit. Imprimer un autre nom sur le mandat ferait
 * un papier que le client ne rapproche pas de sa ligne de relevé — et un mandat
 * qu'on ne reconnaît pas est un mandat qu'on conteste.
 *
 * Le repli sur la raison sociale ne sert que les entités renseignées avant que
 * le bloc du RIB existe : `creditorSnapshot()` ne se rend que si un compte est
 * posé, donc `accountHolder` est en pratique toujours là.
 */
function creditorNameOn(creditor: CreditorSnapshot): string {
  return creditor.accountHolder ?? creditor.name;
}

/** Même raisonnement que {@link creditorNameOn}, pour l'adresse imprimée. */
function creditorAddressOn(creditor: CreditorSnapshot): readonly string[] {
  return creditor.accountAddressLines.length > 0
    ? creditor.accountAddressLines
    : creditor.addressLines;
}

/**
 * L'anatomie d'un ICS : deux lettres de pays, deux chiffres de clé, trois
 * caractères de code activité, puis le numéro national.
 */
const ICS_HEAD_GROUPS = [2, 2, 3] as const;
const ICS_HEAD_LENGTH = 7;

/**
 * Le plus grand peigne qui tient dans la largeur du formulaire.
 *
 * 🔴 Ce n'est pas une marge de confort : c'est le nombre de cases du peigne de
 * l'IBAN débiteur, juste au-dessus, dont la largeur est éprouvée sur la page
 * depuis le premier rendu. Au-delà, le peigne déborderait de la zone imprimable
 * — et un identifiant coupé par le bord de la page est pire qu'un identifiant
 * sur une ligne pointillée.
 */
const ICS_COMB_MAX_BOXES = 27;

/**
 * La zone 8 — l'identifiant créancier, **en cases** comme l'IBAN et le BIC.
 *
 * Le peigne est dimensionné sur la LONGUEUR RÉELLE de l'ICS, jamais sur une
 * constante : `CreditorIdentifier` accepte de 8 à 35 caractères (13 imposés aux
 * seuls ICS français), et un peigne fixe **tronquerait en silence** un ICS
 * étranger. Une case de moins que de caractères, sur un identifiant que le
 * débiteur oppose à sa banque, ne se verrait qu'en contestation.
 *
 * Au-delà de ce que la largeur admet, on retombe sur la ligne pointillée : le
 * numéro y tient en entier, ce qui est la seule chose qui ne se négocie pas.
 */
function icsRow(doc: Doc, y: number, ics: string): void {
  if (ics.length <= ICS_HEAD_LENGTH || ics.length > ICS_COMB_MAX_BOXES) {
    dottedRow(doc, y, "Identifiant du créancier", 8, ics);
    return;
  }
  star(doc, FIELD_X - 4 * MM, y);
  comb(doc, FIELD_X, y + 0.4 * MM, [...ICS_HEAD_GROUPS, ics.length - ICS_HEAD_LENGTH], ics);
  caption(doc, "Identifiant du créancier", FIELD_X, y + 5.2 * MM);
  zone(doc, 8, y);
}
