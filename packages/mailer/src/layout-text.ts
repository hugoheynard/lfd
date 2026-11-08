import { charterOf, isRenderableUrl } from "./layout-fragments.js";
import type { LayoutInput, LayoutRow, MailCta } from "./layout-input.js";
import { effectiveSectionOrder, type LayoutSectionId } from "./layout-sections.js";
import {
  joinTextBlocks,
  linkLine,
  TEXT_ROW_SEPARATOR,
  TEXT_RULE,
  underlined,
  wrapText,
} from "./text-format.js";

/**
 * **La version texte de la coquille** — le pendant de `layoutFragments` et
 * de `renderLayout`, section pour section, depuis la MÊME entrée : ce que le
 * HTML montre, le texte le dit, dans le même ordre et la même langue (les
 * mots viennent de l'appelant, déjà remplis).
 */

function ctaText(cta: MailCta | undefined): string {
  return cta !== undefined && isRenderableUrl(cta.url) ? linkLine(cta.label, cta.url) : "";
}

/**
 * Le récapitulatif, une ligne par rangée (« Article — quantité — prix ») ;
 * la ligne de total sous un filet, comme dans le HTML.
 */
function rowsText(rows: readonly LayoutRow[] | undefined): string {
  if (rows === undefined || rows.length === 0) {
    return "";
  }
  return rows
    .map((row) => {
      const line = wrapText(`${row.label}${TEXT_ROW_SEPARATOR}${row.value}`);
      return row.strong === true ? `${TEXT_RULE}\n${line}` : line;
    })
    .join("\n");
}

/**
 * L'image en ligne : son texte de remplacement, puis sa légende — le code
 * en clair d'un QR y est, et c'est lui qu'on lit quand on ne voit pas l'image.
 */
function imageText(input: LayoutInput): string {
  const image = input.image;
  if (image === undefined) {
    return "";
  }
  return [wrapText(image.alt), wrapText(image.caption ?? "")]
    .filter((line) => line !== "")
    .join("\n");
}

/** Les huit sections du corps, en texte ; une section absente vaut la chaîne vide. */
export function layoutTextFragments(input: LayoutInput): Readonly<Record<LayoutSectionId, string>> {
  const cta = ctaText(input.cta);
  return {
    title: underlined(input.title, "="),
    body: wrapText(input.body),
    summary: rowsText(input.rows),
    image: imageText(input),
    itinerary: ctaText(input.itinerary),
    cta,
    // Comme dans le HTML : le lien secondaire n'existe que sous un bouton.
    secondaryLink: cta === "" ? "" : ctaText(input.secondaryLink),
    footer: wrapText(input.footer ?? ""),
  };
}

/** Le recours, sous un filet — la phrase du HTML (`supportOf`), mot pour mot. */
function supportText(input: LayoutInput): string {
  const email = input.supportEmail?.trim() ?? "";
  return email === ""
    ? ""
    : `${TEXT_RULE}\n${wrapText(
        `Un problème, ou vous n'attendiez pas ce message ? Contactez votre administrateur : ${email}`,
      )}`;
}

/**
 * Le pied de désinscription (plan de désinscription, B2) : la phrase,
 * l'adresse en clair à la place du lien — jamais coupée, elle ne se
 * cliquerait plus.
 */
function unsubscribeText(input: LayoutInput): string {
  const footer = input.unsubscribe;
  return footer === undefined ? "" : wrapText(`${footer.before}${footer.url}${footer.after}`);
}

/**
 * Le cadre texte autour d'un corps déjà assemblé : l'enseigne en tête, le
 * pied commun de la charte publiée, le pied de désinscription d'un e-mail
 * marketing et le recours en bas — les cadres du HTML.
 */
export function layoutTextFrame(input: LayoutInput, body: readonly string[]): string {
  const charterFooter = charterOf(input).footer;
  return `${joinTextBlocks([
    wrapText(input.brand ?? ""),
    ...body,
    wrapText(charterFooter ?? ""),
    unsubscribeText(input),
    supportText(input),
  ])}\n`;
}

/**
 * **La version texte d'un e-mail de la coquille**, dans l'ordre effectif des
 * sections : celle que Resend envoie en `text/plain` à côté du HTML.
 */
export function renderLayoutText(input: LayoutInput): string {
  const fragments = layoutTextFragments(input);
  return layoutTextFrame(
    input,
    effectiveSectionOrder(input.sections).map((id) => fragments[id]),
  );
}
