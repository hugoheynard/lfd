import type { Doc } from "../../../platform/pdf/paper-pdf-kit.js";
import type { CountColorShare } from "./count-color-shares.js";

/** La teinte de la part neutre : commandes sans couleur, réassorts. */
export const NEUTRAL_SHARE = "#bdbdbd";

/**
 * **Le camembert du jour** (Hugo, 2026-10-22) : une part par couleur de
 * destination, proportionnelle à sa quantité, cerclé de noir. Une seule part
 * fait un disque plein — il dit la même chose. Aucun mot. Rien sans part.
 */
export function drawCountPie(
  doc: Doc,
  shares: readonly CountColorShare[],
  center: { readonly x: number; readonly y: number },
  radius: number,
): void {
  const total = shares.reduce((sum, share) => sum + share.quantity, 0);
  if (total <= 0) {
    return;
  }
  if (shares.length === 1) {
    doc
      .save()
      .circle(center.x, center.y, radius)
      .fill(shares[0]?.color ?? NEUTRAL_SHARE)
      .restore();
  } else {
    let start = -Math.PI / 2;
    for (const share of shares) {
      const sweep = (2 * Math.PI * share.quantity) / total;
      doc
        .save()
        .path(slicePath(center, radius, start, start + sweep))
        .fill(share.color ?? NEUTRAL_SHARE)
        .restore();
      start += sweep;
    }
  }
  doc.save().lineWidth(0.6).circle(center.x, center.y, radius).stroke().restore();
}

/** La part en SVG : du centre au bord, l'arc, retour au centre. */
function slicePath(
  center: { readonly x: number; readonly y: number },
  radius: number,
  from: number,
  to: number,
): string {
  const point = (angle: number): string =>
    `${(center.x + radius * Math.cos(angle)).toFixed(3)} ${(center.y + radius * Math.sin(angle)).toFixed(3)}`;
  const large = to - from > Math.PI ? 1 : 0;
  return `M ${center.x.toFixed(3)} ${center.y.toFixed(3)} L ${point(from)} A ${radius.toFixed(3)} ${radius.toFixed(3)} 0 ${String(large)} 1 ${point(to)} Z`;
}
