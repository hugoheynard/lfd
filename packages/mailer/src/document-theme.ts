import type { MailCharter } from "@lfd/mail-blocks";

import type { LayoutFrameTheme } from "./html.js";
import type { LayoutInput } from "./layout-input.js";
import { charterFontFaceRule } from "./layout-header.js";
import { STARTING_MAIL_CHARTER, type MailRenderCharter } from "./render-charter.js";

/**
 * **La variante sombre** (plan `plan-editeur-par-blocs.md`, § 4, S4b ; § 25,
 * C1) — émise pour un document réarrangé, et, depuis C1, pour tout e-mail
 * d'un espace dont la charte est publiée. Jamais pour la charte de départ
 * hors document réarrangé : un `<style>` dans le `<head>` changerait les
 * octets que la coquille rend sans `<head>` (sauf la police).
 */
export interface DarkPalette {
  readonly page: string;
  readonly card: string;
  readonly ink: string;
  readonly border: string;
  readonly calloutInfo: string;
  readonly calloutWarning: string;
}

/** Les fonds sombres des encadrés : la charte ne les règle pas, ils suivent la suite. */
const DARK_CALLOUTS = { calloutInfo: "#1a2747", calloutWarning: "#3a2a12" } as const;

function darkPaletteOf(charter: MailRenderCharter): DarkPalette {
  const dark = charter.dark;
  return {
    page: dark.page,
    card: dark.card,
    ink: dark.text,
    border: dark.border,
    ...DARK_CALLOUTS,
  };
}

/**
 * La variante sombre de chaque charte de modèle AU DÉPART — la même pour les
 * trois. Gardée pour ses lecteurs ; le rendu lit la charte de l'envoi.
 */
export const MAIL_CHARTER_DARK: Readonly<Record<MailCharter, DarkPalette>> = {
  lfc: darkPaletteOf(STARTING_MAIL_CHARTER),
  lfd: darkPaletteOf(STARTING_MAIL_CHARTER),
  internal: darkPaletteOf(STARTING_MAIL_CHARTER),
};

/** Les classes que le `<head>` d'un document réarrangé vise. */
export const DOCUMENT_CLASSES = {
  page: "lfd-page",
  card: "lfd-card",
  column: "lfd-col",
  callout: { info: "lfd-callout-info", warning: "lfd-callout-warning" },
} as const;

/** En dessous de cette largeur, les colonnes s'empilent (Apple Mail, Gmail web). */
const STACK_BELOW_PX = 600;

function darkRules(dark: DarkPalette): string {
  const c = DOCUMENT_CLASSES;
  return [
    `.${c.page}{background:${dark.page}!important;color:${dark.ink}!important;}`,
    `.${c.card}{background:${dark.card}!important;border-color:${dark.border}!important;}`,
    `.${c.card} h1,.${c.card} h2,.${c.card} p,.${c.card} td{color:${dark.ink}!important;}`,
    `.${c.card} td.${c.callout.info}{background:${dark.calloutInfo}!important;}`,
    `.${c.card} td.${c.callout.warning}{background:${dark.calloutWarning}!important;}`,
  ].join("");
}

function stackRule(): string {
  return `@media only screen and (max-width:${String(STACK_BELOW_PX)}px){.${DOCUMENT_CLASSES.column}{display:block!important;width:100%!important;padding:0 0 12px!important;}}`;
}

/**
 * Le cadre thémé : `color-scheme` déclaré, variante sombre de la charte par
 * `prefers-color-scheme`, empilement des colonnes par `@media`, et la police
 * des titres de la charte (celle de l'enseigne au départ). Gmail application
 * retire ce `<head>` : tout ce qu'il porte n'est qu'un supplément, jamais
 * une condition de lisibilité.
 */
export function charterFrameTheme(
  charter: MailRenderCharter,
  lang: string,
  input: Pick<LayoutInput, "brandFontUrl">,
): LayoutFrameTheme {
  const style = `${charterFontFaceRule(charter, input.brandFontUrl)}@media (prefers-color-scheme:dark){${darkRules(darkPaletteOf(charter))}}${stackRule()}`;
  return {
    head: `
  <head><meta name="color-scheme" content="light dark" /><meta name="supported-color-schemes" content="light dark" /><style>${style}</style></head>`,
    lang,
    pageClass: DOCUMENT_CLASSES.page,
    cardClass: DOCUMENT_CLASSES.card,
  };
}
