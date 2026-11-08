import type { ColumnsBlock, FreeBlock, MailLocale } from "@lfd/mail-blocks";

import { DOCUMENT_CLASSES } from "./document-theme.js";
import { htmlEscape } from "./escape.js";
import { isRenderableUrl } from "./layout-fragments.js";
import { mailStylesOf, TEXT_STYLE, type MailStyles } from "./charter-styles.js";
import { renderContentImage, textIn, type FreeBlockAudience } from "./document-image.js";
import { CALLOUT_TEXT_STYLE } from "./layout-styles.js";
import { STARTING_MAIL_CHARTER, type MailRenderCharter } from "./render-charter.js";

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

export type { FreeBlockAudience } from "./document-image.js";

/*
 * Les quatre rendus de texte reçoivent un HTML DÉJÀ échappé (`textHtml`) :
 * c'est ce qui laisse l'aperçu de l'éditeur (S5f) entourer le texte de son
 * marqueur sans toucher un octet de l'e-mail envoyé.
 */

function heading(html: string, styles: MailStyles): string {
  return `<h2 style="margin:24px 0 12px;${styles.titleText}">${html}</h2>`;
}

function paragraph(html: string): string {
  return `<p style="margin:16px 0 0;${TEXT_STYLE}">${html}</p>`;
}

function callout(
  tone: "info" | "warning",
  html: string,
  styles: MailStyles,
  radius: string,
): string {
  const colors = styles.callout[tone];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;"><tr><td class="${DOCUMENT_CLASSES.callout[tone]}" style="padding:14px 16px;background:${colors.background};border-left:4px solid ${colors.edge};border-radius:${radius};"><p style="${CALLOUT_TEXT_STYLE}">${html}</p></td></tr></table>`;
}

function button(html: string, href: string, styles: MailStyles): string {
  return isRenderableUrl(href)
    ? `<p style="margin:20px 0 4px;"><a href="${htmlEscape(href)}" style="${styles.button}">${html}</a></p>`
    : "";
}

/**
 * Le texte d'un bloc libre, échappé ; dans l'aperçu de l'éditeur (S5f,
 * `marked`), entouré d'un `<span data-free-block="<id>" data-locale="<langue>">`
 * pour que l'écran sache quel bloc et quelle langue il réécrit. Jamais dans un
 * e-mail envoyé.
 */
function textHtml(blockId: string, text: string, locale: MailLocale, marked: boolean): string {
  const escaped = htmlEscape(text);
  return marked
    ? `<span data-free-block="${htmlEscape(blockId)}" data-locale="${locale}">${escaped}</span>`
    : escaped;
}

function divider(styles: MailStyles): string {
  return `<hr style="${styles.rule}margin:24px 0;" />`;
}

/**
 * Un bloc libre hors colonnes, ou la chaîne vide s'il n'a rien à montrer.
 * `audience` : l'envoi par défaut (cf. `FreeBlockAudience`).
 * `charter` : celle de l'espace (C1) ; la charte de départ par défaut.
 */
export function renderFreeBlock(
  block: FreeBlock,
  locale: MailLocale,
  audience: FreeBlockAudience = "sent",
  charter: MailRenderCharter = STARTING_MAIL_CHARTER,
): string {
  const styles = mailStylesOf(charter);
  if (block.kind === "divider") {
    return divider(styles);
  }
  if (block.kind === "image") {
    return renderContentImage(block, locale, audience);
  }
  const text = textIn(block.kind === "button" ? block.label : block.text, locale);
  if (text === null) {
    return "";
  }
  const html = textHtml(block.id, text, locale, audience === "canvas");
  switch (block.kind) {
    case "heading":
      return heading(html, styles);
    case "paragraph":
      return paragraph(html);
    case "callout":
      return callout(block.tone, html, styles, charter.radius);
    case "button":
      return button(html, block.href, styles);
  }
}

/** L'espace entre deux colonnes, en pixels, porté par la colonne de gauche. */
const GUTTER_PX = 12;

function column(
  cell: readonly FreeBlock[],
  widthPercent: number,
  last: boolean,
  locale: MailLocale,
  audience: FreeBlockAudience,
  charter: MailRenderCharter,
): string {
  const padding = last ? "0" : `0 ${String(GUTTER_PX)}px 0 0`;
  const content = cell.map((block) => renderFreeBlock(block, locale, audience, charter)).join("");
  return `<td class="${DOCUMENT_CLASSES.column}" width="${String(widthPercent)}%" valign="top" style="width:${String(widthPercent)}%;vertical-align:top;padding:${padding};">${content}</td>`;
}

/**
 * Une ligne de colonnes : une cellule par largeur, côte à côte partout, et
 * empilées sur téléphone là où la règle `@media` est lue.
 */
export function renderColumns(
  block: ColumnsBlock,
  locale: MailLocale,
  audience: FreeBlockAudience = "sent",
  charter: MailRenderCharter = STARTING_MAIL_CHARTER,
): string {
  const cells = block.widths.map((width, index) =>
    column(
      block.cells[index] ?? [],
      width,
      index === block.widths.length - 1,
      locale,
      audience,
      charter,
    ),
  );
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;"><tr>${cells.join("")}</tr></table>`;
}
