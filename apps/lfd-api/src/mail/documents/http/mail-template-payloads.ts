import type {
  MailDocumentCasePreviewPayload,
  MailDocumentDraftPayload,
  MailDocumentPublishPayload,
  MailDocumentRevertPayload,
  MailDocumentTrialPayload,
  MailPhraseDraftPayload,
  MailPhraseResetPayload,
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
/** L'identifiant d'un cas de l'e-mail (`MailEditorView.cases`), borné. */
const caseId = z.string().trim().min(1).max(80);

export const mailDocumentDraftPayloadSchema: z.ZodType<MailDocumentDraftPayload> = z.strictObject({
  document: mailDocumentShape,
  expectedRevision: revision,
});

export const mailDocumentPublishPayloadSchema: z.ZodType<MailDocumentPublishPayload> =
  z.strictObject({ expectedRevision: revision });

export const mailDocumentRevertPayloadSchema: z.ZodType<MailDocumentRevertPayload> = z.strictObject(
  { expectedRevision: revision },
);

/** Le cas est facultatif : sans lui, l'exemple de l'e-mail, comme avant S4d. */
export const mailDocumentPreviewPayloadSchema: z.ZodType<MailDocumentCasePreviewPayload> =
  z.strictObject({
    locale: z.enum(MAIL_LOCALES),
    source: z.enum(["draft", "published"]),
    document: mailDocumentShape.optional(),
    caseId: caseId.optional(),
  });

export const mailDocumentTrialPayloadSchema: z.ZodType<MailDocumentTrialPayload> = z.strictObject({
  locale: z.enum(MAIL_LOCALES),
  caseId: caseId.optional(),
});

/** Le chemin d'une phrase dans son e-mail (`subject`, `title.paid`), borné comme `admin/mail-copy`. */
const phrasePath = z.string().trim().min(1).max(200);

export const mailPhraseDraftPayloadSchema: z.ZodType<MailPhraseDraftPayload> = z.strictObject({
  path: phrasePath,
  locale: z.enum(MAIL_LOCALES),
  text: z.string(),
  expectedRevision: revision,
});

export const mailPhraseResetPayloadSchema: z.ZodType<MailPhraseResetPayload> = z.strictObject({
  path: phrasePath,
  locale: z.enum(MAIL_LOCALES),
  expectedRevision: revision,
});
