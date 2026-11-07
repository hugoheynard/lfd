import type { ColumnsBlock, FreeBlock, Localized, MailLocale } from "@lfd/mail-blocks";

import { DOCUMENT_CLASSES } from "./document-theme.js";
import { htmlEscape } from "./escape.js";
import { isRenderableUrl } from "./layout-fragments.js";
import {
  BUTTON_STYLE,
  BRAND,
  CALLOUT_COLORS,
  CALLOUT_TEXT_STYLE,
  RULE_STYLE,
  TEXT_STYLE,
  TITLE_TEXT_STYLE,
} from "./layout-styles.js";

/**
 * **Le rendu des blocs libres** d'un document réarrangé (plan
 * `plan-editeur-par-blocs.md`, § 4, S4b) : les styles en ligne de la
 * coquille, tirés de ses constantes (`layout-styles.ts`), et les colonnes en
 * tableaux de présentation — Outlook ignore flex et grid.
 *
 * Un texte manquant dans la langue de l'envoi ne rend RIEN : aucun repli
 * inventé. La publication l'a déjà refusé (`validateMailDocumentForPublication`) ;
 * ce silence ne couvre qu'un document qui n'aurait pas été publié.
 */

/** Le texte d'un bloc dans la langue de l'envoi, ou `null` s'il manque. */
function textIn(text: Localized<string>, locale: MailLocale): string | null {
  const value = text[locale];
  return value === undefined || value.trim() === "" ? null : value;
}

function heading(text: string): string {
  return `<h2 style="margin:24px 0 12px;${TITLE_TEXT_STYLE}">${htmlEscape(text)}</h2>`;
}

function paragraph(text: string): string {
  return `<p style="margin:16px 0 0;${TEXT_STYLE}">${htmlEscape(text)}</p>`;
}

function callout(tone: "info" | "warning", text: string): string {
  const colors = CALLOUT_COLORS[tone];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;"><tr><td class="${DOCUMENT_CLASSES.callout[tone]}" style="padding:14px 16px;background:${colors.background};border-left:4px solid ${colors.edge};border-radius:${BRAND.radius};"><p style="${CALLOUT_TEXT_STYLE}">${htmlEscape(text)}</p></td></tr></table>`;
}

function button(label: string, href: string): string {
  return isRenderableUrl(href)
    ? `<p style="margin:20px 0 4px;"><a href="${htmlEscape(href)}" style="${BUTTON_STYLE}">${htmlEscape(label)}</a></p>`
    : "";
}

const DIVIDER = `<hr style="${RULE_STYLE}margin:24px 0;" />`;

/** Un bloc libre hors colonnes, ou la chaîne vide s'il n'a rien à montrer. */
export function renderFreeBlock(block: FreeBlock, locale: MailLocale): string {
  if (block.kind === "divider") {
    return DIVIDER;
  }
  const text = textIn(block.kind === "button" ? block.label : block.text, locale);
  if (text === null) {
    return "";
  }
  switch (block.kind) {
    case "heading":
      return heading(text);
    case "paragraph":
      return paragraph(text);
    case "callout":
      return callout(block.tone, text);
    case "button":
      return button(text, block.href);
  }
}

/** L'espace entre deux colonnes, en pixels, porté par la colonne de gauche. */
const GUTTER_PX = 12;

function column(
  cell: readonly FreeBlock[],
  widthPercent: number,
  last: boolean,
  locale: MailLocale,
): string {
  const padding = last ? "0" : `0 ${String(GUTTER_PX)}px 0 0`;
  const content = cell.map((block) => renderFreeBlock(block, locale)).join("");
  return `<td class="${DOCUMENT_CLASSES.column}" width="${String(widthPercent)}%" valign="top" style="width:${String(widthPercent)}%;vertical-align:top;padding:${padding};">${content}</td>`;
}

/**
 * Une ligne de colonnes : une cellule par largeur, côte à côte partout, et
 * empilées sur téléphone là où la règle `@media` est lue.
 */
export function renderColumns(block: ColumnsBlock, locale: MailLocale): string {
  const cells = block.widths.map((width, index) =>
    column(block.cells[index] ?? [], width, index === block.widths.length - 1, locale),
  );
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;"><tr>${cells.join("")}</tr></table>`;
}
