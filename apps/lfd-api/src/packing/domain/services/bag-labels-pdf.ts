import type { Buffer } from "node:buffer";

import type { PackingBagLabelsView, PackingBagLabelView } from "@lfd/contracts";

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

/** Le côté du QR de retrait : il se scanne au comptoir, à bout de bras. */
const QR_SIZE = 52 * MM;
const RANK_SIZE = 20;

/** Ce que le tirage ajoute aux étiquettes : l'instant et le logo. */
export interface BagLabelsPrint {
  readonly printedAt: Date;
  readonly logo: Buffer;
}

/**
 * **Les étiquettes des sacs d'une commande, en PDF** (2026-10-25, Hugo :
 * « imprimer l'étiquette devrait donner un beau PDF ») — A6 portrait, une
 * étiquette par feuille, dans l'ordre des sacs.
 *
 * Le contenu est celui de la page web qu'elle remplace : la référence en très
 * gros (on la lit de l'autre bout du comptoir), le client, le carré de la
 * couleur et l'acheminement du fournil, le créneau, le QR de RETRAIT de la
 * commande, et « Sac n/N » quand il y en a plusieurs. Sans QR (commande non
 * réglée, origine du back-office non configurée), la place reste blanche :
 * jamais un QR qui ne mènerait nulle part.
 *
 * `bags` est la liste À IMPRIMER — toute la commande, ou la sélection.
 */
export function renderBagLabelsPdf(
  order: PackingBagLabelsView,
  bags: readonly PackingBagLabelView[],
  print: BagLabelsPrint,
): Promise<Buffer> {
  return render(
    print.printedAt,
    `Étiquettes ${order.reference}`,
    (doc) => {
      eachLabel(doc, bags, (bag) => {
        drawBagLabel(doc, order, bag, print.logo);
      });
    },
    false,
    "portrait",
    "A6",
  );
}

function drawBagLabel(
  doc: Doc,
  order: PackingBagLabelsView,
  bag: PackingBagLabelView,
  logo: Buffer,
): void {
  drawLabelHeader(doc, logo, "Étiquette de sac");
  let y = LABEL_CONTENT_TOP;
  y = putCentered(doc, order.reference, y, { max: 40, min: 22, bold: true });
  y = putCentered(doc, order.customerLabel, y + 1 * MM, { max: 15, min: 9, bold: true });
  y = putSwatchLine(doc, order.color, order.fulfillmentLabel, y + 2 * MM, { max: 13, min: 8 });
  y = putCentered(doc, order.when, y, { max: 12, min: 8 });
  if (order.handoverUrl !== "") {
    putCenteredQr(doc, order.handoverUrl, y + 3 * MM, QR_SIZE);
  }
  if (bag.of > 1) {
    const height = RANK_SIZE * 1.6;
    putBoxedCentered(doc, `Sac ${String(bag.rank)}/${String(bag.of)}`, LABEL_BOTTOM - height, {
      size: RANK_SIZE,
    });
  }
}

/** « etiquettes-sacs-ORD-123.pdf » — la référence, celle qu'on cherche dans un dossier. */
export function bagLabelsFileName(reference: string): string {
  return `etiquettes-sacs-${reference}.pdf`;
}
