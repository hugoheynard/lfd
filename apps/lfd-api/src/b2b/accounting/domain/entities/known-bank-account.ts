import { AccountAlreadyKnownToBankError } from "../errors/account-bank-export-errors.js";
import type { KnownAccountFingerprints } from "../ports/account-bank-exports.reader.js";
import type { StaffStamp } from "./collection-batch.js";

export interface KnownBankAccountState {
  readonly id: string;
  /** L'entité depuis laquelle le geste est fait — sa fiche porte la carte. */
  readonly legalEntityId: string;
  readonly bankAccountId: string;
  readonly companyId: string;
  /** SHA-256 hex de l'IBAN normalisé — jamais l'IBAN. */
  readonly accountFingerprint: string;
  readonly declared: StaffStamp;
}

export interface DeclareKnownBankAccountInput extends KnownBankAccountState {
  /** Pour nommer le compte dans un refus. */
  readonly companyName: string;
}

/**
 * **« Déjà connu de la banque »** — un compte que la banque a reçu sans notre
 * fichier : saisi à la main dans CENET, ou importé depuis le fichier que CENET
 * produit à la vérification des mandats (doc `prerequis-export-ribs.md`
 * § 2.6). Sans cette déclaration, il ressortirait « à exporter » et ferait
 * rejeter TOUT le fichier suivant (réponse 8).
 *
 * L'invariant : une empreinte déjà connue — importée, déclarée, ou dans un
 * export en vol — ne se déclare pas. Le second cas est aussi tenu en base
 * (une empreinte déclarée une seule fois).
 */
export class KnownBankAccount {
  private constructor(private readonly state: KnownBankAccountState) {}

  /** @throws {AccountAlreadyKnownToBankError} */
  static declare(
    input: DeclareKnownBankAccountInput,
    fingerprints: KnownAccountFingerprints,
  ): KnownBankAccount {
    const fingerprint = input.accountFingerprint;
    if (fingerprints.known.has(fingerprint) || fingerprints.inFlight.has(fingerprint)) {
      throw new AccountAlreadyKnownToBankError(input.companyName);
    }
    return new KnownBankAccount({
      id: input.id,
      legalEntityId: input.legalEntityId,
      bankAccountId: input.bankAccountId,
      companyId: input.companyId,
      accountFingerprint: fingerprint,
      declared: input.declared,
    });
  }

  toPersistence(): KnownBankAccountState {
    return this.state;
  }
}
