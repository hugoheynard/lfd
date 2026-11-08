import type { ImageBlock, MailLocale } from "@lfd/mail-blocks";

import { BODY_TOP_PADDING_PX, IMAGE_GAP_PX } from "./card-geometry.js";
import type { FreeBlockAudience } from "./document-image.js";
import {
  fullWidthImageElement,
  fullWidthImageRow,
  type FullWidthPlacement,
} from "./full-width-image.js";
import { bodyRow } from "./html.js";
import { joinParts, type LayoutPart } from "./layout-sections.js";

/**
 * **Les lignes de la carte d'un document** qui porte des images pleine
 * largeur (Hugo, 2026-11-08). Le corps est COUPÉ à chaque image : le contenu
 * au-dessus dans sa cellule à marges, l'image dans sa propre ligne bord à
 * bord, le contenu en dessous dans une nouvelle cellule à marges.
 *
 * Pourquoi couper plutôt que sortir l'image de sa cellule par des marges
 * négatives : Outlook pour Windows (Word) et Gmail ignorent les marges
 * négatives, et une cellule de tableau ne déborde jamais de sa table. Des
 * lignes sœurs dans la table de la carte sont la seule structure que toutes
 * les messageries rendent pareil.
 */

/** Un morceau du document dans la carte : du corps, ou une image pleine largeur. */
export type CardPiece =
  LayoutPart | { readonly kind: "full-image"; readonly id: string; readonly block: ImageBlock };

/** Ce que la coupe lit de l'envoi et de la carte. */
export interface CardContext {
  readonly locale: MailLocale;
  readonly audience: FreeBlockAudience;
  /** L'arrondi de la carte (`charter.radius`). */
  readonly radius: string;
  /** La carte a un bandeau au-dessus du corps. */
  readonly hasHeader: boolean;
  /** La carte a un pied (charte) ou un recours sous le corps. */
  readonly hasFooter: boolean;
  readonly markSections: boolean;
}

const NEUTRAL: FullWidthPlacement = { top: "content", bottom: "content" };

/** Un morceau qui se voit : du corps non vide, ou une image qui a de quoi se rendre. */
function visible(piece: CardPiece, context: CardContext): boolean {
  return piece.kind === "full-image"
    ? fullWidthImageElement(piece.block, context.locale, context.audience, NEUTRAL, "") !== ""
    : piece.html !== "";
}

/**
 * La place de chaque image pleine largeur visible : ce qui la touche en haut
 * (le bandeau, le bord de la carte, ou du contenu) et en bas (le pied, le
 * bord de la carte, ou du contenu).
 */
export function fullWidthPlacements(
  pieces: readonly CardPiece[],
  context: CardContext,
): ReadonlyMap<string, FullWidthPlacement> {
  const shown = pieces.map((piece) => visible(piece, context));
  const placements = new Map<string, FullWidthPlacement>();
  pieces.forEach((piece, index) => {
    if (piece.kind !== "full-image" || shown[index] !== true) {
      return;
    }
    const before = shown.slice(0, index).includes(true);
    const after = shown.slice(index + 1).includes(true);
    placements.set(piece.id, {
      top: before ? "content" : context.hasHeader ? "header" : "card-edge",
      bottom: after ? "content" : context.hasFooter ? "footer" : "card-edge",
    });
  });
  return placements;
}

/** Les lignes `<tr>` du corps de la carte, coupé à chaque image pleine largeur. */
export function renderCardRows(pieces: readonly CardPiece[], context: CardContext): string {
  const placements = fullWidthPlacements(pieces, context);
  const rows: string[] = [];
  let segment: LayoutPart[] = [];
  const flush = (): void => {
    if (segment.some((part) => part.html !== "")) {
      const top = rows.length === 0 ? BODY_TOP_PADDING_PX : IMAGE_GAP_PX;
      rows.push(bodyRow(joinParts(segment, context.markSections), top));
    }
    segment = [];
  };
  for (const piece of pieces) {
    if (piece.kind !== "full-image") {
      segment.push(piece);
      continue;
    }
    const placement = placements.get(piece.id);
    if (placement === undefined) {
      continue;
    }
    flush();
    const element = fullWidthImageElement(
      piece.block,
      context.locale,
      context.audience,
      placement,
      context.radius,
    );
    rows.push(
      fullWidthImageRow(piece.id, element, placement, context.radius, context.markSections),
    );
  }
  flush();
  return rows.join("\n      ");
}
