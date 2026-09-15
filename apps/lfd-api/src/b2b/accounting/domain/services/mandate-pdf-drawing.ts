import { Buffer } from "node:buffer";

import PDFDocument from "pdfkit";

import type { CreditorSnapshot } from "../creditor-snapshot.js";
import type { DebtorSnapshot } from "../debtor-snapshot.js";
import { MandateFieldTooLongError } from "../errors/accounting-errors.js";
import type { MandatePaymentType } from "../value-objects/mandate-defaults.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";

/**
 * **Les primitives de dessin des deux mandats** — CORE et interentreprises.
 *
 * Sorties de `sepa-mandate-pdf.ts` le 2026-09-15, quand le rendu unique est
 * devenu deux mises en page : ce qui est ici ne dépend d'AUCUNE des deux
 * (coordonnées de colonnes, zones numérotées). Ce qui en dépend reste dans
 * `core-mandate-pdf.ts` ou `b2b-mandate-pdf.ts`.
 */

/** A4 en points PostScript, et le millimètre dans lequel tout le dessin est spécifié. */
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MM = PAGE_WIDTH / 210;

export const BLACK = "#000000";
/** Le gris de la mention « EXEMPLE » en travers de la page. */
const WATERMARK_GRAY = "#DCDCDC";

export const REGULAR = "Helvetica";
export const BOLD = "Helvetica-Bold";
export const OBLIQUE = "Helvetica-Oblique";
export const BOLD_OBLIQUE = "Helvetica-BoldOblique";

export const HAIRLINE = 0.6;
/** Les filets qui séparent les grands pavés, plus marqués que ceux des zones. */
export const RULE = 0.9;

/**
 * 🔴 **Date figée, et ce n'est pas un contournement du port d'horloge.**
 *
 * `pdfkit` pose sinon une `/CreationDate` tirée de l'horloge système, et deux
 * rendus de la même entité donneraient des octets différents. Le document
 * n'atteste d'aucun instant : la date qui compte est celle que le signataire
 * écrit à la main.
 *
 * Le domaine reste pur : c'est une CONSTANTE du document, pas une lecture de
 * `new Date()`.
 */
const FROZEN_DATE = new Date(Date.UTC(2000, 0, 1));

/** Le document en cours de dessin. `pdfkit` tient la plume, on tient le plan. */
export type Doc = PDFKit.PDFDocument;

/**
 * Ce qui transforme un exemplaire en **document signable** : une RUM.
 *
 * Un seul champ, et c'est voulu — tout le reste du mandat existe déjà sans lui.
 * Le jour où l'émission portera autre chose (une date d'émission imprimée, un
 * numéro d'exemplaire), il entrera ici plutôt que de s'ajouter en paramètre.
 */
export interface MandateIssuance {
  /** La RUM, telle qu'elle s'imprimera dans le peigne de la mise en page. */
  readonly reference: string;
}

/**
 * **La forme du mandat** : sous quel schéma, et pour quel type de paiement.
 *
 * 🔴 Distincte de l'émetteur, et c'est tout l'objet du type (objection 2 du
 * plan `plan-mandat-deux-schemas.md`) : un brouillon imprimé porte la forme
 * sous laquelle il a été FRAPPÉ, pas le réglage courant de l'entité. Lire
 * `creditor.mandateScheme` pour imprimer un brouillon ferait signer un papier
 * CORE pour un mandat que le lot prélèvera en interentreprises.
 */
export interface MandateForm {
  readonly scheme: SepaScheme;
  readonly paymentType: MandatePaymentType;
}

/** Tout ce qu'une mise en page reçoit — le même paquet pour les deux. */
export interface MandateDrawing {
  readonly form: MandateForm;
  readonly creditor: CreditorSnapshot;
  readonly logo: Buffer | null;
  readonly debtor: DebtorSnapshot | null;
  readonly issuance: MandateIssuance | null;
}

export interface TextOptions {
  readonly size: number;
  readonly font?: string;
  readonly width?: number;
  readonly color?: string;
  readonly align?: "left" | "center" | "right" | "justify";
}

/** Pose un texte à une position absolue. `lineBreak: false` sauf largeur donnée. */
export function put(doc: Doc, text: string, x: number, y: number, options: TextOptions): void {
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
export function line(doc: Doc, x1: number, y: number, x2: number, thickness: number): void {
  doc.save().lineWidth(thickness).strokeColor(BLACK).moveTo(x1, y).lineTo(x2, y).stroke().restore();
}

/** Un trait vertical — les refends de l'en-tête et du pied. */
export function vline(doc: Doc, x: number, y1: number, y2: number, thickness: number): void {
  doc.save().lineWidth(thickness).strokeColor(BLACK).moveTo(x, y1).lineTo(x, y2).stroke().restore();
}

/** Un rectangle au trait. */
export function box(doc: Doc, x: number, y: number, width: number, height: number): void {
  doc.save().lineWidth(HAIRLINE).strokeColor(BLACK).rect(x, y, width, height).stroke().restore();
}

/** La géométrie d'un peigne : largeur et hauteur d'une case, écart entre groupes. */
export interface CombGeometry {
  readonly cell: number;
  readonly height: number;
  readonly gap: number;
  readonly size: number;
}

/** Le peigne du modèle EPC (CORE), éprouvé sur la page depuis le premier rendu. */
const EPC_COMB: CombGeometry = { cell: 4.1 * MM, height: 4.3 * MM, gap: 1.6 * MM, size: 9 };

/**
 * Un **peigne de cases** — une case par caractère.
 *
 * La norme les emploie partout où la saisie doit se relire chiffre à chiffre :
 * RUM, code postal, IBAN, BIC, date. Ce n'est pas de la décoration — un IBAN
 * écrit à main levée sur une ligne continue est un IBAN qu'on ressaisit à
 * l'aveugle, et la clé mod-97 ne rattrape qu'une faute sur cent.
 *
 * `groups` décrit le découpage (`[4, 4, 4, 3]`) ; `filled` pose éventuellement
 * une valeur, un caractère par case. Rend l'abscisse de fin du peigne.
 *
 * 🔴 **Il REFUSE ce qui déborde, depuis le 2026-09-12.** Il remplissait case par
 * case et ignorait tout caractère au-delà de la dernière : un IBAN de 31
 * caractères sortait amputé sur le papier signé pendant que la base en gardait
 * la forme entière. Le refus vaut pour TOUS les peignes des deux mises en page.
 *
 * @throws {MandateFieldTooLongError} la valeur dépasse le nombre de cases.
 */
export function comb(
  doc: Doc,
  x: number,
  y: number,
  groups: readonly number[],
  filled = "",
  field = "Cette valeur",
  geometry: CombGeometry = EPC_COMB,
): number {
  const capacity = groups.reduce((total, size) => total + size, 0);
  if (filled.length > capacity) {
    throw new MandateFieldTooLongError(field, filled.length, capacity);
  }
  let cursor = x;
  let index = 0;
  for (const [position, size] of groups.entries()) {
    for (let n = 0; n < size; n += 1) {
      box(doc, cursor, y, geometry.cell, geometry.height);
      const char = filled[index];
      if (char !== undefined) {
        const width = doc.font(BOLD).fontSize(geometry.size).widthOfString(char);
        const top = y + (geometry.height - geometry.size * 0.7) / 2;
        put(doc, char, cursor + (geometry.cell - width) / 2, top, {
          size: geometry.size,
          font: BOLD,
        });
      }
      cursor += geometry.cell;
      index += 1;
    }
    if (position < groups.length - 1) {
      cursor += geometry.gap;
    }
  }
  return cursor;
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
export function watermark(doc: Doc): void {
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
 * le bloc du RIB existe.
 */
export function creditorNameOn(creditor: CreditorSnapshot): string {
  return creditor.accountHolder ?? creditor.name;
}

/** Même raisonnement que {@link creditorNameOn}, pour l'adresse imprimée. */
export function creditorAddressOn(creditor: CreditorSnapshot): readonly string[] {
  return creditor.accountAddressLines.length > 0
    ? creditor.accountAddressLines
    : creditor.addressLines;
}

/** Une adresse répartie comme un formulaire la demande. */
export interface SplitAddress {
  readonly street: string;
  readonly postalCode: string;
  readonly city: string;
  readonly country: string;
}

/**
 * L'adresse du snapshot, répartie en voie, code postal, ville et pays.
 *
 * Le code postal et la ville arrivent sur une même ligne (« 73150 Val d'Isère »)
 * parce que c'est ainsi qu'une adresse s'écrit ; le formulaire, lui, les sépare.
 * La coupe se fait sur le premier groupe de chiffres.
 */
export function splitAddress(lines: readonly string[]): SplitAddress {
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

/**
 * L'adresse du débiteur sur UNE ligne — les deux formulaires n'en ont qu'une.
 *
 * Le complément est recollé derrière plutôt qu'abandonné : « Bâtiment B » perdu,
 * le courrier de la banque n'arrive pas.
 */
export function debtorStreetOf(debtor: DebtorSnapshot | null): string {
  if (debtor === null) {
    return "";
  }
  return debtor.addressLine2 === ""
    ? debtor.addressLine1
    : `${debtor.addressLine1}, ${debtor.addressLine2}`;
}

/** Les métadonnées du fichier — tout ce qui n'est pas dessiné. */
export interface MandateDocumentInfo {
  readonly title: string;
  readonly author: string;
}

/**
 * Ouvre une page A4, laisse `draw` dessiner, rend les octets.
 *
 * `Producer` et `Creator` en dur, comme pour le bon de commande : laissés à
 * `pdfkit`, ils porteraient son numéro de version, et une montée de dépendance
 * changerait les octets d'un document qu'on compare.
 */
export async function renderMandateDocument(
  info: MandateDocumentInfo,
  draw: (doc: Doc) => void,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    info: {
      Title: info.title,
      Author: info.author,
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
  draw(doc);
  doc.end();
  await done;
  return Buffer.concat(chunks);
}
