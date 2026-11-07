import {
  MAIL_LOCALES,
  type MailCharterDraftPayload,
  type MailCharterPreviewPayload,
  type MailCharterPublishPayload,
} from "@lfd/mail-blocks";
import { z } from "zod";

import { mailCharterSettingsShape } from "../application/mail-charter-shape.js";

/*
 * La FORME des charges des routes de la charte (`@lfd/mail-blocks`). Les
 * règles de la charte sont celles de l'agrégat : ces schémas ne les
 * répètent pas.
 */

const revision = z.number().int().min(0);

export const mailCharterDraftPayloadSchema: z.ZodType<MailCharterDraftPayload> = z.strictObject({
  settings: mailCharterSettingsShape,
  expectedRevision: revision,
});

export const mailCharterPublishPayloadSchema: z.ZodType<MailCharterPublishPayload> = z.strictObject(
  { expectedRevision: revision },
);

/** L'e-mail et les réglages sont facultatifs : sans eux, le premier e-mail et la charte ouverte. */
export const mailCharterPreviewPayloadSchema: z.ZodType<MailCharterPreviewPayload> = z.strictObject(
  {
    template: z.string().trim().min(1).max(80).optional(),
    locale: z.enum(MAIL_LOCALES),
    settings: mailCharterSettingsShape.optional(),
  },
);
