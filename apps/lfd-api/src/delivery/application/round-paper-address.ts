import type { BillingAddressPayload } from "@lfd/contracts";

/** Les lignes postales, sans les champs vides — comme la feuille de route. */
export function addressLinesOf(address: BillingAddressPayload | null): readonly string[] {
  if (address === null) {
    return [];
  }
  return [address.ligne1, address.ligne2, `${address.codePostal} ${address.ville}`].filter(
    (line) => line.trim() !== "",
  );
}
