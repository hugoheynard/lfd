import type { KnownBankAccountReason } from "../../domain/entities/known-bank-account.js";

/**
 * Déclare un compte connu de la banque, sans fichier, et pourquoi (doc
 * `prerequis-export-ribs.md` § 2.6) — saisi à la main dans CENET
 * (`entered_in_cenet`), ou signalé comme déjà connu par le compte rendu
 * d'import ou la banque (`reported_by_bank`). Rend l'id de la déclaration.
 */
export class DeclareBankAccountKnownCommand {
  constructor(
    readonly legalEntityId: string,
    readonly bankAccountId: string,
    readonly reason: KnownBankAccountReason,
    readonly staffUserId: string,
  ) {}
}
