import {
  CHARTER_CONTRAST_PAIRS,
  contrastRatio,
  isHexColor,
  MIN_TEXT_CONTRAST,
  type MailCharterColors,
  type MailCharterDarkColors,
  type MailCharterFont,
  type MailCharterSettings,
  type MailCharterViolation,
  type MailLocale,
} from '@lfd/mail-blocks';

/**
 * **Les gestes de la page « Charte »** (plan `plan-editeur-par-blocs.md`,
 * § 25, C2) : chacun rend une NOUVELLE charte — l'écran compare par
 * identité pour savoir si elle a bougé. Aucune règle ici : les refus sont
 * ceux de `validate-charter` (`@lfd/mail-blocks`), que la page affiche
 * champ par champ.
 */

/** Une couleur de la charte : claire (`colors`) ou sombre (`darkColors`). */
export type CharterColorSlot =
  | { readonly palette: 'colors'; readonly key: keyof MailCharterColors }
  | { readonly palette: 'darkColors'; readonly key: keyof MailCharterDarkColors };

/** Un champ de couleur, tel que la page le montre. */
export interface CharterColorField {
  readonly slot: CharterColorSlot;
  /** Le chemin du refus (`colors.text`) : celui de `MailCharterViolation.field`. */
  readonly field: string;
  readonly label: string;
}

const LIGHT_LABELS: Readonly<Record<keyof MailCharterColors, string>> = {
  page: 'Fond de page',
  card: 'Fond de la carte',
  text: 'Texte',
  mutedText: 'Texte secondaire',
  primary: 'Couleur principale (boutons, liens)',
  band: 'Bandeau (en-tête, enseigne en blanc)',
  border: 'Filets',
};

const DARK_LABELS: Readonly<Record<keyof MailCharterDarkColors, string>> = {
  page: 'Fond de page',
  card: 'Fond de la carte',
  text: 'Texte',
  border: 'Filets',
};

export const LIGHT_COLOR_FIELDS: readonly CharterColorField[] = (
  ['page', 'card', 'text', 'mutedText', 'primary', 'band', 'border'] as const
).map((key) => ({
  slot: { palette: 'colors', key },
  field: `colors.${key}`,
  label: LIGHT_LABELS[key],
}));

export const DARK_COLOR_FIELDS: readonly CharterColorField[] = (
  ['page', 'card', 'text', 'border'] as const
).map((key) => ({
  slot: { palette: 'darkColors', key },
  field: `darkColors.${key}`,
  label: DARK_LABELS[key],
}));

/** La valeur d'une couleur de la charte. */
export function colorOf(settings: MailCharterSettings, slot: CharterColorSlot): string {
  return slot.palette === 'colors' ? settings.colors[slot.key] : settings.darkColors[slot.key];
}

export function withColor(
  settings: MailCharterSettings,
  slot: CharterColorSlot,
  value: string,
): MailCharterSettings {
  return slot.palette === 'colors'
    ? { ...settings, colors: { ...settings.colors, [slot.key]: value } }
    : { ...settings, darkColors: { ...settings.darkColors, [slot.key]: value } };
}

/** Le logo choisi dans la médiathèque ; le texte de remplacement déjà écrit est gardé. */
export function withLogoSource(settings: MailCharterSettings, src: string): MailCharterSettings {
  return { ...settings, logo: { src, alt: settings.logo?.alt ?? {} } };
}

/** Le logo d'origine (`null`) : celui que les e-mails portent aujourd'hui, joint en ligne. */
export function withOriginalLogo(settings: MailCharterSettings): MailCharterSettings {
  return { ...settings, logo: null };
}

export function withLogoAlt(
  settings: MailCharterSettings,
  locale: MailLocale,
  alt: string,
): MailCharterSettings {
  return settings.logo === null
    ? settings
    : { ...settings, logo: { ...settings.logo, alt: { ...settings.logo.alt, [locale]: alt } } };
}

export function withFooter(
  settings: MailCharterSettings,
  locale: MailLocale,
  footer: string,
): MailCharterSettings {
  return { ...settings, footer: { ...settings.footer, [locale]: footer } };
}

/** Une police des titres, vide à remplir ; `null` : aucune police web. */
export function withHeadingFont(
  settings: MailCharterSettings,
  font: MailCharterFont | null,
): MailCharterSettings {
  return { ...settings, headingFont: font };
}

export function withHeadingFontField(
  settings: MailCharterSettings,
  key: keyof MailCharterFont,
  value: string,
): MailCharterSettings {
  return settings.headingFont === null
    ? settings
    : { ...settings, headingFont: { ...settings.headingFont, [key]: value } };
}

/** Les refus rangés par réglage (`colors.text` → ses refus), dans l'ordre du paquet. */
export function violationsByField(
  violations: readonly MailCharterViolation[],
): ReadonlyMap<string, readonly MailCharterViolation[]> {
  const byField = new Map<string, MailCharterViolation[]>();
  for (const violation of violations) {
    byField.set(violation.field, [...(byField.get(violation.field) ?? []), violation]);
  }
  return byField;
}

/** Une paire texte / fond, et son rapport de contraste calculé. */
export interface ContrastLine {
  readonly label: string;
  /** `null` : une des deux couleurs est mal formée, rien à calculer. */
  readonly ratio: number | null;
  readonly passes: boolean;
}

/**
 * Le rapport de chaque paire que la publication contrôle — la liste du
 * paquet (`CHARTER_CONTRAST_PAIRS`), la même que lisent les refus : la page
 * montre aussi les rapports qui PASSENT.
 */
export function contrastReport(settings: MailCharterSettings): readonly ContrastLine[] {
  return CHARTER_CONTRAST_PAIRS.map((pair) => {
    const foreground = pair.foreground(settings);
    const background = pair.background(settings);
    const ratio =
      isHexColor(foreground) && isHexColor(background)
        ? contrastRatio(foreground, background)
        : null;
    return { label: pair.label, ratio, passes: ratio !== null && ratio >= MIN_TEXT_CONTRAST };
  });
}

/** « 4,52:1 » — à la française, comme les refus du paquet. */
export function ratioLabel(ratio: number): string {
  return `${ratio.toFixed(2).replace('.', ',')}:1`;
}
