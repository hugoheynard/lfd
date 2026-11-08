import { TEXT_FONT_STACK, WHITE } from "./brand.js";
import type { MailRenderCharter } from "./render-charter.js";

/**
 * **Les styles en ligne d'une charte** (plan `plan-editeur-par-blocs.md`,
 * § 25, C1) : chaque fragment de la coquille et chaque bloc libre se rend
 * avec CES chaînes, calculées de la charte de l'envoi. Les constantes
 * exportées de `layout-styles.ts` sont celles de la charte de départ — la
 * même fonction, et l'empreinte des 32 e-mails tient qu'elles n'ont pas
 * bougé d'un octet.
 */
export interface MailStyles {
  readonly titleText: string;
  readonly title: string;
  readonly button: string;
  readonly secondaryLink: string;
  readonly outlineButton: string;
  readonly mutedText: string;
  readonly footer: string;
  readonly rule: string;
  readonly callout: {
    readonly info: { readonly edge: string; readonly background: string };
    readonly warning: { readonly edge: string; readonly background: string };
  };
}

/** Le texte courant, sans ses marges : retours à la ligne préservés. */
export const TEXT_STYLE = "line-height:1.6;white-space:pre-line;";

/** Le corps d'un e-mail (`<p>`), marges comprises. */
export const BODY_STYLE = `margin:0;${TEXT_STYLE}`;

/** La pile d'une police des titres : la police déclarée, puis son secours. */
export function headingFontStack(family: string, fallback: string): string {
  return `'${family}',${fallback}`;
}

/**
 * La pile du texte courant : la police du texte de la charte, puis son
 * secours ; sans police du texte, la pile système d'avant, à l'octet.
 */
export function textFontStack(charter: MailRenderCharter): string {
  const font = charter.textFont;
  return font === undefined || font === null
    ? TEXT_FONT_STACK
    : headingFontStack(font.family, font.fallback);
}

function titleFont(charter: MailRenderCharter): string {
  const font = charter.headingFont;
  return font === undefined || font === null
    ? ""
    : `font-family:${headingFontStack(font.family, font.fallback)};`;
}

/** Les styles de la charte. */
export function mailStylesOf(charter: MailRenderCharter): MailStyles {
  const { colors, radius } = charter;
  const titleText = `font-size:20px;line-height:1.3;color:${colors.text};${titleFont(charter)}`;
  const mutedText = `line-height:1.5;font-size:13px;color:${colors.mutedText};`;
  return {
    titleText,
    title: `margin:0 0 16px;${titleText}`,
    button: `display:inline-block;padding:13px 22px;background:${colors.primary};color:${WHITE};text-decoration:none;border-radius:${radius};font-weight:600;font-size:15px;`,
    secondaryLink: `color:${colors.primary};text-decoration:underline;`,
    outlineButton: `display:inline-block;padding:11px 20px;border:1px solid ${colors.primary};color:${colors.primary};text-decoration:none;border-radius:${radius};font-weight:600;font-size:14px;`,
    mutedText,
    footer: `margin:24px 0 0;${mutedText}`,
    rule: `border:0;border-top:1px solid ${colors.border};`,
    callout: {
      info: { edge: colors.primary, background: "#eef2fa" },
      warning: { edge: "#b45309", background: "#fff7ed" },
    },
  };
}
