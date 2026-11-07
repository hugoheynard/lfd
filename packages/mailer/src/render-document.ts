import {
  modelSectionOfLayoutSection,
  type MailBlock,
  type MailCharter,
  type MailDocument,
  type MailLocale,
  type ModelSectionId,
} from "@lfd/mail-blocks";

import { renderColumns, renderFreeBlock } from "./document-blocks.js";
import { documentFrameTheme } from "./document-theme.js";
import { renderLayout, renderLayoutFrame } from "./html.js";
import { layoutFragments } from "./layout-fragments.js";
import type { LayoutInput } from "./layout-input.js";
import {
  joinParts,
  LAYOUT_SECTIONS,
  type LayoutPart,
  type LayoutSectionId,
} from "./layout-sections.js";

/** Ce que le rendu d'un document lit de l'envoi, en plus des données de la coquille. */
export interface MailDocumentRenderOptions {
  /** La charte du modèle — sa variante sombre, pour un document réarrangé. */
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

function partsOf(
  input: LayoutInput,
  document: MailDocument,
  options: MailDocumentRenderOptions,
): readonly LayoutPart[] {
  const fragments = layoutFragments(input);
  const named = new Set<LayoutSectionId>();
  const parts: LayoutPart[] = [];
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
    const html =
      block.kind === "columns"
        ? renderColumns(block, options.locale)
        : renderFreeBlock(block, options.locale);
    if (html !== "") {
      parts.push({ kind: "free", id: block.id, html });
    }
  }
  // Les sections que le modèle ne déclare pas suivent, dans l'ordre par
  // défaut, comme `effectiveSectionOrder` les range : rien ne se perd.
  const rest = LAYOUT_SECTIONS.filter((id) => !named.has(id));
  return [
    ...parts,
    ...rest.map((id): LayoutPart => ({ kind: "section", id, html: fragments[id] })),
  ];
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
  const content = joinParts(partsOf(input, document, options), input.markSections === true);
  return renderLayoutFrame(
    input,
    content,
    documentFrameTheme(options.charter, options.locale, input.brandFontUrl),
  );
}
