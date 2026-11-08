import type { MailBlock, MailDocument, MailLocale } from "@lfd/mail-blocks";

import { renderColumns, renderFreeBlock } from "./document-blocks.js";
import { renderLayoutHeader } from "./layout-header.js";
import { charterFooterOf, charterOf, layoutFragments, supportOf } from "./layout-fragments.js";
import type { LayoutInput } from "./layout-input.js";
import type { LayoutSectionId } from "./layout-sections.js";
import type { MailRenderCharter } from "./render-charter.js";
import { sectionsOfBlock, type MailDocumentRenderOptions } from "./render-document.js";

/** Le rendu d'UN bloc du document, pour l'aperçu de l'éditeur. */
export interface MailDocumentBlockFragment {
  readonly blockId: string;
  /** Le fragment du bloc ; vide quand il n'a rien à montrer (une image pas encore choisie). */
  readonly html: string;
}

/** Un document découpé : les deux cadres, puis un fragment par bloc, dans l'ordre du document. */
export interface MailDocumentParts {
  /** Le bandeau (logo, enseigne, surtitre) dans sa table, ou vide. */
  readonly header: string;
  /** Le pied commun de la charte publiée, puis le recours sous son filet, dans leur table ; ou vide. */
  readonly footer: string;
  readonly blocks: readonly MailDocumentBlockFragment[];
}

/** Le séparateur de `joinParts` : un bouton et son lien se suivent comme dans l'e-mail. */
const SECTION_SEPARATOR = "\n        ";

/** Une ligne de cadre (`<tr>…</tr>`) n'a de sens que dans une table : on la lui donne. */
function framed(row: string): string {
  return row === ""
    ? ""
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${row}</table>`;
}

function blockHtml(
  block: MailBlock,
  fragments: Readonly<Record<LayoutSectionId, string>>,
  declared: readonly LayoutSectionId[],
  locale: MailLocale,
  charter: MailRenderCharter,
): string {
  switch (block.kind) {
    case "model":
      return sectionsOfBlock(block.section, declared)
        .map((id) => fragments[id])
        .filter((html) => html !== "")
        .join(SECTION_SEPARATOR);
    case "columns":
      return renderColumns(block, locale, "canvas", charter);
    default:
      return renderFreeBlock(block, locale, "canvas", charter);
  }
}

/**
 * **Le document découpé en blocs** (plan `plan-editeur-par-blocs.md`, § 22,
 * S5f) : le canevas de l'éditeur montre l'e-mail bloc par bloc, et chaque
 * bloc y est la VRAIE portion d'e-mail — les mêmes fragments que
 * `renderMailDocument` assemble (`layoutFragments`, `renderFreeBlock`,
 * `renderColumns`), jamais une copie de leurs styles.
 *
 * Le texte des blocs libres y est marqué (`data-free-block`, `data-locale`) :
 * cette fonction ne sert QUE l'aperçu de l'éditeur. L'envoi passe par
 * `renderMailDocument` ou `renderLayout`, qui ne marquent rien.
 */
export function renderMailDocumentParts(
  input: LayoutInput,
  document: MailDocument,
  options: MailDocumentRenderOptions,
): MailDocumentParts {
  const fragments = layoutFragments(input);
  return {
    header: framed(renderLayoutHeader(input, charterOf(input))),
    // Le pied commun de la charte (C1, § 25) puis le recours, comme la coquille.
    footer: framed(`${charterFooterOf(input)}${supportOf(input)}`),
    blocks: document.blocks.map((block) => ({
      blockId: block.id,
      html: blockHtml(block, fragments, options.declaredSections, options.locale, charterOf(input)),
    })),
  };
}
