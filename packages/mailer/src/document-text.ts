import type {
  ColumnsBlock,
  FreeBlock,
  ImageBlock,
  MailDocument,
  MailLocale,
} from "@lfd/mail-blocks";

import { textIn } from "./document-image.js";
import { isRenderableUrl } from "./layout-fragments.js";
import type { LayoutInput } from "./layout-input.js";
import { LAYOUT_SECTIONS, type LayoutSectionId } from "./layout-sections.js";
import { layoutTextFragments, layoutTextFrame, renderLayoutText } from "./layout-text.js";
import {
  isRearrangedDocument,
  sectionsOfBlock,
  type MailDocumentRenderOptions,
} from "./render-document.js";
import { joinTextBlocks, linkLine, TEXT_RULE, underlined, wrapText } from "./text-format.js";

/**
 * **La version texte d'un document d'e-mail** — le pendant de
 * `renderMailDocument` : les blocs du modèle par les sections texte de la
 * coquille, les blocs libres dans la langue de l'envoi, et les colonnes
 * EMPILÉES dans l'ordre de lecture, comme sur un téléphone.
 *
 * Un texte manquant dans la langue de l'envoi ne rend rien, comme dans le
 * HTML : aucun repli inventé.
 */

/**
 * Une image : son texte de remplacement (et son lien, s'il y en a un). Une
 * image décorative ne dit rien ; une image sans adresse non plus — le HTML
 * ne la montre pas.
 */
function imageText(block: ImageBlock, locale: MailLocale): string {
  const src = block.copySrc ?? block.src;
  if (block.decorative === true || src === "" || !isRenderableUrl(src)) {
    return "";
  }
  const alt = textIn(block.alt, locale);
  if (alt === null) {
    return "";
  }
  return block.href !== undefined && isRenderableUrl(block.href)
    ? linkLine(alt, block.href)
    : wrapText(alt);
}

/** Un bloc libre hors colonnes, en texte ; la chaîne vide s'il n'a rien à dire. */
export function renderFreeBlockText(block: FreeBlock, locale: MailLocale): string {
  if (block.kind === "divider") {
    return TEXT_RULE;
  }
  if (block.kind === "image") {
    return imageText(block, locale);
  }
  const text = textIn(block.kind === "button" ? block.label : block.text, locale);
  if (text === null) {
    return "";
  }
  switch (block.kind) {
    case "heading":
      return underlined(text, "-");
    case "paragraph":
    case "callout":
      return wrapText(text);
    case "button":
      return isRenderableUrl(block.href) ? linkLine(text, block.href) : "";
  }
}

/** Des colonnes, empilées : chaque cellule dans l'ordre, chaque bloc à la suite. */
export function renderColumnsText(block: ColumnsBlock, locale: MailLocale): string {
  return joinTextBlocks(block.cells.flat().map((inner) => renderFreeBlockText(inner, locale)));
}

/** Le corps du document, bloc après bloc, puis les sections qu'il ne nomme pas. */
function documentBody(
  input: LayoutInput,
  document: MailDocument,
  options: MailDocumentRenderOptions,
): readonly string[] {
  const fragments = layoutTextFragments(input);
  const named = new Set<LayoutSectionId>();
  const parts: string[] = [];
  for (const block of document.blocks) {
    if (block.kind === "model") {
      for (const id of sectionsOfBlock(block.section, options.declaredSections)) {
        if (!named.has(id)) {
          named.add(id);
          parts.push(fragments[id]);
        }
      }
    } else if (block.kind === "columns") {
      parts.push(renderColumnsText(block, options.locale));
    } else {
      parts.push(renderFreeBlockText(block, options.locale));
    }
  }
  // Comme le HTML : ce que le modèle ne déclare pas suit, dans l'ordre par défaut.
  const rest = LAYOUT_SECTIONS.filter((id) => !named.has(id));
  return [...parts, ...rest.map((id) => fragments[id])];
}

/**
 * L'ordre d'un document fait des seuls blocs du modèle, comme le HTML le
 * rend (`renderModelOnly`) : l'ordre du code rend l'ordre par défaut, tout
 * autre ordre se rend comme un ordre publié de sections.
 */
function modelOnlyOrder(
  document: MailDocument,
  options: MailDocumentRenderOptions,
): readonly LayoutSectionId[] {
  const order = [
    ...new Set(
      document.blocks.flatMap((block) =>
        block.kind === "model" ? sectionsOfBlock(block.section, options.declaredSections) : [],
      ),
    ),
  ];
  const declared = options.declaredSections;
  const same = order.length === declared.length && order.every((id, i) => declared[i] === id);
  return same ? LAYOUT_SECTIONS : order;
}

/**
 * **La version texte d'un document** : sans bloc libre, le document dit un
 * ordre de sections, et son texte suit cet ordre ; avec, chaque bloc à sa place.
 */
export function renderMailDocumentText(
  input: LayoutInput,
  document: MailDocument,
  options: MailDocumentRenderOptions,
): string {
  if (!isRearrangedDocument(document)) {
    return renderLayoutText({ ...input, sections: modelOnlyOrder(document, options) });
  }
  return layoutTextFrame(input, documentBody(input, document, options));
}
