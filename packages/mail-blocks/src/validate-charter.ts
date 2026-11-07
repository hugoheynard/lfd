import type {
  MailCharterColors,
  MailCharterDarkColors,
  MailCharterFont,
  MailCharterSettings,
} from "./charter-settings.js";
import { contrastRatio, isHexColor, MIN_TEXT_CONTRAST } from "./contrast.js";
import type { MailLocale } from "./mail-locales.js";
import { isHttpsUrl, isImageSourceUrl } from "./urls.js";

/**
 * Ce qu'une charte refuse (plan `plan-editeur-par-blocs.md`, § 25). Comme
 * pour un document, le paquet ne lève rien : il rend la liste, l'API la
 * traduit en refus, l'écran la montre sous le réglage en cause (`field`).
 */
export const MAIL_CHARTER_VIOLATION_CODES = [
  "charter-color-invalid",
  "charter-logo-src-invalid",
  "charter-logo-src-missing",
  "charter-logo-alt-missing",
  "charter-font-url-invalid",
  "charter-font-family-invalid",
  "charter-font-fallback-invalid",
  "charter-contrast-too-low",
] as const;

export type MailCharterViolationCode = (typeof MAIL_CHARTER_VIOLATION_CODES)[number];

/** Un refus : son code, le réglage en cause (`colors.text`, `logo.alt.fr`…), et le message pour l'équipe. */
export interface MailCharterViolation {
  readonly code: MailCharterViolationCode;
  readonly field: string;
  readonly message: string;
}

/** Le blanc du texte d'un bouton, posé sur la couleur principale. */
const BUTTON_TEXT = "#ffffff";

/**
 * Un nom de police, ou une pile de secours : lettres, chiffres, espaces,
 * virgules, tirets et apostrophes. Ils vont dans un attribut `style` et une
 * règle `@font-face` : ni guillemet double, ni `;`, ni accolade.
 */
const FONT_NAME = /^[A-Za-z0-9 ,'-]+$/u;

const LANGUAGE_NAMES: Readonly<Record<MailLocale, string>> = {
  fr: "français",
  en: "anglais",
  it: "italien",
};

const COLOR_NAMES: Readonly<Record<keyof MailCharterColors, string>> = {
  page: "le fond de page",
  card: "le fond de la carte",
  text: "le texte",
  mutedText: "le texte secondaire",
  primary: "la couleur principale",
  border: "les filets",
};

const LIGHT_KEYS = ["page", "card", "text", "mutedText", "primary", "border"] as const;
const DARK_KEYS = ["page", "card", "text", "border"] as const;

function colorViolation(field: string, value: string, name: string): MailCharterViolation[] {
  return isHexColor(value)
    ? []
    : [
        {
          code: "charter-color-invalid",
          field,
          message: `La couleur de ${name} doit s'écrire en six chiffres hexadécimaux (#1a3157), pas « ${value} ».`,
        },
      ];
}

function colorViolations(
  colors: MailCharterColors,
  dark: MailCharterDarkColors,
): MailCharterViolation[] {
  return [
    ...LIGHT_KEYS.flatMap((key) => colorViolation(`colors.${key}`, colors[key], COLOR_NAMES[key])),
    ...DARK_KEYS.flatMap((key) =>
      colorViolation(`darkColors.${key}`, dark[key], `${COLOR_NAMES[key]} (variante sombre)`),
    ),
  ];
}

function fontViolations(font: MailCharterFont | null): MailCharterViolation[] {
  if (font === null) {
    return [];
  }
  const found: MailCharterViolation[] = [];
  if (!isHttpsUrl(font.url)) {
    found.push({
      code: "charter-font-url-invalid",
      field: "headingFont.url",
      message: `La police des titres doit être servie en https:// (un fichier woff2 public), pas « ${font.url} ».`,
    });
  }
  if (!FONT_NAME.test(font.family.trim())) {
    found.push({
      code: "charter-font-family-invalid",
      field: "headingFont.family",
      message:
        "Le nom de la police des titres est vide ou porte un caractère refusé : lettres, chiffres, espaces, tirets et apostrophes seulement.",
    });
  }
  if (!FONT_NAME.test(font.fallback.trim())) {
    found.push({
      code: "charter-font-fallback-invalid",
      field: "headingFont.fallback",
      message:
        "La police de secours des titres est obligatoire (par exemple « Arial Black, sans-serif ») : c'est elle que Gmail affiche. Lettres, chiffres, espaces, virgules, tirets et apostrophes seulement.",
    });
  }
  return found;
}

/**
 * **Les règles de forme**, à chaque enregistrement du brouillon : couleurs en
 * `#rrggbb`, adresse du logo admise (vide tant qu'il n'est pas choisi),
 * police des titres en `https://` avec sa police de secours.
 */
export function validateMailCharter(
  settings: MailCharterSettings,
): readonly MailCharterViolation[] {
  const logo = settings.logo;
  const logoSource: MailCharterViolation[] =
    logo === null || logo.src === "" || isImageSourceUrl(logo.src)
      ? []
      : [
          {
            code: "charter-logo-src-invalid",
            field: "logo.src",
            message: `Le logo doit être une image de la médiathèque, servie en https://, pas « ${logo.src} ». Choisissez-le de nouveau.`,
          },
        ];
  return [
    ...colorViolations(settings.colors, settings.darkColors),
    ...logoSource,
    ...fontViolations(settings.headingFont),
  ];
}

function contrastViolation(
  field: string,
  foreground: string,
  background: string,
  what: string,
): MailCharterViolation[] {
  if (!isHexColor(foreground) || !isHexColor(background)) {
    return [];
  }
  const ratio = contrastRatio(foreground, background);
  return ratio >= MIN_TEXT_CONTRAST
    ? []
    : [
        {
          code: "charter-contrast-too-low",
          field,
          message: `Le contraste entre ${what} est de ${ratio.toFixed(2).replace(".", ",")}:1 ; il faut au moins 4,5:1 pour qu'un texte se lise (RGAA, critère 3.2). Foncez le texte ou éclaircissez le fond.`,
        },
      ];
}

/** Les paires texte / fond qu'un e-mail affiche réellement. */
function contrastViolations(settings: MailCharterSettings): MailCharterViolation[] {
  const c = settings.colors;
  const d = settings.darkColors;
  return [
    ...contrastViolation("colors.text", c.text, c.card, "le texte et le fond de la carte"),
    ...contrastViolation("colors.text", c.text, c.page, "le texte et le fond de page"),
    ...contrastViolation(
      "colors.mutedText",
      c.mutedText,
      c.card,
      "le texte secondaire et le fond de la carte",
    ),
    ...contrastViolation(
      "colors.primary",
      c.primary,
      c.card,
      "les liens (couleur principale) et le fond de la carte",
    ),
    ...contrastViolation(
      "colors.primary",
      BUTTON_TEXT,
      c.primary,
      "le texte blanc des boutons et la couleur principale",
    ),
    ...contrastViolation(
      "darkColors.text",
      d.text,
      d.card,
      "le texte et le fond de la carte, en sombre",
    ),
    ...contrastViolation(
      "darkColors.text",
      d.text,
      d.page,
      "le texte et le fond de page, en sombre",
    ),
  ];
}

function logoPublicationViolations(
  settings: MailCharterSettings,
  locales: readonly MailLocale[],
): MailCharterViolation[] {
  const logo = settings.logo;
  if (logo === null) {
    return [];
  }
  if (logo.src === "") {
    return [
      {
        code: "charter-logo-src-missing",
        field: "logo.src",
        message:
          "Aucun logo n'est choisi : choisissez une image dans la médiathèque, ou revenez au logo d'origine.",
      },
    ];
  }
  return locales.flatMap((locale) =>
    (logo.alt[locale]?.trim() ?? "") === ""
      ? [
          {
            code: "charter-logo-alt-missing" as const,
            field: `logo.alt.${locale}`,
            message: `Le logo n'a pas de texte de remplacement en ${LANGUAGE_NAMES[locale]} : c'est ce qu'on lit quand les images sont bloquées (RGAA). Écrivez le nom de l'enseigne.`,
          },
        ]
      : [],
  );
}

/**
 * **Les règles de publication** : la forme, plus un logo choisi avec son
 * texte de remplacement dans chaque langue de l'espace, et un contraste d'au
 * moins 4,5:1 sur chaque paire texte / fond (texte, texte secondaire, liens,
 * texte des boutons sur la couleur principale ; texte en sombre).
 */
export function validateMailCharterForPublication(
  settings: MailCharterSettings,
  locales: readonly MailLocale[],
): readonly MailCharterViolation[] {
  return [
    ...validateMailCharter(settings),
    ...logoPublicationViolations(settings, locales),
    ...contrastViolations(settings),
  ];
}
