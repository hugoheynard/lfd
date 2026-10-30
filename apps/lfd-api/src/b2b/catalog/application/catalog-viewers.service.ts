import { Injectable } from "@nestjs/common";

import {
  keptLinesViewer,
  proViewer,
  PUBLIC_VIEWER,
  staffViewer,
  type CatalogViewer,
  type ProCatalogShow,
  type StaffCatalogViewer,
} from "../domain/catalog-viewer.js";
import type { ShopAudience } from "../domain/ports/catalog.reader.js";
import { ReservationHoldersReader } from "../domain/ports/reservation-holders.reader.js";

/**
 * **Le lecteur du catalogue d'une société servie** — la seule fabrique d'un
 * lecteur `pro` reconnu (`plan-articles-sur-mesure.md`, § 5, § 6).
 *
 * La société vient de l'appelant (`@ActingCompany`, ou la société d'une saisie
 * staff) ; son principal ACTIF est relu ici, à chaque requête, par la requête
 * partagée. Une lecture de plus par chemin reconnu, constante — le budget du
 * devis l'épingle (`test/pricing-budget.e2e-spec.ts`).
 *
 * « Sans société » reste le public, comme partout ailleurs : la déduction
 * `companyId === null → public` est celle de la porte du prix.
 */
@Injectable()
export class CatalogViewers {
  constructor(private readonly holders: ReservationHoldersReader) {}

  /** `null` = un visiteur ou l'espace perso : le public. */
  async forCompany(
    companyId: string | null,
    show: ProCatalogShow = "served",
  ): Promise<CatalogViewer> {
    return companyId === null
      ? PUBLIC_VIEWER
      : proViewer(await this.holders.holdersOf(companyId), show);
  }

  /** Les lignes gardées d'une révision (§ 5) : réservation levée pour elles seules. */
  async forKeptLines(companyId: string | null): Promise<CatalogViewer> {
    return companyId === null
      ? PUBLIC_VIEWER
      : keptLinesViewer(await this.holders.holdersOf(companyId));
  }

  /** Le personnel, au nom d'un compte : les étiquettes « à ce compte » / « à un autre ». */
  async regarding(companyId: string, audience: ShopAudience = "pro"): Promise<StaffCatalogViewer> {
    return staffViewer(audience, await this.holders.holdersOf(companyId));
  }
}
