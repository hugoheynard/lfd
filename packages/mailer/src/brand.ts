/**
 * Les valeurs de la marque d'aujourd'hui — la charte de départ des deux
 * espaces (plan `plan-editeur-par-blocs.md`, § 25). Sorties de
 * `layout-styles.ts` le 2026-11-07 (C1) : la charte de départ
 * (`render-charter.ts`) et les styles en ligne les lisent toutes les deux.
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
