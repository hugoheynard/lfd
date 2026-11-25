import type { Buffer } from "node:buffer";

import type { DeliveryNoteDrawing } from "../../../channels/commerce/planned-delivery-notes.reader.js";
import { type PlanSigner, signedVerb, staffSigner } from "../../../day/index.js";
import { todayOf } from "../../../day/index.js";
import type { DayDossier } from "./day-dossier.js";
import type { CalendarPage } from "./day-dossier-calendar.js";
import { drawCalendarPage } from "./day-dossier-calendar-pdf.js";
import { drawDossierCover } from "./day-dossier-cover-pdf.js";
import { drawOrder, lotBanner } from "./day-dossier-order-sheet-pdf.js";
import { drawRecapGroup } from "./day-dossier-recap-pdf.js";
import { drawResupplySheet } from "./day-dossier-resupplies-pdf.js";
import {
  FUNCTION_SHEET_BAND,
  type PreparedEventSheets,
  drawFunctionSheets,
  functionSheetsFooter,
} from "./day-dossier-function-sheets-pdf.js";
import {
  type DossierPart,
  type DossierSelection,
  WHOLE_DOSSIER,
  selectedRecap,
} from "./day-dossier-selection.js";
import {
  parisDateTime,
  render,
  weekdayShortDate,
  type Doc,
} from "../../../../platform/pdf/paper-pdf-kit.js";
import { contentRightOf, PaperPages } from "../../../../platform/pdf/paper-pages.js";
import { type PdfOverlay, overlaidPdf } from "../../../../platform/pdf/embedded-pdf.js";
import {
  PROVISIONAL_FOOTER,
  type ProvisionalStamp,
  provisionalHeader,
} from "./provisional-stamp.js";

/**
 * **Le dossier du jour, en PDF** — couverture, un rayon par page, un bon par
 * commande suivi de son BL, un bon par réassort, puis les fiches de fonction
 * des événements du jour, en UN fichier
 * (`documentation/fournil/dossier-prod-du-jour.md`). Le lot est compté, chaque
 * bon numéroté, et aucun montant n'y figure. Déterministe : ses dates
 * viennent de la clôture et du retirage, jamais de l'horloge.
 */

/** Les instants qui datent le papier. */
export interface DossierStamp {
  readonly serviceDay: string;
  readonly closedAt: Date;
  /** Qui l'a arrêté — `null` : inconnu (journée arrêtée avant 2026-10-06). */
  readonly closedBy: PlanSigner | null;
  /** Le dernier retirage, `null` tant que la journée porte son tirage d'origine. */
  readonly retakenAt: Date | null;
  /** Qui a complété, nom figé au retirage ; `null` si inconnu. */
  readonly retakenByName: string | null;
  /** Le tirage : 1 à l'arrêt, plus un à chaque retirage. */
  readonly printRun: number;
  /**
   * Une impression **provisoire**, tirée avant l'arrêt : chaque page le dit en
   * tête (« Provisoire 26/11 #4 11:15 ») et au pied. Absente ou `null` : le
   * papier arrêté.
   */
  readonly provisional?: ProvisionalStamp | null;
}

/**
 * Ce que le dossier pose à côté de la journée figée, lu au tirage.
 *
 * - `colisageUrlOf` rend l'URL du QR d'un bon, ou une chaîne vide — aucun code
 *   n'est alors imprimé, comme sur la feuille d'atelier.
 * - `colors` porte la pastille de chaque commande, par `orderId`, posée devant
 *   son acheminement ; une commande absente n'en a pas.
 * - `resupplyColors` porte, par `siteId`, la teinte de réassort du site.
 * - `deliveryNotes` porte, par `orderId`, le BL imprimé derrière le bon.
 * - `functionSheets` porte les fiches de fonction des événements du jour,
 *   jointes à la fin ; absent : aucune ; `null` : illisibles, le pied le dit.
 */
export interface DossierPrint {
  readonly logo: Buffer;
  readonly colisageUrlOf: (reference: string) => string;
  readonly colors: ReadonlyMap<string, string>;
  readonly resupplyColors: ReadonlyMap<string, string>;
  readonly deliveryNotes: ReadonlyMap<string, DeliveryNoteDrawing>;
  readonly functionSheets?: readonly PreparedEventSheets[] | null;
}

/**
 * Les parties et rayons d'un tirage partiel (les commandes sont filtrées par
 * l'appelant, `selectedOrders`), et la mention d'en-tête qui le dit.
 */
export interface DossierExtract {
  readonly selection: DossierSelection;
  /** « sélection : 3 commandes sur 14 », `null` : toutes les commandes. */
  readonly notice: string | null;
}

/** Le dossier entier, sans mention : le papier de l'arrêt. */
export const WHOLE_EXTRACT: DossierExtract = { selection: WHOLE_DOSSIER, notice: null };

/**
 * Rend le dossier, ou les parties choisies. Le folio compte les pages du
 * fichier tiré, fiches de fonction comprises : une feuille manquante se voit
 * toujours.
 */
export async function renderDayDossierPdf(
  dossier: DayDossier,
  stamp: DossierStamp,
  print: DossierPrint,
  /** Le calendrier par tranche, une page paysage par catégorie — vide : aucune. */
  calendar: readonly CalendarPage[] = [],
  extract: DossierExtract = WHOLE_EXTRACT,
): Promise<Buffer> {
  const { parts } = extract.selection;
  let overlays: readonly PdfOverlay[] = [];
  const paper = await render(
    stamp.retakenAt ?? stamp.closedAt,
    `Dossier du jour ${stamp.serviceDay}`,
    (doc) => {
      const pages = new PaperPages(doc);
      const room = (at: number, needed: number): number => pages.room(at, needed);
      if (parts.has("cover")) {
        drawDossierCover(
          doc,
          dossier,
          stamp.serviceDay,
          pages.open("Dossier de production"),
          room,
          {
            orders: print.colors,
            resupplies: print.resupplyColors,
          },
        );
      }
      drawRecapWithCalendars(
        doc,
        pages,
        selectedRecap(dossier.recap, extract.selection),
        calendar,
        {
          recap: parts.has("recap"),
          calendar: parts.has("calendar"),
        },
      );
      drawOrders(doc, pages, dossier, { stamp, print, parts });
      if (parts.has("resupplies")) {
        drawResupplies(doc, pages, dossier, stamp, print);
      }
      if (parts.has("functionSheets")) {
        overlays = drawFunctionSheets(doc, pages, print.functionSheets ?? []);
      }
      const header = pageHeader(stamp);
      pages.finish({
        logo: print.logo,
        headerRight: extract.notice === null ? header : `${header} · ${extract.notice}`,
        headerRightBold: true,
        footerLeft: functionSheetsFooter(
          stampLine(stamp),
          parts.has("functionSheets") && print.functionSheets === null,
        ),
      });
    },
    true,
  );
  return overlaidPdf(paper, overlays, FUNCTION_SHEET_BAND);
}

/** Ce que la boucle des bons lit au-delà du dossier. */
interface OrdersPass {
  readonly stamp: DossierStamp;
  readonly print: DossierPrint;
  readonly parts: ReadonlySet<DossierPart>;
}

/** Le BL s'imprime en deux exemplaires (décidé par Hugo le 2026-11-25). */
const DELIVERY_NOTE_COPIES = 2;

/** Un bon par commande, chacun suivi de son BL — l'un, l'autre ou les deux. */
function drawOrders(doc: Doc, pages: PaperPages, dossier: DayDossier, pass: OrdersPass): void {
  const room = (at: number, needed: number): number => pages.room(at, needed);
  dossier.sheets.forEach((order, index) => {
    if (pass.parts.has("orders")) {
      const rank = `bon ${String(index + 1)}/${String(dossier.sheets.length)}`;
      const top = pages.open(`${order.reference} — Fiche de commande`);
      drawOrder(doc, order, { top, rank, stamp: pass.stamp, room }, pass.print);
    }
    const note = pass.print.deliveryNotes.get(order.orderId);
    if (pass.parts.has("deliveryNotes") && note !== undefined) {
      for (let copy = 0; copy < DELIVERY_NOTE_COPIES; copy += 1) {
        pages.foreign(note);
      }
    }
  });
}

/** Un bon par réassort, numérotés. */
function drawResupplies(
  doc: Doc,
  pages: PaperPages,
  dossier: DayDossier,
  stamp: DossierStamp,
  print: DossierPrint,
): void {
  const room = (at: number, needed: number): number => pages.room(at, needed);
  dossier.resupplySheets.forEach((resupply, index) => {
    const rank = `réassort ${String(index + 1)}/${String(dossier.resupplySheets.length)}`;
    const top = pages.open("Fiche de réassort");
    drawResupplySheet(
      doc,
      resupply,
      top,
      lotBanner(stamp),
      rank,
      room,
      print.resupplyColors.get(resupply.siteId) ?? null,
    );
  });
}

/** Quelles pages d'un rayon dessiner : son total, son calendrier. */
export interface RecapPages {
  readonly recap: boolean;
  readonly calendar: boolean;
}

/**
 * Chaque rayon : son total du jour, puis son calendrier par tranche horaire
 * juste derrière (Hugo, 2026-11-02 : « pour respecter un ordre logique »).
 * La partie « un rayon et son calendrier » du dossier, que la simulation du
 * catalogue rend aussi.
 */
export function drawRecapWithCalendars(
  doc: Doc,
  pages: PaperPages,
  recap: DayDossier["recap"],
  calendar: readonly CalendarPage[],
  which: RecapPages = { recap: true, calendar: true },
): void {
  const room = (at: number, needed: number): number => pages.room(at, needed);
  const calendarOf = new Map(calendar.map((page) => [page.label, page]));
  for (const group of recap) {
    if (which.recap) {
      drawRecapGroup(doc, group, pages.open(`${group.label} — total à produire`), room);
    }
    const page = calendarOf.get(group.label);
    if (which.calendar && page !== undefined && page.rows.length > 0) {
      const top = pages.openLandscape(`${page.label} — par tranche horaire`);
      drawCalendarPage(doc, page, top, room, contentRightOf("landscape"));
    }
  }
}

/**
 * La clé d'archive. **Une par tirage arrêté** : la clôture, puis chaque
 * retirage, dont l'instant entre dans le nom — le dossier complété ne
 * remplace pas celui qui est parti avant lui, il s'y ajoute.
 *
 * Toute mise en page qui change ce qu'un dossier déjà archivé dirait monte
 * cette version : un dossier archivé sous l'ancienne clé dit le papier
 * d'avant, et changer la clé le laisse en place sans jamais le resservir.
 * Une impression provisoire n'est pas archivée ici : elle ne la fait pas
 * monter.
 */
export const DOSSIER_LAYOUT_VERSION = "v16";

export function dayDossierPdfKey(serviceDay: string, retakenAt: Date | null): string {
  const base = `${serviceDay}/dossier-du-jour-${DOSSIER_LAYOUT_VERSION}`;
  if (retakenAt === null) {
    return `${base}.pdf`;
  }
  return `${base}-retirage-${retakenAt.toISOString().replace(/[:.]/g, "-")}.pdf`;
}

/**
 * L'en-tête de chaque page, en gras (Hugo, 2026-11-18) : le jour du plan —
 * celui du dernier tirage, arrêt ou retirage, à l'heure de Paris —, le jour
 * du lot, et le tirage. Une fiche de poste qui traîne dit d'elle-même de
 * quand elle date, pour quel jour, et si elle est la dernière.
 */
export function dossierHeader(
  stamp: Pick<DossierStamp, "serviceDay" | "printRun" | "closedAt" | "retakenAt">,
): string {
  const planDay = todayOf(stamp.retakenAt ?? stamp.closedAt);
  return `Plan du ${weekdayShortDate(planDay)} pour le ${weekdayShortDate(stamp.serviceDay)} · v${String(stamp.printRun)}`;
}

/** L'en-tête d'une page : celui du papier arrêté, ou le bandeau provisoire. */
function pageHeader(stamp: DossierStamp): string {
  const provisional = stamp.provisional ?? null;
  return provisional === null
    ? dossierHeader(stamp)
    : provisionalHeader(stamp.serviceDay, provisional);
}

/** Le pied : quand le tirage a été arrêté — et complété ; ou qu'il ne l'est pas. */
function stampLine(stamp: DossierStamp): string {
  if ((stamp.provisional ?? null) !== null) {
    return PROVISIONAL_FOOTER;
  }
  const arrested = `${signedVerb("Arrêté", stamp.closedBy)} ${parisDateTime(stamp.closedAt)}`;
  const completer = stamp.retakenByName === null ? null : staffSigner("", stamp.retakenByName);
  return stamp.retakenAt === null
    ? arrested
    : `${arrested} — ${signedVerb("complété", completer)} ${parisDateTime(stamp.retakenAt)}`;
}
