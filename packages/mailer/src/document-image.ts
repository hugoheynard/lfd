import {
  framingOf,
  IMAGE_FORMAT_RATIOS,
  type ImageBlock,
  type Localized,
  type MailLocale,
} from "@lfd/mail-blocks";

import { htmlEscape } from "./escape.js";
import { isRenderableUrl } from "./layout-fragments.js";
import { IMAGE_LINK_STYLE, IMAGE_SPACING_STYLE, IMAGE_STYLE } from "./layout-styles.js";

/**
 * **Le rendu d'une image libre** (plan `plan-editeur-par-blocs.md`, § 19,
 * S5d), sorti de `document-blocks.ts` le 2026-11-08 quand l'image pleine
 * largeur est arrivée : la balise `<img>` (source, texte de remplacement,
 * cadrage d'aperçu, lien) est la même dans le corps et bord à bord ; seuls sa
 * largeur et son conteneur changent.
 */

/**
 * Pour qui un bloc libre se rend :
 * - `sent` — l'e-mail qui part (et l'essai) : la copie publiée, rien de plus ;
 * - `canvas` — le canevas de l'éditeur (S5f) : textes marqués, image SOURCE
 *   signalée par `data-image-*`, que l'écran recadre en CSS ;
 * - `preview` — l'aperçu fidèle : le rendu de l'envoi, sauf qu'une image
 *   cadrée SANS copie publiée (un brouillon) est recadrée à l'affichage.
 *   Le moteur ne peut pas le deviner seul : une version publiée d'avant
 *   `copySrc` range déjà la copie recadrée dans `src`.
 */
export type FreeBlockAudience = "sent" | "canvas" | "preview";

/** Le texte d'un bloc dans la langue de l'envoi, ou `null` s'il manque. */
export function textIn(text: Localized<string>, locale: MailLocale): string | null {
  const value = text[locale];
  return value === undefined || value.trim() === "" ? null : value;
}

/**
 * Le cadrage d'une image, dans l'aperçu de l'éditeur seulement (S5f,
 * `marked`) : un brouillon montre l'image SOURCE, et c'est l'écran qui la
 * recadre en CSS d'après `data-image-format` et `data-image-focal-x|y`
 * (fractions de 0 à 1). Rien sans cadrage, et jamais dans un e-mail envoyé.
 */
function framingAttributes(block: ImageBlock): string {
  const framing = framingOf(block);
  return framing === null
    ? ""
    : ` data-image-format="${framing.format}" data-image-focal-x="${framing.focal.x}" data-image-focal-y="${framing.focal.y}"`;
}

/**
 * Le recadrage à l'affichage d'une image cadrée sans copie (aperçu fidèle
 * d'un brouillon) : c'est un navigateur qui affiche l'aperçu, il lit
 * `aspect-ratio` et `object-fit`. Jamais dans un e-mail envoyé.
 */
function previewFramingStyle(block: ImageBlock): string {
  const framing = framingOf(block);
  if (framing === null || block.copySrc !== undefined) {
    return "";
  }
  const ratio = IMAGE_FORMAT_RATIOS[framing.format];
  const x = String(framing.focal.x * 100);
  const y = String(framing.focal.y * 100);
  return `aspect-ratio:${String(ratio)};object-fit:cover;object-position:${x}% ${y}%;`;
}

/** Ce qui distingue une image dans le corps d'une image bord à bord. */
export interface ImageSizing {
  /** La valeur de l'attribut `width` (`100%`, ou des pixels pour Outlook). */
  readonly widthAttribute: string;
  /** Le style en ligne de la balise, avant le recadrage d'aperçu. */
  readonly style: string;
  /** Des attributs du canevas en plus (`data-image-width`), ou vide. */
  readonly canvasAttributes: string;
}

/**
 * L'image (liée s'il le faut), ou la chaîne vide. Une image décorative rend
 * un `alt` vide, voulu ; une autre sans texte dans la langue de l'envoi ne
 * rend rien, comme un texte manquant. Sans adresse (pas encore choisie) ou
 * sur une adresse hostile : rien.
 */
export function imageElement(
  block: ImageBlock,
  locale: MailLocale,
  audience: FreeBlockAudience,
  sizing: ImageSizing,
): string {
  const marked = audience === "canvas";
  const alt = block.decorative === true ? "" : textIn(block.alt, locale);
  // L'aperçu de l'éditeur montre la SOURCE (recadrée en CSS par l'écran) ;
  // l'envoi, la copie publiée — ou `src` pour une version d'avant `copySrc`.
  const src = marked ? block.src : (block.copySrc ?? block.src);
  if (alt === null || src === "" || !isRenderableUrl(src)) {
    return "";
  }
  const data = marked ? `${framingAttributes(block)}${sizing.canvasAttributes}` : "";
  const preview = audience === "preview" ? previewFramingStyle(block) : "";
  const img = `<img src="${htmlEscape(src)}" alt="${htmlEscape(alt)}" width="${sizing.widthAttribute}"${data} style="${sizing.style}${preview}" />`;
  return block.href !== undefined && block.decorative !== true && isRenderableUrl(block.href)
    ? `<a href="${htmlEscape(block.href)}" style="${IMAGE_LINK_STYLE}">${img}</a>`
    : img;
}

const CONTENT_SIZING: ImageSizing = {
  widthAttribute: "100%",
  style: IMAGE_STYLE,
  canvasAttributes: "",
};

/**
 * Une image dans le corps (ou une colonne), en tableau pour qu'Outlook garde
 * sa largeur. L'image publiée est déjà au format (la publication l'a
 * recadrée, § 19) : l'e-mail ne fait rien de plus que la largeur.
 */
export function renderContentImage(
  block: ImageBlock,
  locale: MailLocale,
  audience: FreeBlockAudience,
): string {
  const linked = imageElement(block, locale, audience, CONTENT_SIZING);
  return linked === ""
    ? ""
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${IMAGE_SPACING_STYLE}"><tr><td>${linked}</td></tr></table>`;
}
