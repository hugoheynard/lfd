import { TEXT_FONT_STACK } from "./brand.js";
import { headingFontStack } from "./charter-styles.js";
import { htmlEscape } from "./escape.js";
import {
  STARTING_HEADING_FONT_FALLBACK,
  STARTING_HEADING_FONT_FAMILY,
  type MailRenderCharter,
} from "./render-charter.js";

/**
 * Le bandeau d'en-tête de la coquille : le logo sur son pavé blanc à gauche,
 * l'enseigne dans sa face et le sous-titre à droite. Sorti de `html.ts` le
 * 2026-10-23, quand le logo et la police y sont entrés.
 */

/**
 * Le **logo d'en-tête**, en ligne par `cid:` comme `LayoutImage` — et pour
 * les mêmes raisons. Rectangulaire : largeur et hauteur séparées, en
 * ATTRIBUTS, pour qu'un client qui ignore le CSS ne le déforme pas.
 *
 * La coquille ne pose que la balise : la pièce jointe que `contentId`
 * désigne est à la charge de l'app, qui seule possède l'image.
 */
export interface LayoutLogo {
  readonly contentId: string;
  readonly alt: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

/** Ce que le bandeau lit de la coquille. */
export interface LayoutHeaderInput {
  readonly brand?: string;
  readonly kicker?: string;
  readonly logo?: LayoutLogo;
}

/**
 * La face de l'enseigne et son repli. Le repli est écrit EN LIGNE : Gmail retire
 * le `<style>` du `<head>`, et c'est lui qu'on y verra.
 */
const BRAND_FONT_STACK = headingFontStack(
  STARTING_HEADING_FONT_FAMILY,
  STARTING_HEADING_FONT_FALLBACK,
);

/** La hauteur du logo d'une charte publiée : celle du logo embarqué ; sa largeur suit l'image. */
const CHARTER_LOGO_HEIGHT_PX = 56;

/** La marge du pavé blanc autour du logo, en pixels. */
const LOGO_PAD_PX = 6;

/**
 * La règle `@font-face` de l'enseigne, seulement si une URL publique est
 * donnée — partagée par la coquille et le `<head>` d'un document réarrangé.
 */
export function brandFontFaceRule(url: string | undefined): string {
  return fontFaceRule(STARTING_HEADING_FONT_FAMILY, url);
}

function fontFaceRule(family: string, url: string | undefined): string {
  if (url === undefined || !url.startsWith("https://")) {
    return "";
  }
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:400;src:url('${htmlEscape(url)}') format('woff2');}`;
}

/**
 * La règle `@font-face` de la police des titres d'une charte : celle de
 * l'enseigne à `brandFontUrl` tant que la charte n'en déclare pas (départ),
 * aucune si la charte publiée n'a pas de police web.
 */
export function charterFontFaceRule(
  charter: MailRenderCharter,
  brandFontUrl: string | undefined,
): string {
  const font = charter.headingFont;
  if (font === undefined) {
    return brandFontFaceRule(brandFontUrl);
  }
  return font === null ? "" : fontFaceRule(font.family, font.url);
}

function brandNameStack(charter: MailRenderCharter): string {
  const font = charter.headingFont;
  if (font === undefined) {
    return BRAND_FONT_STACK;
  }
  return font === null ? TEXT_FONT_STACK : headingFontStack(font.family, font.fallback);
}

/** Le `@font-face` de l'enseigne, seulement si une URL publique est donnée. */
export function renderFontHead(url: string | undefined): string {
  const rule = brandFontFaceRule(url);
  return rule === ""
    ? ""
    : `
  <head><style>${rule}</style></head>`;
}

/** Le bandeau, ou rien s'il n'a ni logo ni enseigne. */
export function renderLayoutHeader(input: LayoutHeaderInput, charter: MailRenderCharter): string {
  const colors = { band: charter.band, radius: charter.radius };
  // Le logo DANS le bandeau, à gauche, sur un pavé blanc : c'est un JPEG à
  // fond blanc, sans transparence — posé nu sur le marine, il y ferait une
  // tache carrée. Deux cellules d'une table de présentation, pas de flex :
  // Outlook l'ignore et empilerait le logo et l'enseigne de travers.
  const logoCell =
    charter.logo !== undefined
      ? charterLogoCell(charter.logo, colors.radius)
      : input.logo === undefined
        ? ""
        : `<td width="${String(input.logo.widthPx + 2 * LOGO_PAD_PX)}" style="padding:0 16px 0 0;vertical-align:middle;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#ffffff;padding:${String(LOGO_PAD_PX)}px;border-radius:${colors.radius};">
              <img src="cid:${htmlEscape(input.logo.contentId)}" alt="${htmlEscape(input.logo.alt)}" width="${String(input.logo.widthPx)}" height="${String(input.logo.heightPx)}" style="display:block;border:0;" />
            </td></tr></table>
          </td>`;
  const kicker =
    input.kicker === undefined || input.kicker.trim() === ""
      ? ""
      : `<span style="display:block;margin:4px 0 0;color:#c7d2e6;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">${htmlEscape(input.kicker)}</span>`;
  const name =
    input.brand === undefined
      ? ""
      : `<span style="display:block;color:#ffffff;font-family:${brandNameStack(charter)};font-size:24px;line-height:1.1;letter-spacing:0.02em;text-transform:uppercase;">${htmlEscape(input.brand)}</span>`;
  const brandCell =
    name === "" && kicker === ""
      ? ""
      : `<td style="vertical-align:middle;">
            ${name}
            ${kicker}
          </td>`;
  return logoCell === "" && brandCell === ""
    ? ""
    : `<tr><td style="background:${colors.band};padding:${logoCell === "" ? "18px" : "12px"} 32px;border-radius:${colors.radius} ${colors.radius} 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          ${logoCell}
          ${brandCell}
          </tr></table>
        </td></tr>`;
}

// Le logo d'une charte publiée, par son adresse (la copie du bloc `mail`) :
// sa largeur n'est pas connue, la hauteur seule est en attribut et la
// largeur suit la proportion de l'image.
function charterLogoCell(
  logo: { readonly src: string; readonly alt: string },
  radius: string,
): string {
  return `<td style="padding:0 16px 0 0;vertical-align:middle;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#ffffff;padding:${String(LOGO_PAD_PX)}px;border-radius:${radius};">
              <img src="${htmlEscape(logo.src)}" alt="${htmlEscape(logo.alt)}" height="${String(CHARTER_LOGO_HEIGHT_PX)}" style="display:block;border:0;height:${String(CHARTER_LOGO_HEIGHT_PX)}px;width:auto;" />
            </td></tr></table>
          </td>`;
}
