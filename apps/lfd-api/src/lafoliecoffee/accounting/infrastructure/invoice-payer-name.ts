import { UnreadableInvoiceError } from "../domain/errors/invoice-errors.js";
import { invoiceBuyerSchema } from "./invoice-json.schema.js";

/** Le nom du payeur figé sur la pièce (`buyer.name`) ; illisible : refus technique, jamais deviné. */
export function invoicePayerName(invoiceId: string, buyer: unknown): string {
  const parsed = invoiceBuyerSchema.safeParse(buyer);
  if (!parsed.success) {
    throw new UnreadableInvoiceError(invoiceId, "buyer");
  }
  return parsed.data.name;
}
