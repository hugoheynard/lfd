import { companyContactModeSchema, type CompanyContactMode } from "@lfd/contracts";
import { z } from "zod";

/** La charge d'un fait `company.contacted` : le mode et le jour noté de l'échange. */
const notedContactPayloadSchema = z.object({
  mode: companyContactModeSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export interface NotedContactPayload {
  readonly mode: CompanyContactMode;
  readonly date: string;
}

/**
 * Relit la charge d'un contact noté ; `null` pour une ligne qui n'a pas cette
 * forme — elle ne compte alors ni comme contact du jour ni comme premier
 * contact, plutôt que de recevoir un mode ou une date inventés.
 */
export function notedContactOf(payload: unknown): NotedContactPayload | null {
  const parsed = notedContactPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
