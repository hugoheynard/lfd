import { BODY_STYLE, mailStylesOf, TEXT_STYLE } from "./charter-styles.js";
import { STARTING_MAIL_CHARTER } from "./render-charter.js";

/**
 * **Les styles en ligne de la coquille**, sortis de `html.ts` le 2026-11-07
 * (plan `plan-editeur-par-blocs.md`, § 4, S4b) : les blocs libres d'un
 * document réarrangé se rendent avec CES styles, jamais avec une copie — une
 * copie dériverait au premier changement de la marque, et un encadré ajouté
 * par l'équipe ne ressemblerait plus au reste de l'e-mail.
 *
 * Depuis C1 (§ 25), le rendu lit les styles de la charte de l'envoi
 * (`mailStylesOf`) ; les constantes ci-dessous sont ceux de la charte de
 * DÉPART, gardées pour les lecteurs qui les importent. L'empreinte de rendu
 * des 32 e-mails (`mail-rendering-golden.spec.ts`, côté API) tient qu'elles
 * se recomposent à l'octet en ce que la coquille écrivait avant.
 */

export { BRAND, TEXT_FONT_STACK, WHITE } from "./brand.js";
export { BODY_STYLE, TEXT_STYLE };

const STARTING = mailStylesOf(STARTING_MAIL_CHARTER);

/** Le texte d'un titre, sans ses marges. */
export const TITLE_TEXT_STYLE = STARTING.titleText;

/** Le titre d'un e-mail (`<h1>`), marges comprises. */
export const TITLE_STYLE = STARTING.title;

/** Le bouton principal (le `<a>`), sans le paragraphe qui l'espace. */
export const BUTTON_STYLE = STARTING.button;

/** L'espace autour du bouton principal de la coquille. */
export const CTA_SPACING_STYLE = "margin:28px 0 4px;";

/** Le lien discret sous le bouton. */
export const SECONDARY_LINK_STYLE = STARTING.secondaryLink;

/** Le bouton secondaire, encadré plutôt que plein (l'itinéraire). */
export const OUTLINE_BUTTON_STYLE = STARTING.outlineButton;

/** Le texte discret : pied, légende, recours. */
export const MUTED_TEXT_STYLE = STARTING.mutedText;

/** Le pied d'un e-mail, marges comprises. */
export const FOOTER_STYLE = STARTING.footer;

/** Le filet, sans ses marges : celui du recours, et le séparateur libre. */
export const RULE_STYLE = STARTING.rule;

/**
 * Les teintes d'un encadré libre (S4b) — les seules couleurs que la coquille
 * n'avait pas : l'information reprend la couleur principale, l'avertissement
 * un ambre lisible sur fond clair. Le fond reste pâle pour que le texte
 * garde l'encre.
 */
export const CALLOUT_COLORS = STARTING.callout;

/** Le texte d'un encadré : le corps, un cran plus petit. */
export const CALLOUT_TEXT_STYLE = `${BODY_STYLE}font-size:14px;`;

/**
 * Une image libre (S5d) : pleine largeur de sa cellule, hauteur suivant la
 * proportion, sans bordure — celle que certains clients posent autour d'une
 * image liée.
 */
export const IMAGE_STYLE = "display:block;width:100%;max-width:100%;height:auto;border:0;";

/** L'espace au-dessus d'une image libre, celui d'un encadré. */
export const IMAGE_SPACING_STYLE = "margin:20px 0 0;";

/** Le lien autour d'une image libre : aucun soulignement sous l'image. */
export const IMAGE_LINK_STYLE = "text-decoration:none;";
