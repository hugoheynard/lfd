import { MAIL_LOCALES, type MailCharterSettings } from "@lfd/mail-blocks";
import { z } from "zod";

/*
 * La FORME d'une charte (`MailCharterSettings`), partagée par les charges
 * des routes et la relecture des colonnes `jsonb`. Les règles (couleurs
 * `#rrggbb`, contraste, police de secours) sont celles de l'agrégat : ce
 * schéma ne les répète pas, il borne les longueurs.
 */

const COLOR_MAX = 16;
const URL_MAX = 2_000;
const NAME_MAX = 200;
const TEXT_MAX = 2_000;

const color = z.string().max(COLOR_MAX);
const localized = z.partialRecord(z.enum(MAIL_LOCALES), z.string().max(TEXT_MAX));

export const mailCharterSettingsShape: z.ZodType<MailCharterSettings> = z.strictObject({
  logo: z.strictObject({ src: z.string().max(URL_MAX), alt: localized }).nullable(),
  colors: z.strictObject({
    page: color,
    card: color,
    text: color,
    mutedText: color,
    primary: color,
    band: color,
    border: color,
  }),
  darkColors: z.strictObject({ page: color, card: color, text: color, border: color }),
  headingFont: z
    .strictObject({
      family: z.string().max(NAME_MAX),
      url: z.string().max(URL_MAX),
      fallback: z.string().max(NAME_MAX),
    })
    .nullable(),
  footer: localized,
});

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Une charte rangée avant la couleur du bandeau (2026-11-07) rendait son
 * bandeau dans la couleur principale : relue, elle la garde comme bandeau —
 * le rendu ne change pas.
 */
function withStoredBand(raw: unknown): unknown {
  if (!isRecord(raw)) {
    return raw;
  }
  const colors = raw["colors"];
  if (!isRecord(colors) || "band" in colors) {
    return raw;
  }
  return { ...raw, colors: { ...colors, band: colors["primary"] } };
}

/** Relit une charte rangée ; `null` si elle n'en a plus la forme. */
export function parseMailCharterSettings(raw: unknown): MailCharterSettings | null {
  const parsed = mailCharterSettingsShape.safeParse(withStoredBand(raw));
  return parsed.success ? parsed.data : null;
}
