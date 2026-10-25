import type { ProductionOrderSnapshot } from "../entities/production-day.js";
import { fulfillmentLabelOf } from "./fulfillment-method-label.js";
import { drawOrderSwatch, SWATCH_SIZE } from "./order-color-swatch.js";
import { BOLD, MM, putRight, type Doc } from "../../../platform/pdf/paper-pdf-kit.js";

const GAP = 2 * MM;

/**
 * **L'acheminement d'une commande, cadré à droite** — « Retrait Village ·
 * pro », précédé du carré de la couleur de la commande (Hugo, 2026-10-25) :
 * la couleur que les écrans et le bon de commande posent déjà, lue au tirage
 * par `OrderPrintColorsReader`. Sans couleur, le libellé seul.
 */
export function drawRouting(
  doc: Doc,
  order: Pick<
    ProductionOrderSnapshot,
    "fulfillmentMethod" | "clientele" | "destination" | "sheetDetails"
  >,
  color: string | null,
  at: { readonly right: number; readonly y: number; readonly size: number },
): void {
  const label = fulfillmentLabelOf(order);
  const width = doc.font(BOLD).fontSize(at.size).widthOfString(label);
  drawOrderSwatch(doc, color, at.right - width - GAP - SWATCH_SIZE, at.y - 0.6 * MM);
  putRight(doc, label, at.right, at.y, at.size, true);
}
