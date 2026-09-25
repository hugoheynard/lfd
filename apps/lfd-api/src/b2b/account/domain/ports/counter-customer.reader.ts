import type { CounterCustomerCard } from "@lfd/contracts";

export type { CounterCustomerCard } from "@lfd/contracts";

/**
 * Port de **lecture** du Comptoir (ISP : distinct de `CompanyRepository`, qui
 * écrit, et d'`AdminCompanyReader`, qui sert la fiche entière).
 *
 * Il ne rend que la **carte** d'une société `active` — le seul statut qui
 * commande au prix pro. Cross-tenant par nature : le vendeur sert tous les
 * clients, gardé en amont par `@AdminSurface("b2b_counter")`. Plan :
 * `documentation/order/plan-commande-au-comptoir.md`.
 */
export abstract class CounterCustomerReader {
  /** Les sociétés actives, par enseigne puis raison sociale. */
  abstract listActive(): Promise<readonly CounterCustomerCard[]>;

  /**
   * La carte d'une société **active**, ou `null` — inconnue et non active se
   * confondent ici : le comptoir ne distingue pas un compte suspendu d'un
   * compte absent.
   */
  abstract activeCard(companyId: string): Promise<CounterCustomerCard | null>;
}
