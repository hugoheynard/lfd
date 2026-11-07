import {
  MAX_SENDER_ADDRESS_LENGTH,
  MAX_SENDER_NAME_LENGTH,
  type MailSenderPayload,
} from "@lfd/mail-blocks";
import { z } from "zod";

/*
 * La FORME de la charge de l'identité d'envoi (`@lfd/mail-blocks`). Les
 * règles — adresse bien formée, nom sans caractère qui casse l'en-tête,
 * domaine vérifié — sont celles de l'agrégat : ce schéma ne les répète pas.
 */
export const mailSenderPayloadSchema: z.ZodType<MailSenderPayload> = z.strictObject({
  identity: z.strictObject({
    senderName: z.string().max(MAX_SENDER_NAME_LENGTH * 2),
    fromAddress: z.string().trim().min(1).max(MAX_SENDER_ADDRESS_LENGTH),
    replyToAddress: z.string().trim().min(1).max(MAX_SENDER_ADDRESS_LENGTH).nullable(),
  }),
  expectedRevision: z.number().int().min(0),
});
