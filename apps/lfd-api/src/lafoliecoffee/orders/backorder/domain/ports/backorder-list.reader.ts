import type { AdminBackorderView, BackorderState } from "@lfd/contracts";

/** Ce que la liste filtre : un état, et une société ou toutes. */
export interface BackorderListFilter {
  readonly state: BackorderState;
  /** `null` : toutes les sociétés, et les reliquats de particuliers. */
  readonly companyId: string | null;
}

/**
 * Port de **lecture** de la liste « Reliquats à traiter » (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 5) :
 * du plus ancien au plus récent. Une société donnée pose `company_id` dans
 * le `where` ; un reliquat de particulier n'a pas de société et n'apparaît
 * que sans filtre — la surface est celle de l'équipe seule.
 */
export abstract class BackorderListReader {
  abstract list(filter: BackorderListFilter): Promise<readonly AdminBackorderView[]>;
}
