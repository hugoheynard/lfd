import type {
  MailDocumentDraftPayload,
  MailDocumentPreviewPayload,
  MailDocumentPublishPayload,
  MailDocumentRevertPayload,
} from "@lfd/mail-blocks";
import { MAIL_LOCALES } from "@lfd/mail-blocks";
import { z } from "zod";

import { mailDocumentShape } from "../application/mail-document-shape.js";

/*
 * La FORME des charges des routes de l'éditeur (`@lfd/mail-blocks`). Les
 * règles du document sont celles de l'agrégat : ces schémas ne les répètent
 * pas.
 */

const revision = z.number().int().min(0);

export const mailDocumentDraftPayloadSchema: z.ZodType<MailDocumentDraftPayload> = z.strictObject({
  document: mailDocumentShape,
  expectedRevision: revision,
});

export const mailDocumentPublishPayloadSchema: z.ZodType<MailDocumentPublishPayload> =
  z.strictObject({ expectedRevision: revision });

export const mailDocumentRevertPayloadSchema: z.ZodType<MailDocumentRevertPayload> = z.strictObject(
  { expectedRevision: revision },
);

export const mailDocumentPreviewPayloadSchema: z.ZodType<MailDocumentPreviewPayload> =
  z.strictObject({
    locale: z.enum(MAIL_LOCALES),
    source: z.enum(["draft", "published"]),
    document: mailDocumentShape.optional(),
  });
