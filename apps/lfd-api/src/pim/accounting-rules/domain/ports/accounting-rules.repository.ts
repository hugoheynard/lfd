import type { WriteTicket } from "../../../journal/pim-journal.js";
import type { AccountingRules } from "../entities/accounting-rules.js";

/** Ce que le dépôt rend en plus de l'agrégat : quand la règle a bougé. */
export interface AccountingRulesRecord {
  readonly rules: AccountingRules;
  readonly updatedAt: Date;
}

/**
 * Port : l'application dépend de cette abstraction, jamais de Prisma.
 *
 * `read()` rend `null` quand **rien n'a jamais été réglé** — et c'est le seul
 * moyen honnête de le dire. Rendre un agrégat par défaut à 100 % ferait
 * disparaître la distinction entre « la maison a décidé que le pro paie le prix
 * public » et « personne n'a rien décidé », qui n'ont pas du tout le même sens
 * sur une facture.
 */
export abstract class AccountingRulesRepository {
  abstract read(): Promise<AccountingRulesRecord | null>;
  /** Pose ou remplace le réglage unique. Crée la ligne au premier appel. */
  abstract save(rules: AccountingRules, ticket: WriteTicket): Promise<void>;
}
