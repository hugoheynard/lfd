import type { ProductionLineSnapshot } from "../../../../day/index.js";
import { MM, put, putCaps, type Doc } from "../../../../../platform/pdf/paper-pdf-kit.js";
import { isMadeToOrder, MADE_TO_ORDER_MENTION } from "./made-to-order.js";
import { optionMentionOf } from "./option-mention.js";

/** Ce que les mentions lisent d'une ligne figée. */
type MentionedLine = Pick<
  ProductionLineSnapshot,
  "quantity" | "saleUnit" | "madeToOrder" | "options"
>;

/** La hauteur de « SUR MESURE » sous le nom. */
const MADE_TO_ORDER_HEIGHT = 4 * MM;
/** La hauteur de la mention des options sous le nom. */
const OPTIONS_HEIGHT = 5 * MM;

/**
 * **Ce qu'une ligne de commande dit sous son nom**, sur la fiche d'atelier et
 * le bon du dossier du jour : « SUR MESURE » (`plan-sur-mesure-partout.md`,
 * M3), puis les options (« Tranchage : 2 × tranché »,
 * `plan-options-de-commande.md`, § 3.4). Les deux papiers les posent au même
 * endroit, par cette seule fonction. Rend la hauteur ajoutée ; `0` sans
 * mention — la ligne se rend alors au point près comme avant.
 */
export function drawLineMentions(
  doc: Doc,
  line: MentionedLine,
  at: { readonly x: number; readonly y: number; readonly width: number },
): number {
  let extra = 0;
  if (isMadeToOrder(line)) {
    putCaps(doc, MADE_TO_ORDER_MENTION, at.x, at.y + 6 * MM);
    extra += MADE_TO_ORDER_HEIGHT;
  }
  const mention = optionMentionOf(line, line.options ?? []);
  if (mention !== "") {
    put(doc, mention, at.x, at.y + 6 * MM + extra, { size: 11, width: at.width });
    extra += OPTIONS_HEIGHT;
  }
  return extra;
}

/** La hauteur que {@link drawLineMentions} ajoutera, pour réserver la place avant de dessiner. */
export function lineMentionsHeight(line: MentionedLine): number {
  return (
    (isMadeToOrder(line) ? MADE_TO_ORDER_HEIGHT : 0) +
    (optionMentionOf(line, line.options ?? []) === "" ? 0 : OPTIONS_HEIGHT)
  );
}
