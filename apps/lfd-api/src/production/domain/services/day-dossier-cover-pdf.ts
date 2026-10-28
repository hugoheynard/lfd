import type { ProductionOrderSnapshot } from "../entities/production-day.js";
import type { DayDossier } from "./day-dossier.js";
import { resupplySheetTitleOf } from "./day-dossier.js";
import { lotCount } from "./day-dossier-recap-pdf.js";
import type { MakeRoom } from "./day-dossier-resupplies-pdf.js";
import { fulfillmentLabelOf } from "./fulfillment-method-label.js";
import { piecesOfLines, type TalliedLine } from "./line-tally.js";
import { drawOrderSwatch } from "./order-color-swatch.js";
import {
  LEFT,
  MM,
  RIGHT,
  ROW_GRAY,
  WIDTH,
  put,
  putCaps,
  putRight,
  rule,
  weekdayLongDate,
  type Doc,
} from "../../../platform/pdf/paper-pdf-kit.js";

/**
 * **La première page du dossier** (Hugo, 2026-10-25) — « Dossier de
 * production du jeudi 8 octobre 2026 », puis les grandes lignes : le lot
 * compté, les commandes par acheminement, les rayons et leurs totaux, les
 * réassorts. Rien que le dossier ne sache déjà : chaque chiffre est une somme
 * de ce que les pages suivantes détaillent.
 */

/** Les couleurs du cadre de la couverture : par commande, par site de réassort. */
export interface CoverColors {
  readonly orders: ReadonlyMap<string, string>;
  readonly resupplies: ReadonlyMap<string, string>;
}

const ROW = 8 * MM;

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count > 1 ? "s" : ""}`;
}

/** Un article au poids compte pour une ligne (P6 de `pricing/vente-au-poids.md`). */
function pieces(lines: readonly TalliedLine[]): number {
  return piecesOfLines(lines);
}

/** Dessine la couverture à partir de `top` ; rend le `y` dessous. */
export function drawDossierCover(
  doc: Doc,
  dossier: DayDossier,
  serviceDay: string,
  top: number,
  room: MakeRoom,
  colors: CoverColors,
): number {
  let y = top + 4 * MM;
  put(doc, `Dossier de production du ${weekdayLongDate(serviceDay)}`, LEFT, y, {
    size: 20,
    bold: true,
    width: WIDTH,
  });
  y += 12 * MM;
  put(doc, lotCount(dossier), LEFT, y, { size: 12, width: WIDTH });
  y += 8 * MM;
  rule(doc, y, 2);
  y = drawRouting(doc, dossier.sheets, y + 8 * MM, room, colors.orders);
  y = drawShelves(doc, dossier, y + 6 * MM, room);
  return drawResupplies(doc, dossier, y + 6 * MM, room, colors.resupplies);
}

/** Un titre de bloc, et son filet. */
function heading(doc: Doc, text: string, top: number, room: MakeRoom): number {
  const y = room(top, 3 * ROW);
  putCaps(doc, text, LEFT, y);
  rule(doc, y + 5 * MM, 1);
  return y + 8 * MM;
}

/** Une ligne de bloc : pastille éventuelle, libellé, détail, total à droite. */
function row(
  doc: Doc,
  y: number,
  cells: {
    readonly color: string | null;
    readonly label: string;
    readonly detail: string;
    readonly total: string;
  },
): number {
  const swatch = drawOrderSwatch(doc, cells.color, LEFT, y + 0.2 * MM);
  put(doc, cells.label, LEFT + swatch, y, { size: 12, bold: true, width: WIDTH * 0.55 - swatch });
  putRight(doc, cells.detail, RIGHT - 32 * MM, y + 0.5 * MM, 10.5);
  putRight(doc, cells.total, RIGHT, y, 12, true);
  rule(doc, y + 6 * MM, 0.6, ROW_GRAY);
  return y + ROW;
}

/** Les commandes par acheminement : retraits par site et clientèle, puis livraisons. */
function drawRouting(
  doc: Doc,
  orders: readonly ProductionOrderSnapshot[],
  top: number,
  room: MakeRoom,
  colors: ReadonlyMap<string, string>,
): number {
  if (orders.length === 0) {
    return top;
  }
  const groups = new Map<string, ProductionOrderSnapshot[]>();
  // Les retraits d'abord, puis les livraisons ; l'ordre du dossier dans chacun.
  const rank = (order: ProductionOrderSnapshot): number =>
    order.fulfillmentMethod === "pickup" ? 0 : 1;
  const sorted = [...orders].sort((a, b) => rank(a) - rank(b));
  for (const order of sorted) {
    const label = fulfillmentLabelOf(order);
    groups.set(label, [...(groups.get(label) ?? []), order]);
  }
  let y = heading(doc, "COMMANDES PAR ACHEMINEMENT", top, room);
  for (const [label, members] of groups) {
    y = room(y, ROW);
    const color = members.map((order) => colors.get(order.orderId)).find((c) => c !== undefined);
    y = row(doc, y, {
      color: color ?? null,
      label,
      detail: plural(members.length, "commande"),
      total: plural(pieces(members.flatMap((order) => order.lines)), "pièce"),
    });
  }
  return y;
}

/** Les rayons : le total à produire de chacun, réassorts compris. */
function drawShelves(doc: Doc, dossier: DayDossier, top: number, room: MakeRoom): number {
  if (dossier.recap.length === 0) {
    return top;
  }
  let y = heading(doc, "RAYONS — TOTAL À PRODUIRE", top, room);
  for (const group of dossier.recap) {
    y = room(y, ROW);
    const resupply =
      group.resupplyQuantity === 0 ? "" : ` · dont ${String(group.resupplyQuantity)} réassort`;
    y = row(doc, y, {
      color: null,
      label: group.label,
      detail: `${plural(group.lines.length, "article")}${resupply}`,
      total: plural(group.quantity, "pièce"),
    });
  }
  return y;
}

/** Les réassorts : un par point, avec sa teinte. */
function drawResupplies(
  doc: Doc,
  dossier: DayDossier,
  top: number,
  room: MakeRoom,
  colors: ReadonlyMap<string, string>,
): number {
  if (dossier.resupplySheets.length === 0) {
    return top;
  }
  let y = heading(doc, "RÉASSORTS", top, room);
  for (const resupply of dossier.resupplySheets) {
    y = room(y, ROW);
    y = row(doc, y, {
      color: colors.get(resupply.siteId) ?? null,
      label: resupplySheetTitleOf(resupply),
      // « Servi sur place » retiré (Hugo, 2026-10-25) : seul le transfert se dit.
      detail: resupply.servedByTransfer ? "Par transfert" : "",
      total: plural(pieces(resupply.lines), "pièce"),
    });
  }
  return y;
}
