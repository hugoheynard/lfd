import type { Buffer } from "node:buffer";

import {
  drawLabelHeader,
  eachLabel,
  LABEL_BOTTOM,
  LABEL_CONTENT_TOP,
  putBoxedCentered,
  putCentered,
  putCenteredQr,
  putSwatchLine,
} from "../../../platform/pdf/label-pdf-kit.js";
import { type Doc, MM, render } from "../../../platform/pdf/paper-pdf-kit.js";

/** Le côté du QR du bac : il se scanne au chargement, bac posé au sol. */
const QR_SIZE = 40 * MM;
const CODE_SIZE = 24;
const CODE_SPACING = 3;

/** Une étiquette de bac, tout composé : le rendu ne fait que poser. */
export interface BinLabelSheet {
  readonly reference: string;
  readonly customerLabel: string;
  /** « bac 1 / 2 ». */
  readonly indexLabel: string;
  /** « Bac M · ½ gauche ». */
  readonly kind: string;
  /** « partagé avec ORD-12 · Le Refuge », ou `null`. */
  readonly sharedWith: string | null;
  /** « 2 sacs dedans », ou `null`. */
  readonly innerBags: string | null;
  /** Le code court, tapé quand le QR est illisible. */
  readonly code: string;
  /** L'adresse du bac au back-office ; vide : pas de QR. */
  readonly qrUrl: string;
}

/** Les étiquettes d'un propriétaire de bacs — une commande, ou un transfert. */
export interface BinLabelsPaper {
  /** Le titre du document : la référence de la commande, ou « → <site> ». */
  readonly title: string;
  /** « Camion 1 · passage 2 » et le rang de l'arrêt, ou `null` hors tournée. */
  readonly round: { readonly title: string; readonly stop: number } | null;
  /** `#rrggbb`, ou `null` : aucun carré, jamais une teinte devinée. */
  readonly color: string | null;
  readonly labels: readonly BinLabelSheet[];
  readonly printedAt: Date;
}

/**
 * **Les étiquettes des bacs, en PDF** (2026-10-25, Hugo : « imprimer
 * l'étiquette devrait donner un beau PDF, là on est sur une capture
 * d'écran ») — A6 portrait, une étiquette par feuille, dans le style de
 * l'étiquette de sac (`label-pdf-kit.ts`).
 *
 * Le contenu est celui de la page web qu'elle remplace (L4-C16, lot PC3) :
 * la tournée et le rang d'arrêt EN TÊTE et en très gros (le bac se pose dans
 * la zone de sa tournée, au rang de son arrêt), la référence et le client, le
 * rang du bac, son type et sa moitié, « partagé avec … », les sacs dedans, le
 * QR du bac et son code court. Le carré de la couleur de la commande précède
 * la référence.
 */
export function renderBinLabelsPdf(paper: BinLabelsPaper, logo: Buffer): Promise<Buffer> {
  return render(
    paper.printedAt,
    `Étiquettes ${paper.title}`,
    (doc) => {
      eachLabel(doc, paper.labels, (label) => {
        drawBinLabel(doc, paper, label, logo);
      });
    },
    false,
    "portrait",
    "A6",
  );
}

function drawBinLabel(doc: Doc, paper: BinLabelsPaper, label: BinLabelSheet, logo: Buffer): void {
  drawLabelHeader(doc, logo, "Étiquette de bac");
  let y = LABEL_CONTENT_TOP;
  if (paper.round !== null) {
    y = putCentered(doc, paper.round.title, y, { max: 24, min: 14, bold: true });
    y = putCentered(doc, `Arrêt ${String(paper.round.stop)}`, y, { max: 30, min: 18, bold: true });
    y += 1 * MM;
  }
  y = putSwatchLine(doc, paper.color, label.reference, y, { max: 22, min: 12 });
  y = putCentered(doc, label.customerLabel, y, { max: 13, min: 8, bold: true });
  y = putCentered(doc, `${label.indexLabel} · ${label.kind}`, y + 1 * MM, { max: 12, min: 8 });
  for (const extra of [label.sharedWith, label.innerBags]) {
    if (extra !== null) {
      y = putCentered(doc, extra, y, { max: 11, min: 7 });
    }
  }
  const codeHeight = CODE_SIZE * 1.6;
  const codeTop = LABEL_BOTTOM - codeHeight;
  if (label.qrUrl !== "") {
    const size = Math.min(QR_SIZE, codeTop - y - 4 * MM);
    putCenteredQr(doc, label.qrUrl, codeTop - size - 3 * MM, size);
  }
  putBoxedCentered(doc, label.code, codeTop, { size: CODE_SIZE, spacing: CODE_SPACING });
}

/** « etiquettes-bacs-ORD-123.pdf ». */
export function binLabelsFileName(title: string): string {
  return `etiquettes-bacs-${title}.pdf`;
}
