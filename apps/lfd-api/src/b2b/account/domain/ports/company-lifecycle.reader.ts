import type { CompanyStatus } from "../value-objects/company-status.js";

/**
 * **Où en est une société dans son cycle, maintenant** — la question que
 * l'avis au principal se pose à l'envoi (`plan-notifications-sous-comptes.md`,
 * Q2 : `suspended` est prévenu, `terminated` ne l'est pas). Port étroit (ISP) :
 * le statut, et rien d'autre.
 */
export abstract class CompanyLifecycleReader {
  /** `null` si la société n'existe pas. */
  abstract statusOf(companyId: string): Promise<CompanyStatus | null>;
}
