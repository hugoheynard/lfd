import { htmlEscape } from "./escape.js";
import type { LayoutInput } from "./layout-input.js";
import type { LayoutSectionId } from "./layout-sections.js";
import { BODY_STYLE, mailStylesOf, type MailStyles } from "./charter-styles.js";
import { CTA_SPACING_STYLE } from "./layout-styles.js";
import { STARTING_MAIL_CHARTER, type MailRenderCharter } from "./render-charter.js";

/**
 * Les fragments de la coquille, sortis de `html.ts` le 2026-11-07 (S4b) :
 * la coquille et le rendu d'un document en lisent les mêmes, pour que les
 * blocs du modèle d'un document se rendent EXACTEMENT comme aujourd'hui.
 */

/**
 * N'affiche un bouton que pour un lien `http(s)` ou une racine — jamais
 * `javascript:`, `data:` ou un autre schéma. Défense en profondeur : ces liens
 * sont inertes dans un client mail, mais on n'émet pas de lien hostile.
 */
export function isRenderableUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://") || url.startsWith("/");
}

/** La charte de l'entrée : la publiée si l'envoi en porte une, sinon celle de départ. */
export function charterOf(input: LayoutInput): MailRenderCharter {
  return input.charter ?? STARTING_MAIL_CHARTER;
}

function ctaOf(input: LayoutInput, styles: MailStyles): string {
  return input.cta !== undefined && isRenderableUrl(input.cta.url)
    ? `<p style="${CTA_SPACING_STYLE}"><a href="${htmlEscape(input.cta.url)}" style="${styles.button}">${htmlEscape(input.cta.label)}</a></p>`
    : "";
}

function secondaryOf(input: LayoutInput, cta: string, styles: MailStyles): string {
  return cta !== "" && input.secondaryLink !== undefined && isRenderableUrl(input.secondaryLink.url)
    ? `<p style="margin:12px 0 0;font-size:14px;"><a href="${htmlEscape(input.secondaryLink.url)}" style="${styles.secondaryLink}">${htmlEscape(input.secondaryLink.label)}</a></p>`
    : "";
}

// Le récapitulatif : un tableau de présentation, pas une grille. Outlook
// ignore flex et grid, et un récapitulatif qui s'effondre en une colonne
// rend les montants illisibles au moment précis où on les cherche.
function rowsOf(input: LayoutInput, charter: MailRenderCharter): string {
  return input.rows === undefined || input.rows.length === 0
    ? ""
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;font-size:14px;">
          ${input.rows
            .map(
              (row) =>
                `<tr>
                  <td style="padding:7px 0;${row.strong === true ? `border-top:1px solid ${charter.colors.border};font-weight:700;` : `color:${charter.colors.mutedText};`}">${htmlEscape(row.label)}</td>
                  <td align="right" style="padding:7px 0;${row.strong === true ? `border-top:1px solid ${charter.colors.border};font-weight:700;` : ""}">${htmlEscape(row.value)}</td>
                </tr>`,
            )
            .join("")}
        </table>`;
}

// L'image en ligne. `width`/`height` en ATTRIBUTS et non en CSS : plusieurs
// clients ignorent le style de dimension et afficheraient l'image à sa taille
// native, c'est-à-dire de travers.
function imageOf(input: LayoutInput, charter: MailRenderCharter): string {
  return input.image === undefined
    ? ""
    : `<p style="margin:24px 0 0;text-align:center;">
          <img src="cid:${htmlEscape(input.image.contentId)}" alt="${htmlEscape(input.image.alt)}" width="${String(input.image.sizePx)}" height="${String(input.image.sizePx)}" style="display:block;margin:0 auto;background:#ffffff;" />
          ${input.image.caption === undefined ? "" : `<span style="display:block;margin:10px 0 0;font-size:13px;color:${charter.colors.mutedText};line-height:1.5;">${htmlEscape(input.image.caption)}</span>`}
        </p>`;
}

function itineraryOf(input: LayoutInput, styles: MailStyles): string {
  return input.itinerary !== undefined && isRenderableUrl(input.itinerary.url)
    ? `<p style="margin:20px 0 4px;"><a href="${htmlEscape(input.itinerary.url)}" style="${styles.outlineButton}">${htmlEscape(input.itinerary.label)}</a></p>`
    : "";
}

/** Les huit fragments du corps ; une section absente vaut la chaîne vide. */
export function layoutFragments(input: LayoutInput): Readonly<Record<LayoutSectionId, string>> {
  const charter = charterOf(input);
  const styles = mailStylesOf(charter);
  const cta = ctaOf(input, styles);
  return {
    title: `<h1 style="${styles.title}">${htmlEscape(input.title)}</h1>`,
    body: `<p style="${BODY_STYLE}">${htmlEscape(input.body)}</p>`,
    summary: rowsOf(input, charter),
    image: imageOf(input, charter),
    itinerary: itineraryOf(input, styles),
    cta,
    secondaryLink: secondaryOf(input, cta, styles),
    footer:
      input.footer === undefined
        ? ""
        : `<p style="${styles.footer}">${htmlEscape(input.footer)}</p>`,
  };
}

// Le recours est SOUS un filet, séparé du message : il ne se lit pas au même
// moment. On ne le cherche qu'une fois que quelque chose a mal tourné, et il
// doit alors se trouver sans relire l'e-mail.
export function supportOf(input: LayoutInput): string {
  const charter = charterOf(input);
  const styles = mailStylesOf(charter);
  return input.supportEmail === undefined || input.supportEmail.trim() === ""
    ? ""
    : `<tr><td style="padding:0 32px 28px;">
          <hr style="${styles.rule}margin:0 0 16px;" />
          <p style="margin:0;${styles.mutedText}">
            Un problème, ou vous n'attendiez pas ce message&nbsp;? Contactez votre administrateur&nbsp;:
            <a href="mailto:${htmlEscape(input.supportEmail)}" style="color:${charter.colors.primary};font-weight:600;text-decoration:none;">${htmlEscape(input.supportEmail)}</a>
          </p>
        </td></tr>`;
}

/**
 * Le pied de page commun de la charte publiée (C1, § 25), sous le corps et
 * au-dessus du recours ; rien pour la charte de départ, qui n'en a pas.
 */
export function charterFooterOf(input: LayoutInput): string {
  const footer = input.charter?.footer;
  return footer === undefined
    ? ""
    : `
      <tr><td style="padding:0 32px 24px;">
          <p style="margin:0;${mailStylesOf(charterOf(input)).mutedText}white-space:pre-line;">${htmlEscape(footer)}</p>
        </td></tr>`;
}

/**
 * Le pied de désinscription d'un e-mail marketing (plan de désinscription,
 * B2), sous le pied de la charte et au-dessus du recours ; rien sans lui. Un
 * lien qui ne se rend pas (schéma inattendu) laisse la phrase sans lien —
 * l'en-tête `List-Unsubscribe` porte de toute façon l'adresse.
 */
export function unsubscribeOf(input: LayoutInput): string {
  const footer = input.unsubscribe;
  if (footer === undefined) {
    return "";
  }
  const charter = charterOf(input);
  const link = isRenderableUrl(footer.url)
    ? `<a href="${htmlEscape(footer.url)}" style="color:${charter.colors.primary};text-decoration:underline;">${htmlEscape(footer.label)}</a>`
    : htmlEscape(footer.label);
  return `
      <tr><td style="padding:0 32px 24px;">
          <p style="margin:0;${mailStylesOf(charter).mutedText}" data-mail-unsubscribe="">${htmlEscape(footer.before)}${link}${htmlEscape(footer.after)}</p>
        </td></tr>`;
}
