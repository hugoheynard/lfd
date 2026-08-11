import type { AccountAlertOverride, AlertKind } from "@lfd/contracts";

/**
 * Port des **dérogations d'un compte**. Il ne rend que ce qui est réellement
 * dérogé : composer avec le global est le travail de `resolveAccountRules`, pur
 * et testable sans base.
 */
export abstract class AccountAlertOverridesStore {
  abstract readForCompany(companyId: string): Promise<AccountAlertOverride[]>;

  abstract save(companyId: string, override: AccountAlertOverride): Promise<void>;

  /** Revenir au réglage global = **supprimer** la ligne, pas en écrire une neutre. */
  abstract clear(companyId: string, kind: AlertKind): Promise<void>;
}
