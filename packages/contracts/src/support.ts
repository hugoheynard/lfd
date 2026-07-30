import { z } from "zod";

/**
 * Contrat de fil d'une **demande de support à l'activation** : le client demande
 * à être contacté par l'équipe commerciale, par téléphone (avec un créneau) ou
 * par e-mail.
 */

/** Canal de contact souhaité. */
export const supportChannelSchema = z.enum(["phone", "email"]);
export type SupportChannel = z.infer<typeof supportChannelSchema>;

/** Demi-journée d'un créneau de rappel. */
export const supportSlotSchema = z.enum(["morning", "afternoon"]);
export type SupportSlot = z.infer<typeof supportSlotSchema>;

/**
 * Demande de support. Pour un rappel (`phone`) : le numéro et la disponibilité —
 * « au plus vite » (`asap`) ou un créneau daté (`scheduledDate` + `slot`). Pour
 * un e-mail (`email`) : rien de plus, on répond à l'adresse du compte. Un message
 * libre optionnel accompagne les deux.
 */
export const activationSupportPayloadSchema = z.object({
  channel: supportChannelSchema,
  phoneNumber: z.string().default(""),
  asap: z.boolean().default(true),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ")
    .nullable()
    .default(null),
  slot: supportSlotSchema.nullable().default(null),
  message: z.string().default(""),
});
export type ActivationSupportPayload = z.infer<typeof activationSupportPayloadSchema>;
