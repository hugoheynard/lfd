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

/** Le nom et la forme juridique du payeur figés sur la pièce ; illisibles : refus technique. */
export function invoicePayerOf(
  invoiceId: string,
  buyer: unknown,
): { readonly name: string; readonly legalForm: string } {
  const parsed = invoiceBuyerSchema.safeParse(buyer);
  if (!parsed.success) {
    throw new UnreadableInvoiceError(invoiceId, "buyer");
  }
  return { name: parsed.data.name, legalForm: parsed.data.legalForm };
}
