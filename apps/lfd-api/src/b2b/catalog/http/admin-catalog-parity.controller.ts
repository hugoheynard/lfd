import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { CatalogHealthView } from "@lfd/contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { CheckCatalogHealthQuery } from "../application/queries/check-catalog-health.query.js";
import { CheckCatalogParityQuery } from "../application/queries/check-catalog-parity.query.js";
import type { ParityReport } from "../domain/catalog-parity.js";

/**
 * **Le miroir est-il fidèle ?** — deux routes, deux référents.
 *
 * Le comparateur est le même et reste seul ; ce sont les questions qui
 * diffèrent, et les confondre donnait un écran qu'on n'ouvre plus.
 *
 * | Question                                                   | Référent                     |
 * | ---------------------------------------------------------- | ---------------------------- |
 * | « Qu'est-ce que je m'apprête à envoyer ? »                 | la projection **maintenant** |
 * | « Quelque chose a-t-il bougé qu'aucun geste n'explique ? » | la dernière version validée  |
 *
 * 🔴 **`parity` ne change pas de référent**, et c'est délibéré : elle a quatre
 * consommateurs, dont un workflow d'ops qui n'échoue que le jour où quelqu'un le
 * lance. La changer aurait cassé ses appelants pour servir un besoin qui n'est
 * pas le sien.
 */
@Controller("admin/catalog")
@AdminSurface("b2b_catalog")
export class AdminCatalogParityController {
  constructor(private readonly queries: QueryBus) {}

  /** L'aperçu avant push : ce qui partirait, contre ce qu'on tient. */
  @Get("parity")
  parity(): Promise<ParityReport> {
    return this.queries.execute<CheckCatalogParityQuery, ParityReport>(
      new CheckCatalogParityQuery(),
    );
  }

  /**
   * Le contrôle de santé : ce qu'on a **validé**, contre ce qu'on tient.
   *
   * C'est la seule des trois lignes de l'écran qui doive réveiller quelqu'un —
   * les deux autres (R+1 côté PIM, une arrivée en attente) se lisent ailleurs et
   * décrivent un fonctionnement normal.
   */
  @Get("health")
  health(): Promise<CatalogHealthView> {
    return this.queries.execute<CheckCatalogHealthQuery, CatalogHealthView>(
      new CheckCatalogHealthQuery(),
    );
  }
}
