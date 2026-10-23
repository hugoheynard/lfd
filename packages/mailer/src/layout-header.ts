import { htmlEscape } from "./escape.js";

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

/** Les deux valeurs de la charte dont le bandeau a besoin. */
export interface LayoutHeaderColors {
  readonly band: string;
  readonly radius: string;
}

/**
 * La face de l'enseigne et son repli. Le repli est écrit EN LIGNE : Gmail retire
 * le `<style>` du `<head>`, et c'est lui qu'on y verra.
 */
const BRAND_FONT_STACK = "'Chunk','Arial Black',Impact,sans-serif";

/** La marge du pavé blanc autour du logo, en pixels. */
const LOGO_PAD_PX = 6;

/** Le `@font-face` de l'enseigne, seulement si une URL publique est donnée. */
export function renderFontHead(url: string | undefined): string {
  if (url === undefined || !url.startsWith("https://")) {
    return "";
  }
  return `
  <head><style>@font-face{font-family:'Chunk';font-style:normal;font-weight:400;src:url('${htmlEscape(url)}') format('woff2');}</style></head>`;
}

/** Le bandeau, ou rien s'il n'a ni logo ni enseigne. */
export function renderLayoutHeader(input: LayoutHeaderInput, colors: LayoutHeaderColors): string {
  // Le logo DANS le bandeau, à gauche, sur un pavé blanc : c'est un JPEG à
  // fond blanc, sans transparence — posé nu sur le marine, il y ferait une
  // tache carrée. Deux cellules d'une table de présentation, pas de flex :
  // Outlook l'ignore et empilerait le logo et l'enseigne de travers.
  const logoCell =
    input.logo === undefined
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
      : `<span style="display:block;color:#ffffff;font-family:${BRAND_FONT_STACK};font-size:24px;line-height:1.1;letter-spacing:0.02em;text-transform:uppercase;">${htmlEscape(input.brand)}</span>`;
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
