import {
  CALLOUT_TONES,
  IMAGE_FORMATS,
  IMAGE_WIDTHS,
  isColumnWidthStep,
  MAIL_LOCALES,
  MODEL_SECTIONS,
  type ColumnWidthStep,
  type FreeBlock,
  type MailBlock,
  type MailDocument,
} from "@lfd/mail-blocks";
import { z } from "zod";

/** Une clé du registre : la longueur de la colonne `template`. */
const TEMPLATE_MAX = 80;
const ID_MAX = 120;
const TEXT_MAX = 4_000;
const HREF_MAX = 2_000;

const blockId = z.string().min(1).max(ID_MAX);
const localized = z.partialRecord(z.enum(MAIL_LOCALES), z.string().max(TEXT_MAX));
const widthStep = z.custom<ColumnWidthStep>(
  (value) => typeof value === "number" && isColumnWidthStep(value),
  { message: "une largeur de colonne est 25, 33, 50, 67 ou 75" },
);

const textBlock = z.strictObject({
  id: blockId,
  kind: z.enum(["heading", "paragraph"]),
  text: localized,
});
const calloutBlock = z.strictObject({
  id: blockId,
  kind: z.literal("callout"),
  tone: z.enum(CALLOUT_TONES),
  text: localized,
});
const buttonBlock = z.strictObject({
  id: blockId,
  kind: z.literal("button"),
  label: localized,
  href: z.string().max(HREF_MAX),
});
const dividerBlock = z.strictObject({ id: blockId, kind: z.literal("divider") });
const imageBlock = z.strictObject({
  id: blockId,
  kind: z.literal("image"),
  src: z.string().max(HREF_MAX),
  alt: localized,
  href: z.string().max(HREF_MAX).exactOptional(),
  decorative: z.boolean().exactOptional(),
  format: z.enum(IMAGE_FORMATS).exactOptional(),
  // La forme seulement : « entre 0 et 1 » est la règle du paquet (`image-focal-invalid`).
  focal: z.strictObject({ x: z.number(), y: z.number() }).exactOptional(),
  width: z.enum(IMAGE_WIDTHS).exactOptional(),
  copySrc: z.string().max(HREF_MAX).exactOptional(),
});

const freeBlock: z.ZodType<FreeBlock> = z.discriminatedUnion("kind", [
  textBlock,
  calloutBlock,
  buttonBlock,
  dividerBlock,
  imageBlock,
]);

const mailBlock: z.ZodType<MailBlock> = z.union([
  z.strictObject({ id: blockId, kind: z.literal("model"), section: z.enum(MODEL_SECTIONS) }),
  freeBlock,
  z.strictObject({
    id: blockId,
    kind: z.literal("columns"),
    widths: z.array(widthStep),
    cells: z.array(z.array(freeBlock)),
  }),
]);

/**
 * **La forme d'un document d'e-mail** (`@lfd/mail-blocks`) — vérifiée à
 * l'entrée d'une route et à la relecture d'une colonne `jsonb`. Elle ne tient
 * que la FORME : les règles (blocs du modèle présents une fois, colonnes,
 * adresses, textes par langue) sont celles du paquet, opposées par l'agrégat
 * (`validateMailDocument`).
 */
export const mailDocumentShape: z.ZodType<MailDocument> = z.strictObject({
  template: z.string().min(1).max(TEMPLATE_MAX),
  blocks: z.array(mailBlock),
});

/** Relit un document rangé ; `null` s'il n'a pas la forme d'un document. */
export function parseMailDocument(raw: unknown): MailDocument | null {
  const parsed = mailDocumentShape.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
