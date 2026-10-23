import type { AccountForBankExport } from "../../ports/accounts-for-bank-export.reader.js";

export const IBAN_A = "FR7630004000031234567890143";
export const IBAN_B = "FR1420041010050500013M02606";
export const IBAN_DE = "DE89370400440532013000";

/**
 * Un compte débité, tel que `payments` le rend. `recordedAt` n'est comparé
 * qu'aux autres comptes de la fixture (l'ordre de dépôt), jamais à l'horloge.
 */
export function debitedAccount(
  id: string,
  over: Partial<AccountForBankExport> = {},
): AccountForBankExport {
  return {
    bankAccountId: `rib_${id}`,
    companyId: `cmp_${id}`,
    companyName: `Société ${id}`,
    siren: "552100554",
    holder: `Titulaire ${id}`,
    addressLine1: "1 rue du Test",
    addressLine2: "",
    postalCode: "73000",
    city: "Chambéry",
    countryCode: "FR",
    iban: IBAN_A,
    bic: "BNPAFRPPXXX",
    ibanLast4: IBAN_A.slice(-4),
    recordedAt: new Date("2026-09-01T10:00:00.000Z"),
    ...over,
  };
}
