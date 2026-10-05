import type { MandateDebtorSnapshot } from "../entities/payment-mandate.js";

/** Le payeur d'un site qui suit `billing` — ce que ses écrans nomment, jamais plus. */
export interface BilledTo {
  readonly companyId: string;
  readonly name: string;
}

/**
 * Le débiteur qu'un mandat de cette société nommerait **à cet instant**, et le
 * compte qu'il débiterait (`plan-sous-comptes.md` §2.1 ter).
 */
export interface ResolvedMandateDebtor {
  /** Les mentions obligatoires — celles de la société du principal pour un site. */
  readonly debtor: MandateDebtorSnapshot;
  /** La société dont le RIB est débité : le payeur, ou le site en « RIB propre ». */
  readonly accountCompanyId: string;
  /** `null` = la société paie seule ; sinon, son payeur. */
  readonly billedTo: BilledTo | null;
}

/**
 * **L'identité RÉSOLUE du débiteur** (§2.1 ter, T9) : un site qui suit
 * `billing` n'a pas de SIREN, et son mandat nomme la société du principal.
 *
 * Un port à part de `PaymentMandateRepository` (ISP) : la frappe, ses deux
 * lectures et les routes client du §3 le lisent ; la persistance du mandat n'a
 * pas à le porter. La résolution est DATÉE — `company_follows` et
 * `company_collection_form` à `at` —, comme toute décision qui touche l'argent.
 */
export abstract class MandateDebtorReader {
  /** `null` si la société n'existe pas. */
  abstract resolve(companyId: string, at: Date): Promise<ResolvedMandateDebtor | null>;
}
