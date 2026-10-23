import {
  AccountAlreadyKnownToBankError,
  AccountInFlightNotEnterableError,
  AccountNotInDownloadedExportError,
  UnknownKnownAccountReasonError,
} from "../errors/account-bank-export-errors.js";
import type { KnownAccountFingerprints } from "../ports/account-bank-exports.reader.js";
import type { StaffStamp } from "./collection-batch.js";

/**
 * **Pourquoi la banque connaît un compte sans notre fichier** (doc
 * `prerequis-export-ribs.md` § 2.6, Hugo 2026-10-23). Des VALEURS : rangées en
 * base (CHECK) et dans le journal, elles ne se renomment pas.
 */
export const KNOWN_BANK_ACCOUNT_REASONS = {
  /** Nous l'avons saisi à la main dans CENET. */
  enteredInCenet: "entered_in_cenet",
  /** Le compte rendu d'import CENET, ou la banque, dit qu'il existe déjà. */
  reportedByBank: "reported_by_bank",
} as const;

export type KnownBankAccountReason =
  (typeof KNOWN_BANK_ACCOUNT_REASONS)[keyof typeof KNOWN_BANK_ACCOUNT_REASONS];

const REASONS: ReadonlySet<string> = new Set(Object.values(KNOWN_BANK_ACCOUNT_REASONS));

/** @throws {UnknownKnownAccountReasonError} */
export function knownBankAccountReason(value: string): KnownBankAccountReason {
  if (!isKnownBankAccountReason(value)) {
    throw new UnknownKnownAccountReasonError(value);
  }
  return value;
}

function isKnownBankAccountReason(value: string): value is KnownBankAccountReason {
  return REASONS.has(value);
}

export interface KnownBankAccountState {
  readonly id: string;
  /** L'entité depuis laquelle le geste est fait — sa fiche porte la carte. */
  readonly legalEntityId: string;
  readonly bankAccountId: string;
  readonly companyId: string;
  /** SHA-256 hex de l'IBAN normalisé — jamais l'IBAN. */
  readonly accountFingerprint: string;
  readonly declared: StaffStamp;
  readonly reason: KnownBankAccountReason;
}

export interface DeclareKnownBankAccountInput extends KnownBankAccountState {
  /** Pour nommer le compte dans un refus. */
  readonly companyName: string;
}

/**
 * **« Connu de la banque »** — un compte que la banque a reçu sans notre
 * fichier, et pourquoi : saisi à la main dans CENET, ou signalé comme déjà
 * connu par le compte rendu d'import ou la banque (doc
 * `prerequis-export-ribs.md` § 2.6). Sans cette déclaration, il ressortirait « à exporter » et ferait
 * rejeter TOUT le fichier suivant (réponse 8).
 *
 * Les invariants (Hugo 2026-10-23) : une empreinte déjà connue — importée ou
 * déclarée — ne se déclare pas (aussi tenu en base : une déclaration par
 * empreinte). « Saisi dans CENET » ne vaut que pour un compte À EXPORTER : en
 * vol, il part avec son fichier. « Signalé par la banque » ne vaut que pour un
 * compte d'un export DÉJÀ TÉLÉCHARGÉ : c'est le compte rendu d'import de ce
 * fichier qui le dit. L'export n'est pas touché ; marqué importé ensuite, le
 * compte reste « signalé », son tampon étant le plus ancien.
 */
export class KnownBankAccount {
  private constructor(private readonly state: KnownBankAccountState) {}

  /**
   * @throws {AccountAlreadyKnownToBankError} @throws {UnknownKnownAccountReasonError}
   * @throws {AccountInFlightNotEnterableError} @throws {AccountNotInDownloadedExportError}
   */
  static declare(
    input: DeclareKnownBankAccountInput,
    fingerprints: KnownAccountFingerprints,
  ): KnownBankAccount {
    const fingerprint = input.accountFingerprint;
    const reason = knownBankAccountReason(input.reason);
    if (fingerprints.known.has(fingerprint)) {
      throw new AccountAlreadyKnownToBankError(input.companyName);
    }
    if (
      reason === KNOWN_BANK_ACCOUNT_REASONS.enteredInCenet &&
      fingerprints.inFlight.has(fingerprint)
    ) {
      throw new AccountInFlightNotEnterableError(input.companyName);
    }
    if (
      reason === KNOWN_BANK_ACCOUNT_REASONS.reportedByBank &&
      !fingerprints.inDownloadedExport.has(fingerprint)
    ) {
      throw new AccountNotInDownloadedExportError(input.companyName);
    }
    return new KnownBankAccount({
      id: input.id,
      legalEntityId: input.legalEntityId,
      bankAccountId: input.bankAccountId,
      companyId: input.companyId,
      accountFingerprint: fingerprint,
      declared: input.declared,
      reason,
    });
  }

  toPersistence(): KnownBankAccountState {
    return this.state;
  }
}
