/** « Retrait » / « Livraison », en un mot — le fournil charge, il ne facture pas. */
export function methodLabel(method: "pickup" | "delivery"): string {
  return method === "pickup" ? "Retrait" : "Livraison";
}
