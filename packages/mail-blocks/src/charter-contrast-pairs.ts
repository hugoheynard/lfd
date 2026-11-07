import type { MailCharterSettings } from "./charter-settings.js";

/**
 * **Une paire texte / fond qu'un e-mail affiche réellement** : la couleur du
 * texte et celle de son fond, lues dans la charte, le champ que le refus
 * désigne, et ses deux libellés — celui de la carte « Contraste » de
 * l'écran (`label`), celui de la phrase du refus (`what`).
 */
export interface CharterContrastPair {
  readonly field: string;
  readonly label: string;
  readonly what: string;
  readonly foreground: (settings: MailCharterSettings) => string;
  readonly background: (settings: MailCharterSettings) => string;
}

/** Le blanc du texte d'un bouton et du bandeau, fixé par la coquille. */
const BUTTON_TEXT = "#ffffff";

/**
 * **Les paires que la publication contrôle**, dans l'ordre où l'écran les
 * montre — une seule liste, lue par le refus (`validateMailCharterForPublication`)
 * et par la carte « Contraste » du back-office, qui affiche aussi celles qui
 * passent.
 */
export const CHARTER_CONTRAST_PAIRS: readonly CharterContrastPair[] = [
  {
    field: "colors.text",
    label: "Texte sur la carte",
    what: "le texte et le fond de la carte",
    foreground: (s) => s.colors.text,
    background: (s) => s.colors.card,
  },
  {
    field: "colors.text",
    label: "Texte sur le fond de page",
    what: "le texte et le fond de page",
    foreground: (s) => s.colors.text,
    background: (s) => s.colors.page,
  },
  {
    field: "colors.mutedText",
    label: "Texte secondaire sur la carte",
    what: "le texte secondaire et le fond de la carte",
    foreground: (s) => s.colors.mutedText,
    background: (s) => s.colors.card,
  },
  {
    field: "colors.primary",
    label: "Liens sur la carte",
    what: "les liens (couleur principale) et le fond de la carte",
    foreground: (s) => s.colors.primary,
    background: (s) => s.colors.card,
  },
  {
    field: "colors.primary",
    label: "Texte blanc des boutons",
    what: "le texte blanc des boutons et la couleur principale",
    foreground: () => BUTTON_TEXT,
    background: (s) => s.colors.primary,
  },
  {
    field: "colors.band",
    label: "Texte blanc du bandeau",
    what: "le texte blanc du bandeau et sa couleur",
    foreground: () => BUTTON_TEXT,
    background: (s) => s.colors.band,
  },
  {
    field: "darkColors.text",
    label: "Sombre — texte sur la carte",
    what: "le texte et le fond de la carte, en sombre",
    foreground: (s) => s.darkColors.text,
    background: (s) => s.darkColors.card,
  },
  {
    field: "darkColors.text",
    label: "Sombre — texte sur le fond de page",
    what: "le texte et le fond de page, en sombre",
    foreground: (s) => s.darkColors.text,
    background: (s) => s.darkColors.page,
  },
];
