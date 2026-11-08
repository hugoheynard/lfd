import {
  modelSectionOfLayoutSection,
  type MailBlock,
  type MailCharter,
  type MailDocument,
  type MailLocale,
  type ModelSectionId,
} from "@lfd/mail-blocks";

import { renderCardRows, type CardContext, type CardPiece } from "./card-rows.js";
import { renderColumns, renderFreeBlock, type FreeBlockAudience } from "./document-blocks.js";
import { charterFrameTheme } from "./document-theme.js";
import { isFullWidthImage } from "./full-width-image.js";
import { renderLayout, renderLayoutFrame, renderLayoutFrameRows } from "./html.js";
import { renderLayoutHeader } from "./layout-header.js";
import {
  charterFooterOf,
  charterOf,
  layoutFragments,
  supportOf,
  unsubscribeOf,
} from "./layout-fragments.js";
import type { LayoutInput } from "./layout-input.js";
import {
  joinParts,
  LAYOUT_SECTIONS,
  type LayoutPart,
  type LayoutSectionId,
} from "./layout-sections.js";

/** Ce que le rendu d'un document lit de l'envoi, en plus des données de la coquille. */
export interface MailDocumentRenderOptions {
  /**
   * La charte du modèle. Depuis C1 (§ 25), la variante sombre vient de la
   * charte de l'espace posée sur l'entrée (`LayoutInput.charter`) ; ce champ
   * reste lu par les appelants, plus par le rendu.
   */
  readonly charter: MailCharter;
  /** La langue de l'envoi : celle des textes des blocs libres. */
  readonly locale: MailLocale;
  /**
   * Les sections de la coquille que le modèle déclare, dans l'ordre du code
   * (`MAIL_LAYOUTS` côté API). C'est par elles qu'un bloc du modèle redevient
   * des sections — `cta` en `cta` puis `secondaryLink` si le modèle déclare
   * le lien —, et qu'on reconnaît l'ordre du code.
   */
  readonly declaredSections: readonly LayoutSectionId[];
  /**
   * L'aperçu fidèle d'un document seulement : recadre à l'affichage une image
   * cadrée qui n'a pas encore de copie publiée (un brouillon). Absent pour
   * tout envoi — l'e-mail envoyé ne change pas d'un octet.
   */
  readonly framePreviewImages?: boolean;
}

/**
 * Un document réarrangé porte au moins un bloc libre. Un document fait des
 * seuls blocs du modèle dit un ordre de sections, ce que la coquille sait
 * déjà rendre : il se rend par elle, sans `<head>` neuf (§ 4, garantie).
 */
export function isRearrangedDocument(document: MailDocument): boolean {
  return document.blocks.some((block) => block.kind !== "model");
}

/** Les sections de la coquille qu'un bloc du modèle porte, déclarées seulement. */
export function sectionsOfBlock(
  section: ModelSectionId,
  declared: readonly LayoutSectionId[],
): readonly LayoutSectionId[] {
  return declared.filter((id) => modelSectionOfLayoutSection(id) === section);
}

/** L'ordre des sections que les blocs du modèle disent, doublons écartés. */
function sectionOrderOf(
  blocks: readonly MailBlock[],
  declared: readonly LayoutSectionId[],
): readonly LayoutSectionId[] {
  const order = blocks.flatMap((block) =>
    block.kind === "model" ? sectionsOfBlock(block.section, declared) : [],
  );
  return [...new Set(order)];
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => right[index] === id);
}

/**
 * Le document fait des seuls blocs du modèle : l'ordre du code rend la
 * coquille sans ordre (l'ordre par défaut), tout autre ordre la rend comme un
 * ordre publié de sections — les deux, à l'octet, comme aujourd'hui.
 */
function renderModelOnly(
  input: LayoutInput,
  document: MailDocument,
  declared: readonly LayoutSectionId[],
): string {
  const order = sectionOrderOf(document.blocks, declared);
  return renderLayout({ ...input, sections: sameOrder(order, declared) ? LAYOUT_SECTIONS : order });
}

/**
 * Les morceaux du document dans l'ordre de la carte : les sections et les
 * blocs libres rendus, et chaque image pleine largeur laissée en bloc — elle
 * se rend hors du corps (`card-rows.ts`), à sa place.
 */
export function cardPiecesOf(
  input: LayoutInput,
  document: MailDocument,
  options: MailDocumentRenderOptions,
  audience: FreeBlockAudience,
): readonly CardPiece[] {
  const fragments = layoutFragments(input);
  const named = new Set<LayoutSectionId>();
  const parts: CardPiece[] = [];
  for (const block of document.blocks) {
    if (block.kind === "model") {
      for (const id of sectionsOfBlock(block.section, options.declaredSections)) {
        if (!named.has(id)) {
          named.add(id);
          parts.push({ kind: "section", id, html: fragments[id] });
        }
      }
      continue;
    }
    if (isFullWidthImage(block)) {
      parts.push({ kind: "full-image", id: block.id, block });
      continue;
    }
    const html =
      block.kind === "columns"
        ? renderColumns(block, options.locale, audience, charterOf(input))
        : renderFreeBlock(block, options.locale, audience, charterOf(input));
    if (html !== "") {
      parts.push({ kind: "free", id: block.id, html });
    }
  }
  // Les sections que le modèle ne déclare pas suivent, dans l'ordre par
  // défaut, comme `effectiveSectionOrder` les range : rien ne se perd.
  const rest = LAYOUT_SECTIONS.filter((id) => !named.has(id));
  return [...parts, ...rest.map((id): CardPiece => ({ kind: "section", id, html: fragments[id] }))];
}

/** Ce que la coupe du corps lit de l'envoi : le bandeau, le pied, l'arrondi. */
export function cardContextOf(
  input: LayoutInput,
  locale: MailLocale,
  audience: FreeBlockAudience,
): CardContext {
  const charter = charterOf(input);
  return {
    locale,
    audience,
    radius: charter.radius,
    hasHeader: renderLayoutHeader(input, charter) !== "",
    hasFooter: `${charterFooterOf(input)}${unsubscribeOf(input)}${supportOf(input)}` !== "",
    markSections: input.markSections === true,
  };
}

/**
 * **Le rendu d'un document d'e-mail** (plan `plan-editeur-par-blocs.md`,
 * § 4, S4b).
 *
 * - Sans bloc libre, c'est la coquille : le document de départ rend les mêmes
 *   octets qu'aujourd'hui, ordre publié compris (tant que le bouton et son
 *   lien secondaire s'y suivent — un document ne sait pas les séparer).
 * - Avec des blocs libres, les blocs du modèle se rendent avec les fragments
 *   de la coquille, les blocs libres avec ses constantes de style, et le cadre
 *   gagne un `<head>` : variante sombre de la charte, empilement des colonnes.
 *
 * - Une image pleine largeur (Hugo, 2026-11-08) coupe le corps : elle se rend
 *   bord à bord dans sa propre ligne de la carte (`card-rows.ts`). Sans elle,
 *   le corps reste une seule cellule, à l'octet comme avant.
 *
 * L'ordre de `input.sections` est ignoré : c'est le document qui ordonne.
 */
export function renderMailDocument(
  input: LayoutInput,
  document: MailDocument,
  options: MailDocumentRenderOptions,
): string {
  if (!isRearrangedDocument(document)) {
    return renderModelOnly(input, document, options.declaredSections);
  }
  const audience = options.framePreviewImages === true ? "preview" : "sent";
  const pieces = cardPiecesOf(input, document, options, audience);
  const theme = charterFrameTheme(charterOf(input), options.locale, input);
  const parts = pieces.filter((piece): piece is LayoutPart => piece.kind !== "full-image");
  if (parts.length === pieces.length) {
    return renderLayoutFrame(input, joinParts(parts, input.markSections === true), theme);
  }
  return renderLayoutFrameRows(
    input,
    renderCardRows(pieces, cardContextOf(input, options.locale, audience)),
    theme,
  );
}
