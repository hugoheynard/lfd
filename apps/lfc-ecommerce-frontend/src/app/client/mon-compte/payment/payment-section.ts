import type { CompanyMemberRole, CompanyView } from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

import { directDebitSuspended, MONTHLY, settlesOnAccount } from '../../../account/account.model';
import type { AccountCopy } from '../../copy/screens/account.copy';

export { MONTHLY };

/**
 * Où en est le crédit mensuel d'une société, tel que `/me` le dit — et rien de
 * plus : `CompanyView` porte les termes ACCORDÉS et le terme DEMANDÉ, ni date
 * d'accord ni plafond.
 *
 * - `granted` : le commercial l'a accordé, et il s'exerce ;
 * - `suspended` : accordé, mais la comptabilité a suspendu le prélèvement —
 *   les commandes se règlent par carte, le crédit n'est pas retiré ;
 * - `requested` : le client l'a demandé, le commercial n'a pas tranché ;
 * - `none` : ni l'un ni l'autre.
 */
export type MonthlyTermState = 'granted' | 'suspended' | 'requested' | 'none';

/**
 * Les rôles qui demandent un crédit : ceux que l'API laisse écrire (vérifié le
 * 2026-09-14, `request-payment-term.handler.ts` → `ensureCompanyAdmin`).
 */
const TERM_REQUEST_ROLES: ReadonlySet<CompanyMemberRole> = new Set(['owner', 'admin']);

export function monthlyTermState(company: CompanyView | null): MonthlyTermState {
  if (company === null) {
    return 'none';
  }
  if (settlesOnAccount(company)) {
    return 'granted';
  }
  if (directDebitSuspended(company)) {
    return 'suspended';
  }
  return company.requestedTerm === MONTHLY ? 'requested' : 'none';
}

/**
 * Demander n'a de sens que s'il n'y a rien d'accordé ni d'attendu : redemander
 * un terme accordé RETIRE la demande côté serveur (`Company.requestTerm`,
 * vérifié le 2026-09-14), et le contrat n'offre pas de quoi retirer une
 * demande en cours.
 */
export function canRequestMonthly(company: CompanyView | null): boolean {
  return (
    company !== null && TERM_REQUEST_ROLES.has(company.role) && monthlyTermState(company) === 'none'
  );
}

/** Ce que la pastille et la phrase disent, par état. Une table : trois états, trois lignes. */
export function monthlyTermView(
  state: MonthlyTermState,
  copy: AccountCopy,
): { readonly badge: string; readonly variant: FoldBadgeVariant; readonly note: string } {
  switch (state) {
    case 'granted':
      return { badge: copy.stateActive, variant: 'success', note: copy.termGrantedSub };
    case 'suspended':
      return { badge: copy.stateSuspended, variant: 'warning', note: copy.termSuspendedSub };
    case 'requested':
      return { badge: copy.stateRequested, variant: 'warning', note: copy.termRequestedSub };
    case 'none':
      return { badge: copy.stateUnavailable, variant: 'neutral', note: copy.termNoneSub };
  }
}
