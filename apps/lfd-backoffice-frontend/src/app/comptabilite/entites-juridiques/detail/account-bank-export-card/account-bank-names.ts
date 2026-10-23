import type { AccountBankRowView } from '@lfd/contracts';

/** Ce que la colonne « Société » montre d'un compte, ligne par ligne. */
export interface AccountBankNames {
  /** L'enseigne si la société en déclare une, sinon sa raison sociale. */
  readonly headline: string;
  /** La raison sociale, seulement quand l'enseigne occupe la première ligne. */
  readonly legalName: string | null;
  /** Le titulaire du RIB, seulement quand il diffère de la raison sociale. */
  readonly holder: string | null;
}

/** Sans casse, sans accents, sans espaces : « SAS Les Tommeuses » = « sas les  tommeuses ». */
function folded(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, '').toLocaleLowerCase('fr');
}

/** Vrai quand deux noms ne diffèrent que par la casse, les accents ou les espaces. */
export function sameName(a: string, b: string): boolean {
  return folded(a) === folded(b);
}

/**
 * Enseigne d'abord, nom légal ensuite, titulaire du RIB enfin — et jamais deux
 * fois le même nom : le titulaire ne se montre que s'il apprend quelque chose.
 */
export function accountBankNames(
  row: Pick<AccountBankRowView, 'companyName' | 'tradeName' | 'holder'>,
): AccountBankNames {
  const tradeName = row.tradeName?.trim() ?? '';
  return {
    headline: tradeName === '' ? row.companyName : tradeName,
    legalName: tradeName === '' ? null : row.companyName,
    holder: sameName(row.holder, row.companyName) ? null : row.holder,
  };
}
