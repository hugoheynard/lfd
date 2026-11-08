import type {
  MailCharterColors,
  MailCharterDarkColors,
  MailCharterFont,
  MailCharterSettings,
  MailLocale,
} from "@lfd/mail-blocks";

import { BRAND, WHITE } from "./brand.js";

/**
 * **La charte que le rendu lit** (plan `plan-editeur-par-blocs.md`, § 25,
 * C1) : les couleurs, la variante sombre, et — pour une charte publiée —
 * le logo par son adresse, la police des titres et le pied de page, déjà
 * dans la langue de l'envoi.
 *
 * Trois champs sont ABSENTS de la charte de départ, et c'est ce qui la fait
 * rendre les octets d'avant : le logo reste celui que l'entrée de la
 * coquille joint en ligne (`cid:`), la police celle de l'enseigne à
 * `brandFontUrl`, et aucun pied commun ni `<head>` n'est ajouté.
 */
export interface MailRenderCharter {
  readonly colors: MailCharterColors;
  /** Le fond du bandeau d'en-tête. */
  readonly band: string;
  readonly radius: string;
  readonly dark: MailCharterDarkColors;
  /** Le logo publié, par son adresse ; absent : celui de l'entrée (`cid:`). */
  readonly logo?: { readonly src: string; readonly alt: string };
  /** `null` : aucune police web ; absente : l'enseigne à `brandFontUrl`, comme avant. */
  readonly headingFont?: MailCharterFont | null;
  /**
   * La police du texte courant. Absente ou `null` : la pile système
   * (`TEXT_FONT_STACK`), à l'octet — la charte de départ n'en a pas.
   */
  readonly textFont?: MailCharterFont | null;
  /** Le pied de page commun, déjà dans la langue de l'envoi. */
  readonly footer?: string;
  /**
   * Vrai pour une charte publiée : tout e-mail de l'espace gagne le `<head>`
   * de la variante sombre. Faux au départ — la coquille d'aujourd'hui n'en a
   * pas, et la garantie « mêmes octets » l'exige.
   */
  readonly themed: boolean;
}

/** La variante sombre d'aujourd'hui, la même pour les trois chartes de modèle. */
const SUITE_DARK: MailCharterDarkColors = {
  page: "#0b1220",
  card: "#111a2e",
  text: "#e5e9f2",
  border: "#26324a",
};

/** **La charte de départ** : les constantes d'aujourd'hui, à l'octet. */
export const STARTING_MAIL_CHARTER: MailRenderCharter = {
  colors: {
    page: BRAND.ivory,
    card: WHITE,
    text: BRAND.ink,
    mutedText: BRAND.muted,
    primary: BRAND.navy,
    band: BRAND.navyDeep,
    border: BRAND.border,
  },
  band: BRAND.navyDeep,
  radius: BRAND.radius,
  dark: SUITE_DARK,
  themed: false,
};

/** La police de l'enseigne d'aujourd'hui, servie par la boutique (`brandFontUrl`). */
export const STARTING_HEADING_FONT_FAMILY = "Chunk";

/** Sa police de secours, écrite en ligne : c'est elle que Gmail affiche. */
export const STARTING_HEADING_FONT_FALLBACK = "'Arial Black',Impact,sans-serif";

/**
 * **Les réglages de la charte de départ**, tels que la page « Charte » les
 * montre : les constantes du rendu, sans logo choisi (`null` : le logo
 * embarqué), la police de l'enseigne si son adresse est publique, aucun pied.
 */
export function startingMailCharterSettings(brandFontUrl: string | undefined): MailCharterSettings {
  const start = STARTING_MAIL_CHARTER;
  return {
    logo: null,
    colors: start.colors,
    darkColors: start.dark,
    headingFont:
      brandFontUrl === undefined || !brandFontUrl.startsWith("https://")
        ? null
        : {
            family: STARTING_HEADING_FONT_FAMILY,
            url: brandFontUrl,
            fallback: STARTING_HEADING_FONT_FALLBACK,
          },
    textFont: null,
    footer: {},
  };
}

/**
 * La charte que le rendu lit, depuis des réglages publiés et la langue de
 * l'envoi. Le bandeau prend sa propre couleur (`colors.band`, ajoutée le
 * 2026-11-07 : la couleur principale le fonçait d'un cran) ; un texte manquant dans cette langue se lit en français,
 * la langue que chaque espace porte.
 */
export function renderCharterOf(
  settings: MailCharterSettings,
  locale: MailLocale,
): MailRenderCharter {
  const footer = (settings.footer[locale] ?? settings.footer.fr ?? "").trim();
  return {
    colors: settings.colors,
    band: settings.colors.band,
    radius: BRAND.radius,
    dark: settings.darkColors,
    ...(settings.logo === null || settings.logo.src === ""
      ? {}
      : {
          logo: {
            src: settings.logo.src,
            alt: settings.logo.alt[locale] ?? settings.logo.alt.fr ?? "",
          },
        }),
    headingFont: settings.headingFont,
    ...(settings.textFont === null ? {} : { textFont: settings.textFont }),
    ...(footer === "" ? {} : { footer }),
    themed: true,
  };
}
