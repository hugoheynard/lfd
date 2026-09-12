import type { CompanyBankAccount as CompanyBankAccountRow } from "../../../platform/database/client/client.js";
import type { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import {
  CompanyBankAccount,
  type CompanyBankAccountSnapshot,
} from "../domain/entities/company-bank-account.js";

/** Ce qu'on garde en clair pour reconnaître un compte. */
const LAST4_LENGTH = 4;

/** Les colonnes qu'une écriture pose — sans l'identité, commune à create et update. */
export interface CompanyBankAccountColumns {
  readonly holder: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly postalCode: string;
  readonly city: string;
  readonly countryCode: string;
  readonly ibanSealed: string;
  readonly ibanLast4: string;
  readonly bic: string;
  readonly debtorReference: string;
  readonly contractNumber: string;
  readonly contractDescription: string;
}

/**
 * Agrégat → colonnes, **en scellant l'IBAN**.
 *
 * 🔴 Fonction pure et exportée, plutôt que méthode privée de l'adaptateur. La
 * raison n'est pas l'esthétique : c'est la seule frontière du dépôt où un IBAN
 * de client passe du clair au scellé, et une méthode privée d'une classe qui
 * injecte `PrismaService` ne se teste qu'en fabriquant un faux client Prisma —
 * donc avec un cast que `lint:no-type-escapes` refuse. Rendue pure, elle
 * s'éprouve avec le VRAI chiffrement et sans une seule ligne d'échafaudage.
 *
 * ⚠️ `ibanLast4` est **dérivé** du clair ici, jamais reçu. Le laisser fournir
 * par l'appelant permettrait à un `last4` de diverger de l'IBAN qu'il résume —
 * et c'est ce `last4` qu'une zone de danger fait taper pour confirmer.
 */
export function toColumns(
  snapshot: CompanyBankAccountSnapshot,
  cipher: FieldCipher,
): CompanyBankAccountColumns {
  return {
    holder: snapshot.holder,
    addressLine1: snapshot.addressLine1,
    addressLine2: snapshot.addressLine2,
    postalCode: snapshot.postalCode,
    city: snapshot.city,
    countryCode: snapshot.countryCode,
    ibanSealed: cipher.seal(snapshot.iban),
    ibanLast4: snapshot.iban.slice(-LAST4_LENGTH),
    bic: snapshot.bic,
    // Les zones facultatives du mandat ne sont PAS scellées : elles ne
    // désignent aucun compte, et l'écran les relit telles quelles.
    debtorReference: snapshot.debtorReference,
    contractNumber: snapshot.contractNumber,
    contractDescription: snapshot.contractDescription,
  };
}

/**
 * Ligne → agrégat, **en ouvrant le scellé**.
 *
 * Les value objects revalident au passage : une ligne écrite par une main tierce
 * est refusée à la relecture plutôt que promenée dans le domaine.
 */
export function toDomain(row: CompanyBankAccountRow, cipher: FieldCipher): CompanyBankAccount {
  return CompanyBankAccount.reconstitute({
    id: row.id,
    companyId: row.companyId,
    holder: row.holder,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    postalCode: row.postalCode,
    city: row.city,
    countryCode: row.countryCode,
    iban: cipher.open(row.ibanSealed),
    bic: row.bic,
    debtorReference: row.debtorReference,
    contractNumber: row.contractNumber,
    contractDescription: row.contractDescription,
  });
}
