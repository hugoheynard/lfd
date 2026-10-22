import { type Doc, MM } from "../../../platform/pdf/paper-pdf-kit.js";
import { fillBox, strokeBox } from "../../../platform/pdf/paper-pdf-shapes.js";
import {
  type Block,
  CONTENT_WIDTH,
  CONTENT_X,
  gap,
  MUTED,
  type Row,
} from "./round-paper-pdf-layout.js";
import { rail } from "./round-paper-pdf-stop.js";
import { BODY_SIZE, LIVE, NAME_SIZE, SMALL_SIZE, textRow } from "./round-paper-pdf-rows.js";
import {
  type RoundPaperTransferLine,
  type RoundPaperTransferStop,
  timeLabel,
} from "./round-paper.js";

/** « 3 bacs », « 1 bac », « aucun bac déclaré ». */
function binsLabel(count: number): string {
  if (count === 0) {
    return "Aucun bac déclaré";
  }
  return count === 1 ? "1 bac" : `${String(count)} bacs`;
}

function countLabel(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** Le côté d'une pastille de commande, et l'espace entre deux. */
const SWATCH = 3.5 * MM;
const SWATCH_GAP = 1.5 * MM;

/**
 * **Une pastille par commande** (plan `comptabilite/plan-planche-des-documents-v2.md`,
 * §0 bis, Hugo 2026-10-22) : un carré de sa couleur, cerclé de noir comme le
 * carré d'un arrêt, qui passe à la ligne. Aucun mot ; aucune rangée quand
 * aucune commande n'a de couleur.
 */
function swatchesRows(colors: readonly string[]): readonly Row[] {
  if (colors.length === 0) {
    return [];
  }
  const indent = 3 * MM;
  const step = SWATCH + SWATCH_GAP;
  const perLine = Math.max(1, Math.floor((CONTENT_WIDTH - indent + SWATCH_GAP) / step));
  const lines = Math.ceil(colors.length / perLine);
  return [
    {
      height: lines * step,
      draw: (doc, y) => {
        colors.forEach((color, index) => {
          const box = {
            x: CONTENT_X + indent + (index % perLine) * step,
            y: y + Math.floor(index / perLine) * step,
            width: SWATCH,
            height: SWATCH,
          };
          fillBox(doc, box, color);
          strokeBox(doc, box, 0.5);
        });
      },
    },
  ];
}

/** Une section du manifeste : son titre compté, puis « 12 × Croissant » par article. */
function sectionRows(
  doc: Doc,
  title: string,
  lines: readonly RoundPaperTransferLine[],
  names: readonly string[] = [],
  colors: readonly string[] = [],
): readonly Row[] {
  return [
    gap(1 * MM),
    textRow(doc, title, { size: SMALL_SIZE, bold: true, color: MUTED }),
    ...swatchesRows(colors),
    ...(names.length === 0
      ? []
      : [textRow(doc, names.join(" · "), { size: SMALL_SIZE, color: LIVE.ink, indent: 3 * MM })]),
    ...lines.map((line) =>
      textRow(doc, `${String(line.quantity)} × ${line.productName}`, {
        size: BODY_SIZE,
        color: LIVE.ink,
        indent: 3 * MM,
      }),
    ),
  ];
}

/**
 * **Le bloc d'un arrêt de transfert** (décision de Hugo du 2026-10-13) : le
 * site et son heure d'arrivée requise, son adresse, les bacs, puis le
 * manifeste — commandes et réassorts, totalisés par article (les réassorts
 * nommés sous leur titre, R1g), une pastille par commande colorée sous
 * le titre des commandes (§0 bis, 2026-10-22). La
 * case dit « Remis » : le geste de l'arrêt est « Remis au site ».
 */
export function transferStopBlock(doc: Doc, stop: RoundPaperTransferStop, rank: number): Block {
  const arrival = stop.arrivalBy === null ? "Sans heure" : `avant ${timeLabel(stop.arrivalBy)}`;
  // Pas de « → » : la police standard du papier (WinAnsi) n'a pas la flèche.
  const head = textRow(doc, `Vers ${stop.siteLabel} · ${arrival}`, {
    size: NAME_SIZE,
    bold: true,
    color: LIVE.ink,
  });
  const address =
    stop.addressLines.length === 0
      ? [textRow(doc, "Adresse du site inconnue", { size: BODY_SIZE, color: MUTED })]
      : stop.addressLines.map((line) => textRow(doc, line, { size: BODY_SIZE, color: LIVE.ink }));
  const sections = [
    ...(stop.orderCount === 0
      ? []
      : sectionRows(
          doc,
          `COMMANDES · ${countLabel(stop.orderCount, "commande", "commandes").toUpperCase()}`,
          stop.orderTotals,
          [],
          stop.orderColors,
        )),
    ...(stop.resupplyCount === 0
      ? []
      : sectionRows(
          doc,
          `RÉASSORTS · ${countLabel(stop.resupplyCount, "réassort", "réassorts").toUpperCase()}`,
          stop.resupplyTotals,
          stop.resupplyNames,
        )),
  ];
  return {
    ...rail(rank, LIVE, true, "Remis"),
    rows: [
      head,
      textRow(doc, "Transfert interne · à remettre au site", { size: SMALL_SIZE, color: MUTED }),
      ...address,
      gap(1 * MM),
      textRow(doc, binsLabel(stop.binCount), { size: BODY_SIZE, bold: true, color: LIVE.ink }),
      ...sections,
    ],
    continuation: textRow(doc, `${String(rank)} · Vers ${stop.siteLabel} (suite)`, {
      size: SMALL_SIZE,
      bold: true,
      color: MUTED,
    }),
  };
}
