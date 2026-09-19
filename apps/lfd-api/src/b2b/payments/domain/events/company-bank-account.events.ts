import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { DebtorAccount } from "../value-objects/debtor-account.js";
import type { MandateActorChannel } from "./payment-mandate-facts.js";

/**
 * Fait : **le RIB d'une société est posé ou remplacé** —
 * `company.bank_account_changed`, par le staff comme par le client (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1 et §3
 * décision 1, 2026-09-19).
 *
 * Jusque-là, seul un brouillon de mandat révoqué laissait une trace
 * (`payment_mandate.draft_voided`) : sans brouillon, un changement de compte
 * bancaire — le compte que nous débitons — n'avait ni auteur ni date. Ce fait-ci
 * part à **chaque** écriture, brouillon ou non ; le fait du brouillon reste le
 * sien, sur un autre sujet (le mandat).
 *
 * Sujet `company` et non `company_bank_account` : le type se range sous le
 * module « comptes » par son préfixe, et c'est la fiche du client qu'on ouvre
 * pour demander « qui a changé son RIB ».
 *
 * 🔴 **Jamais les coordonnées** : le compte se relit par ses **quatre derniers
 * caractères** et son titulaire, comme l'écran l'affiche — ni IBAN, ni BIC, ni
 * adresse. Le journal se relit des années après, se filtre par recherche libre,
 * et une coordonnée bancaire n'a rien à y faire. ⚠️ Les faits du MANDAT, eux,
 * ne portent même pas `last4` (`payment-mandate-facts.ts`) : ils n'en ont pas
 * besoin, leur référence (RUM) suffit à les relier au papier.
 */
export const COMPANY_BANK_ACCOUNT_CHANGED =
  "company.bank_account_changed" satisfies JournalFactType;

/** Ce que le journal retient d'un RIB : de quoi le reconnaître, rien pour s'en servir. */
export interface BankAccountTrace {
  readonly last4: string;
  readonly holder: string;
}

/** La trace d'un RIB — le seul chemin d'un `DebtorAccount` vers le journal. */
export function bankAccountTraceOf(account: DebtorAccount): BankAccountTrace {
  return { last4: account.last4(), holder: account.holder };
}

/** Champ par champ, jamais par étalement : un objet plus large n'y ferait rien entrer. */
function traceOf(trace: BankAccountTrace): Record<string, unknown> {
  return { last4: trace.last4, holder: trace.holder };
}

export class CompanyBankAccountChangedEvent implements JournaledEvent {
  constructor(
    readonly bankAccountId: string,
    readonly companyId: string,
    /** `null` sur un premier dépôt. */
    readonly before: BankAccountTrace | null,
    readonly after: BankAccountTrace,
    readonly via: MandateActorChannel,
  ) {}

  journalFact(): JournalFact {
    return {
      type: COMPANY_BANK_ACCOUNT_CHANGED,
      subjectType: "company",
      subjectId: this.companyId,
      payload: {
        bankAccountId: this.bankAccountId,
        before: this.before === null ? null : traceOf(this.before),
        after: traceOf(this.after),
        via: this.via,
      },
    };
  }
}
