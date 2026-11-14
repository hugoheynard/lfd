import type { CompanyContactMode } from "@lfd/contracts";

import type { SalesChannel } from "../sales-oversight.js";
import type { ParisDay } from "../sales-today.js";

/**
 * À qui le récap du jour s'intéresse : un commercial (ses gestes) ou toute
 * l'équipe (`actor` absent — le filtre « non attribuée » compris), et le canal
 * d'ouverture des fiches.
 */
export interface SalesDayScope {
  readonly actor?: string | undefined;
  /** Le filtre « non attribuée » : il ne restreint que les ouvertures (fiches sans suiveur). */
  readonly unassigned?: boolean | undefined;
  readonly channel?: SalesChannel | undefined;
}

/**
 * **Ce que l'équipe a fait un jour donné**, hors des fiches suivies : une
 * ouverture se range sous son AUTEUR et un contact sous celui qui l'a noté,
 * qui ne sont pas forcément le suiveur. Lectures agrégées sur le jour, jamais
 * une lecture par fiche.
 */
export abstract class SalesDayReader {
  /**
   * Les fiches principales créées ce jour : celles dont `actor` est l'auteur
   * s'il est donné ; sinon toutes, auto-inscriptions comprises (le canal les
   * trie), ou seulement celles sans suiveur sous « non attribuée ».
   */
  abstract openedOn(scope: SalesDayScope, day: ParisDay): Promise<number>;

  /**
   * Les contacts de ce jour, un mode par contact : les `company.contacted`
   * DATÉS de ce jour (notés par `actor` s'il est donné), et les rendez-vous
   * honorés commencés ce jour (sur les fiches que suit `actor` s'il est donné —
   * un rendez-vous n'a pas d'auteur).
   */
  abstract contactsOn(scope: SalesDayScope, day: ParisDay): Promise<readonly CompanyContactMode[]>;
}
