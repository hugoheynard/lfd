import type { Localized } from "./mail-locales.js";

/**
 * **La charte graphique d'un espace** (plan `plan-editeur-par-blocs.md`,
 * § 25) — ce que l'équipe règle sur la page « Charte », et ce que le rendu
 * des e-mails de l'espace lit une fois la charte publiée.
 *
 * Les couleurs s'écrivent `#rrggbb` : un e-mail n'a ni variable CSS ni
 * thème à l'exécution, et une forme unique rend le contrôle de contraste
 * calculable.
 */
export interface MailCharterColors {
  /** Le fond de la page, autour de la carte. */
  readonly page: string;
  /** Le fond de la carte, sous le texte. */
  readonly card: string;
  /** Le texte courant et les titres. */
  readonly text: string;
  /** Le texte discret : pied, légendes, recours. */
  readonly mutedText: string;
  /** La couleur principale : boutons, liens. Le texte d'un bouton y est blanc. */
  readonly primary: string;
  /**
   * Le fond du bandeau d'en-tête, où l'enseigne s'écrit en blanc (Hugo,
   * 2026-11-07) : à part de la couleur principale, pour que la charte de
   * départ publiée telle quelle garde le bandeau d'aujourd'hui (`#1a3157`).
   */
  readonly band: string;
  /** Les filets et le contour de la carte. */
  readonly border: string;
}

/**
 * La variante sombre, pour `prefers-color-scheme` : le fond de page, la
 * carte, le texte et les filets — ce que la variante sombre d'aujourd'hui
 * remplace (`SUITE_DARK`, `@lfd/mailer`). Les boutons et les liens gardent
 * leur couleur claire : leur style est en ligne, et un client sombre ne les
 * inverse pas.
 */
export interface MailCharterDarkColors {
  readonly page: string;
  readonly card: string;
  readonly text: string;
  readonly border: string;
}

/**
 * Le logo : une image (de la médiathèque) que la publication copie dans le
 * stockage du bloc `mail` — la version publiée pointe vers la copie. Le texte
 * de remplacement est obligatoire dans chaque langue de l'espace.
 */
export interface MailCharterLogo {
  readonly src: string;
  readonly alt: Localized<string>;
}

/**
 * La police des titres : une police déclarée par son adresse (`woff2` en
 * `https://`) et son nom, avec sa police de secours, obligatoire — Gmail
 * ignore les polices web et n'affiche que le secours.
 */
export interface MailCharterFont {
  readonly family: string;
  readonly url: string;
  readonly fallback: string;
}

/** Les réglages d'une charte. */
export interface MailCharterSettings {
  /** `null` : le logo embarqué d'aujourd'hui (La Folie Coffee), joint en ligne. */
  readonly logo: MailCharterLogo | null;
  readonly colors: MailCharterColors;
  readonly darkColors: MailCharterDarkColors;
  /** `null` : aucune police web, la pile du texte courant. */
  readonly headingFont: MailCharterFont | null;
  /** Le pied de page commun (adresse, mentions, contact), par langue. Vide : aucun. */
  readonly footer: Localized<string>;
}
