import type { Buffer } from "node:buffer";

import type { ProductionGrouping } from "@lfd/contracts";

import {
  LEFT,
  MM,
  RIGHT,
  ROW_GRAY,
  WIDTH,
  parisDateTime,
  put,
  putCaps,
  putRight,
  render,
  rule,
  type Doc,
} from "../../../../platform/pdf/paper-pdf-kit.js";
import { PaperPages } from "../../../../platform/pdf/paper-pages.js";
import type { DayDossier } from "./day-dossier.js";
import type { CalendarPage } from "./day-dossier-calendar.js";
import { drawRecapWithCalendars } from "./day-dossier-pdf.js";
import type { SimulationCover } from "./production-simulation.js";

/**
 * **La simulation du catalogue en production, en PDF** (plan
 * `documentation/fournil/les-postes-du-fournil.md`, § 3.11) — une couverture qui compte
 * les lignes par groupe et nomme les articles « à ranger », puis la partie
 * « un rayon et son calendrier » du dossier du jour, dessinée par le même
 * code (`drawRecapWithCalendars`). Ni bon de commande, ni BL, ni réassort.
 *
 * Chaque page porte « SIMULATION — ne pas produire », en tête et en pied :
 * une feuille égarée au fournil ne doit pas se lire comme un ordre.
 */

/** Ce que chaque page dit, en tête et en pied. */
export const SIMULATION_MARK = "SIMULATION — ne pas produire";

const ROW = 8 * MM;

const MODE_LABELS: Readonly<Record<ProductionGrouping, string>> = {
  shelf: "mode boutique (par rayon)",
  workstation: "mode prod (par poste)",
};

/** Ce que le tirage pose à côté du dossier simulé. */
export interface SimulationPrint {
  readonly logo: Buffer;
  /** L'instant du tirage — la date du pied, et celle des métadonnées. */
  readonly at: Date;
}

/** Rend la simulation. */
export function renderProductionSimulationPdf(
  cover: SimulationCover,
  dossier: DayDossier,
  calendar: readonly CalendarPage[],
  print: SimulationPrint,
): Promise<Buffer> {
  return render(
    print.at,
    `Simulation du catalogue — ${MODE_LABELS[cover.mode]}`,
    (doc) => {
      const pages = new PaperPages(doc);
      drawCover(doc, cover, pages);
      drawRecapWithCalendars(doc, pages, dossier.recap, calendar);
      pages.finish({
        logo: print.logo,
        headerRight: SIMULATION_MARK,
        footerLeft: `${SIMULATION_MARK} · ${MODE_LABELS[cover.mode]} · tirée le ${parisDateTime(print.at)}`,
      });
    },
    true,
  );
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count > 1 ? "s" : ""}`;
}

/** La couverture : le mode, le compte, les groupes, puis les articles à ranger. */
function drawCover(doc: Doc, cover: SimulationCover, pages: PaperPages): void {
  const room = (at: number, needed: number): number => pages.room(at, needed);
  let y = pages.open("Simulation du catalogue") + 4 * MM;
  put(doc, `Simulation du catalogue — ${MODE_LABELS[cover.mode]}`, LEFT, y, {
    size: 18,
    bold: true,
    width: WIDTH,
  });
  y += 12 * MM;
  const intro =
    `Une pièce de chacun des ${plural(cover.lineCount, "article")} vendables, ` +
    "dans une commande fictive. Rien n'est commandé, archivé ni envoyé.";
  put(doc, intro, LEFT, y, { size: 11, width: WIDTH });
  y += 12 * MM;
  rule(doc, y, 2);
  y = heading(doc, "GROUPES — LIGNES PAR GROUPE", y + 8 * MM, room);
  for (const group of cover.groups) {
    y = room(y, ROW);
    put(doc, group.title, LEFT, y, { size: 12, bold: true, width: WIDTH * 0.7 });
    putRight(doc, plural(group.lineCount, "ligne"), RIGHT, y, 12, true);
    rule(doc, y + 6 * MM, 0.6, ROW_GRAY);
    y += ROW;
  }
  drawUnplaced(doc, cover, y + 6 * MM, room);
}

/** Les articles sans poste, nommés — en mode boutique, la question ne se pose pas. */
function drawUnplaced(
  doc: Doc,
  cover: SimulationCover,
  top: number,
  room: (at: number, needed: number) => number,
): void {
  if (cover.mode === "shelf") {
    return;
  }
  let y = heading(doc, `À RANGER — ${plural(cover.unplaced.length, "article")}`, top, room);
  if (cover.unplaced.length === 0) {
    put(doc, "Tous les articles ont un poste.", LEFT, y, { size: 11 });
    return;
  }
  for (const name of cover.unplaced) {
    y = room(y, 6 * MM);
    put(doc, name, LEFT, y, { size: 11, width: WIDTH });
    y += 6 * MM;
  }
}

/** Un titre de bloc, et son filet. */
function heading(
  doc: Doc,
  text: string,
  top: number,
  room: (at: number, needed: number) => number,
): number {
  const y = room(top, 3 * ROW);
  putCaps(doc, text, LEFT, y);
  rule(doc, y + 5 * MM, 1);
  return y + 8 * MM;
}
