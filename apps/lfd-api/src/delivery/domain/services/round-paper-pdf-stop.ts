import {
  BOLD,
  type Doc,
  LEFT,
  MM,
  put,
  REGULAR,
  RIGHT,
} from "../../../platform/pdf/paper-pdf-kit.js";
import { drawDisc, fillBox, strokeBox } from "../../../platform/pdf/paper-pdf-shapes.js";
import {
  type Block,
  CONTENT_WIDTH,
  CONTENT_X,
  gap,
  MUTED,
  type Row,
} from "./round-paper-pdf-layout.js";
import {
  BIN_SIZE,
  BODY_SIZE,
  DISC_RADIUS,
  joinRows,
  LINE_GAP,
  LIVE,
  NAME_SIZE,
  noteRow,
  SMALL_SIZE,
  tagsRow,
  textRow,
  type Tone,
  VOID,
  WINDOW_SIZE,
} from "./round-paper-pdf-rows.js";
import type { RoundPaperAbsentStop, RoundPaperSheetStop } from "./round-paper.js";
import { windowPaperLabel } from "./round-paper.js";

/** La pastille du rang, et sous elle la case « Livré ». */
function rail(rank: number, tone: Tone, checkbox: boolean): Pick<Block, "railHeight" | "drawRail"> {
  const box = 5 * MM;
  return {
    railHeight: checkbox ? 2 * DISC_RADIUS + box + 7 * MM : 2 * DISC_RADIUS + 2 * MM,
    drawRail: (doc, y) => {
      const center = { x: LEFT + DISC_RADIUS, y: y + DISC_RADIUS };
      drawDisc(doc, String(rank), center, DISC_RADIUS, tone.ink);
      if (checkbox) {
        const top = y + 2 * DISC_RADIUS + 3 * MM;
        strokeBox(
          doc,
          { x: LEFT + DISC_RADIUS - box / 2, y: top, width: box, height: box },
          1.2,
          tone.ink,
        );
        const width = doc.font(REGULAR).fontSize(SMALL_SIZE).widthOfString("Livré");
        put(doc, "Livré", LEFT + DISC_RADIUS - width / 2, top + box + 1 * MM, {
          size: SMALL_SIZE,
          color: tone.muted,
        });
      }
    },
  };
}

/** Le nom du client à gauche, la fenêtre en gras à droite, sur la même rangée. */
function headRow(doc: Doc, stop: RoundPaperSheetStop, tone: Tone): Row {
  const window = windowPaperLabel(stop.window);
  const windowWidth = doc.font(BOLD).fontSize(WINDOW_SIZE).widthOfString(window);
  const nameWidth = CONTENT_WIDTH - windowWidth - 5 * MM;
  const nameHeight = doc
    .font(BOLD)
    .fontSize(NAME_SIZE)
    .heightOfString(stop.customerLabel, { width: nameWidth });
  return {
    height: Math.max(nameHeight, WINDOW_SIZE) + 0.8 * MM,
    draw: (d, y) => {
      put(d, stop.customerLabel, CONTENT_X, y, {
        size: NAME_SIZE,
        bold: true,
        width: nameWidth,
        color: tone.ink,
      });
      const windowX = RIGHT - windowWidth;
      put(d, window, windowX, y + 1, { size: WINDOW_SIZE, bold: true, color: tone.ink });
      if (stop.cancelled) {
        const struck = Math.min(
          d.font(BOLD).fontSize(NAME_SIZE).widthOfString(stop.customerLabel),
          nameWidth,
        );
        fillBox(d, { x: CONTENT_X, y: y + NAME_SIZE * 0.42, width: struck, height: 1.2 }, tone.ink);
      }
    },
  };
}

function cancelledBanner(): Row {
  const height = 8 * MM;
  return {
    height: height + 2 * MM,
    draw: (d, y) => {
      fillBox(d, { x: CONTENT_X, y, width: CONTENT_WIDTH, height }, "#000000");
      put(d, "ANNULÉE — NE PAS LIVRER", CONTENT_X + 3 * MM, y + 2.2 * MM, {
        size: 13,
        bold: true,
        color: "#FFFFFF",
      });
    },
  };
}

function contactRow(stop: RoundPaperSheetStop, tone: Tone): Row {
  const contact = stop.contact;
  return {
    height: BODY_SIZE + LINE_GAP + 0.6 * MM,
    draw: (d, y) => {
      if (contact === null) {
        put(d, "Aucun contact sur la commande", CONTENT_X, y, {
          size: BODY_SIZE,
          color: tone.muted,
        });
        return;
      }
      const name = `${contact.prenom} ${contact.nom} · `;
      put(d, name, CONTENT_X, y, { size: BODY_SIZE, color: tone.ink });
      const width = d.font(REGULAR).fontSize(BODY_SIZE).widthOfString(name);
      put(d, contact.telephone, CONTENT_X + width, y, {
        size: BODY_SIZE,
        bold: true,
        color: tone.ink,
      });
    },
  };
}

function stepRows(doc: Doc, stop: RoundPaperSheetStop, tone: Tone): readonly Row[] {
  if (stop.steps.length === 0) {
    return [];
  }
  const rows: Row[] = [
    gap(1 * MM),
    textRow(doc, "ÉTAPES", { size: SMALL_SIZE, bold: true, color: tone.muted }),
  ];
  stop.steps.forEach((step, index) => {
    const title = textRow(doc, `${String(index + 1)}. ${step.title}`, {
      size: BODY_SIZE,
      bold: true,
      color: tone.ink,
    });
    // Le titre et son texte forment UNE rangée : une étape ne se coupe pas.
    rows.push(
      step.body === ""
        ? title
        : joinRows([
            title,
            textRow(doc, step.body, { size: 10.5, color: tone.ink, indent: 5 * MM }),
          ]),
    );
  });
  return rows;
}

function bodyRows(doc: Doc, stop: RoundPaperSheetStop, tone: Tone): readonly Row[] {
  const address =
    stop.addressLines.length === 0
      ? [
          textRow(doc, "Aucune adresse sur la commande", {
            size: BODY_SIZE,
            bold: true,
            color: tone.ink,
          }),
        ]
      : stop.addressLines.map((line) => textRow(doc, line, { size: BODY_SIZE, color: tone.ink }));
  const bins =
    stop.binCodes.length === 0
      ? textRow(doc, "Aucun bac déclaré", { size: BODY_SIZE, color: tone.muted })
      : tagsRow(doc, stop.binCodes, {
          size: BIN_SIZE,
          bold: true,
          lineWidth: 1.4,
          color: tone.ink,
        });
  const signature = stop.signatureRequired
    ? [tagsRow(doc, ["SIGNATURE EXIGÉE"], { size: 10, bold: true, lineWidth: 2, color: tone.ink })]
    : [];
  const notes = [
    ...(stop.orderNote === "" ? [] : [noteRow(doc, "Note de commande", stop.orderNote, tone)]),
    ...(stop.addressNote === null || stop.addressNote === ""
      ? []
      : [noteRow(doc, "Note de l'adresse", stop.addressNote, tone)]),
  ];
  return [
    ...address,
    contactRow(stop, tone),
    gap(1 * MM),
    bins,
    ...signature,
    ...notes,
    ...stepRows(doc, stop, tone),
  ];
}

/** Le bloc d'un arrêt servi par la feuille de route. */
export function sheetStopBlock(doc: Doc, stop: RoundPaperSheetStop, rank: number): Block {
  const tone = stop.cancelled ? VOID : LIVE;
  const reference = textRow(doc, `Commande ${stop.reference}`, {
    size: SMALL_SIZE,
    color: tone.muted,
  });
  return {
    ...rail(rank, tone, !stop.cancelled),
    rows: [
      headRow(doc, stop, tone),
      reference,
      ...(stop.cancelled ? [cancelledBanner()] : []),
      ...bodyRows(doc, stop, tone),
    ],
    continuation: textRow(doc, `${String(rank)} · ${stop.customerLabel} (suite)`, {
      size: SMALL_SIZE,
      bold: true,
      color: MUTED,
    }),
  };
}

/** Un arrêt sans feuille : l'identifiant et le constat, rien d'inventé. */
export function absentStopBlock(doc: Doc, stop: RoundPaperAbsentStop, rank: number): Block {
  const tone = LIVE;
  return {
    ...rail(rank, tone, false),
    rows: [
      textRow(doc, `Commande ${stop.orderId}`, { size: 13, bold: true, color: tone.ink }),
      textRow(doc, "Absente de la feuille de route du jour — voir le bureau avant de partir", {
        size: BODY_SIZE,
        color: tone.ink,
      }),
    ],
    continuation: gap(0),
  };
}
