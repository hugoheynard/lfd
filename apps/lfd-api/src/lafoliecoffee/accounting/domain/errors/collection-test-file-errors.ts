import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus d'un **envoi d'essai** — un fichier, plusieurs débiteurs (plan
 * `documentation/comptabilite/prelevement/plan-essai-a-plusieurs-debiteurs.md`).
 * Ce que chaque ligne refuse seule reste dans `collection-test-errors.ts`.
 */

/** Aucun établissement coché. */
export class CollectionTestFileEmptyError extends DomainError {
  constructor() {
    super(
      "accounting.collection_test.file_empty",
      "Aucun établissement choisi : un envoi d'essai débite au moins un de nos établissements. Cocher un établissement, puis générer.",
    );
  }
}

/** Plus de lignes qu'un envoi d'essai n'en admet (Hugo, 2026-11-18). */
export class CollectionTestFileTooManyDebtorsError extends DomainError {
  constructor(
    readonly count: number,
    readonly max: number,
  ) {
    super(
      "accounting.collection_test.file_too_many_debtors",
      `Envoi refusé (${String(count)} établissements) : un envoi d'essai débite au plus ${String(max)} établissements. Décocher des établissements, ou faire un second envoi.`,
    );
  }
}

/** Le même établissement coché deux fois. */
export class CollectionTestFileDuplicateDebtorError extends DomainError {
  constructor(readonly companyName: string) {
    super(
      "accounting.collection_test.file_duplicate_debtor",
      `Envoi refusé : « ${companyName} » y figure deux fois, et un envoi d'essai débite chaque établissement une seule fois. Ne garder qu'une ligne pour lui.`,
    );
  }
}

/** Deux entités créancières : le fichier n'en nomme qu'une. */
export class CollectionTestFileMixedCreditorsError extends BusinessError {
  constructor(
    readonly companyName: string,
    readonly mandateReference: string,
  ) {
    super(
      "accounting.collection_test.file_mixed_creditors",
      `Envoi refusé : le mandat ${mandateReference} de « ${companyName} » est signé chez une autre de nos entités que les autres lignes, et un fichier de prélèvement n'a qu'un créancier. Faire un envoi par entité.`,
    );
  }
}

/** Des mandats CORE et B2B : le fichier n'a qu'un schéma (Hugo, 2026-11-18). */
export class CollectionTestFileMixedSchemesError extends BusinessError {
  constructor(
    readonly companyName: string,
    readonly scheme: string,
    readonly fileScheme: string,
  ) {
    super(
      "accounting.collection_test.file_mixed_schemes",
      `Envoi refusé : « ${companyName} » se prélève en ${scheme}, les autres lignes en ${fileScheme}, et un envoi d'essai ne mélange jamais CORE et B2B. Faire un envoi par schéma.`,
    );
  }
}

/** Envoi inconnu. */
export class CollectionTestFileNotFoundError extends ResourceNotFoundError {
  constructor(readonly fileId: string) {
    super(
      "accounting.collection_test.file_not_found",
      `Envoi d'essai introuvable (« ${fileId} ») : il n'existe pas. Recharger la liste des essais.`,
    );
  }
}
