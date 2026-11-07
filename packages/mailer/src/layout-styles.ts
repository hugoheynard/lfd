/**
 * **Les styles en ligne de la coquille**, sortis de `html.ts` le 2026-11-07
 * (plan `plan-editeur-par-blocs.md`, § 4, S4b) : les blocs libres d'un
 * document réarrangé se rendent avec CES constantes, jamais avec une copie —
 * une copie dériverait au premier changement de la marque, et un encadré
 * ajouté par l'équipe ne ressemblerait plus au reste de l'e-mail.
 *
 * Chaque fragment se recompose à l'octet près en ce que la coquille écrivait
 * avant d'avoir des constantes : l'empreinte de rendu des 32 e-mails
 * (`mail-rendering-golden.spec.ts`, côté API) le tient.
 */

/**
 * La charte de la suite, telle qu'elle est **déjà** à l'écran : le thème `navi`
 * du back-office — marine corporate, page ivoire, angles quasi carrés.
 *
 * Les valeurs sont écrites en dur, et c'est voulu : un e-mail n'a pas de
 * feuille de styles, pas de variables CSS, pas de thème à l'exécution. Les
 * reprendre ici est la seule façon d'avoir la même identité des deux côtés —
 * au prix d'un rappel à faire si la marque change, ce que ce commentaire porte.
 */
export const BRAND = {
  navy: "#24448f",
  navyDeep: "#1a3157",
  ivory: "#fdfcfb",
  ink: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  radius: "4px",
} as const;

/** Le blanc des cartes et des pavés — celui sous le QR, jamais inversé. */
export const WHITE = "#ffffff";

/** La pile de polices du texte courant : aucune police externe. */
export const TEXT_FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

/** Le texte d'un titre, sans ses marges. */
export const TITLE_TEXT_STYLE = `font-size:20px;line-height:1.3;color:${BRAND.ink};`;

/** Le titre d'un e-mail (`<h1>`), marges comprises. */
export const TITLE_STYLE = `margin:0 0 16px;${TITLE_TEXT_STYLE}`;

/** Le texte courant, sans ses marges : retours à la ligne préservés. */
export const TEXT_STYLE = "line-height:1.6;white-space:pre-line;";

/** Le corps d'un e-mail (`<p>`), marges comprises. */
export const BODY_STYLE = `margin:0;${TEXT_STYLE}`;

/** Le bouton principal (le `<a>`), sans le paragraphe qui l'espace. */
export const BUTTON_STYLE = `display:inline-block;padding:13px 22px;background:${BRAND.navy};color:${WHITE};text-decoration:none;border-radius:${BRAND.radius};font-weight:600;font-size:15px;`;

/** L'espace autour du bouton principal de la coquille. */
export const CTA_SPACING_STYLE = "margin:28px 0 4px;";

/** Le lien discret sous le bouton. */
export const SECONDARY_LINK_STYLE = `color:${BRAND.navy};text-decoration:underline;`;

/** Le bouton secondaire, encadré plutôt que plein (l'itinéraire). */
export const OUTLINE_BUTTON_STYLE = `display:inline-block;padding:11px 20px;border:1px solid ${BRAND.navy};color:${BRAND.navy};text-decoration:none;border-radius:${BRAND.radius};font-weight:600;font-size:14px;`;

/** Le texte discret : pied, légende, recours. */
export const MUTED_TEXT_STYLE = `line-height:1.5;font-size:13px;color:${BRAND.muted};`;

/** Le pied d'un e-mail, marges comprises. */
export const FOOTER_STYLE = `margin:24px 0 0;${MUTED_TEXT_STYLE}`;

/** Le filet, sans ses marges : celui du recours, et le séparateur libre. */
export const RULE_STYLE = `border:0;border-top:1px solid ${BRAND.border};`;

/**
 * Les teintes d'un encadré libre (S4b) — les seules couleurs que la coquille
 * n'avait pas : l'information reprend le marine, l'avertissement un ambre
 * lisible sur fond clair. Le fond reste pâle pour que le texte garde l'encre.
 */
export const CALLOUT_COLORS = {
  info: { edge: BRAND.navy, background: "#eef2fa" },
  warning: { edge: "#b45309", background: "#fff7ed" },
} as const;

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
