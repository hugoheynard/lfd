import type { MailCharter } from "@lfd/mail-blocks";

import type { LayoutFrameTheme } from "./html.js";
import { brandFontFaceRule } from "./layout-header.js";

/**
 * **Les trois chartes et leur variante sombre** (plan
 * `plan-editeur-par-blocs.md`, § 4, S4b) — émises SEULEMENT pour un document
 * réarrangé : un `<style>` dans le `<head>` changerait les octets du document
 * de départ, que la coquille rend sans `<head>` (sauf la police).
 *
 * En clair, les trois chartes partagent la palette `BRAND` : ce qui les
 * distingue aujourd'hui (l'enseigne du bandeau, le recours) est une donnée de
 * l'envoi, pas un style (vérifié le 2026-11-07 dans `b2bMailTemplates`). La
 * variante sombre est déclarée par charte pour qu'une charte (la billetterie)
 * puisse en avoir une autre sans toucher aux deux autres.
 */
export interface DarkPalette {
  readonly page: string;
  readonly card: string;
  readonly ink: string;
  readonly border: string;
  readonly calloutInfo: string;
  readonly calloutWarning: string;
}

/** La variante sombre de la suite : marine nuit, texte clair. */
const SUITE_DARK: DarkPalette = {
  page: "#0b1220",
  card: "#111a2e",
  ink: "#e5e9f2",
  border: "#26324a",
  calloutInfo: "#1a2747",
  calloutWarning: "#3a2a12",
};

/** La variante sombre de chaque charte. */
export const MAIL_CHARTER_DARK: Readonly<Record<MailCharter, DarkPalette>> = {
  lfc: SUITE_DARK,
  lfd: SUITE_DARK,
  internal: SUITE_DARK,
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
 * Le cadre d'un document réarrangé : `color-scheme` déclaré, variante sombre
 * de sa charte par `prefers-color-scheme`, empilement des colonnes par
 * `@media`, et la police de l'enseigne si elle est donnée. Gmail application
 * retire ce `<head>` : tout ce qu'il porte n'est qu'un supplément, jamais une
 * condition de lisibilité.
 */
export function documentFrameTheme(
  charter: MailCharter,
  lang: string,
  brandFontUrl: string | undefined,
): LayoutFrameTheme {
  const style = `${brandFontFaceRule(brandFontUrl)}@media (prefers-color-scheme:dark){${darkRules(MAIL_CHARTER_DARK[charter])}}${stackRule()}`;
  return {
    head: `
  <head><meta name="color-scheme" content="light dark" /><meta name="supported-color-schemes" content="light dark" /><style>${style}</style></head>`,
    lang,
    pageClass: DOCUMENT_CLASSES.page,
    cardClass: DOCUMENT_CLASSES.card,
  };
}
