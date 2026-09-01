import { Controller, Get } from "@nestjs/common";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { CheckCatalogParityService } from "../application/check-catalog-parity.service.js";
import type { ParityReport } from "../domain/catalog-parity.js";

/**
 * **Le miroir est-il fidèle ?** — un garde-fou, pas un protocole.
 *
 * Il vivait dans `orders/`, derrière le jeton d'exploitation, parce qu'il
 * comparait le seed que ce contexte détenait. Le seed n'est plus l'autorité et
 * la comparaison a changé de sujet : sa maison est le miroir lui-même, et sa
 * porte est celle du catalogue — un écart de miroir se lit avec les prix, pas
 * avec un outil d'astreinte.
 */
@Controller("admin/catalog")
@AdminSurface("b2b_catalog")
export class AdminCatalogParityController {
  constructor(private readonly parity: CheckCatalogParityService) {}

  @Get("parity")
  check(): Promise<ParityReport> {
    return this.parity.check();
  }
}
