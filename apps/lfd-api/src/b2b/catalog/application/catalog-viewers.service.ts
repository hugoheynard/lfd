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
import { companyServiceOf } from "../domain/company-service.js";
import { CompanyClosedOrderRefusedError } from "../domain/errors/company-closed-order-refused.error.js";
import type { ShopAudience } from "../domain/ports/catalog.reader.js";
import { ServedCompanyReader, type ServedCompany } from "../domain/ports/served-company.reader.js";

/**
 * **Le lecteur du catalogue d'une société servie** — la seule fabrique d'un
 * lecteur `pro` reconnu (`plan-articles-sur-mesure.md`, § 5, § 6), et LE lieu
 * de la décision « pro ou pas » (`plan-pros-en-cours-d-inscription.md`, § 3,
 * lot P0 ; règle : {@link companyServiceOf}).
 *
 * La société vient de l'appelant (`@ActingCompany`, ou la société d'une saisie
 * staff) ; son statut et son principal ACTIF sont relus ici, à chaque
 * requête, en une lecture. Une lecture de plus par chemin reconnu, constante —
 * le budget du devis l'épingle (`test/pricing-budget.e2e-spec.ts`).
 *
 * Une société servie au public rend {@link PUBLIC_VIEWER} : sans société, ni
 * mercuriale ni tarif de canal ne se chargent (`pricingCompanyOf`).
 *
 * « Sans société » reste le public, comme partout ailleurs : la déduction
 * `companyId === null → public` est celle de la porte du prix.
 */
@Injectable()
export class CatalogViewers {
  constructor(private readonly companies: ServedCompanyReader) {}

  /**
   * Ce que la société LIT : une société terminée lit le rayon public.
   * `null` = un visiteur ou l'espace perso : le public.
   */
  async forCompany(
    companyId: string | null,
    show: ProCatalogShow = "served",
  ): Promise<CatalogViewer> {
    const served = await this.servedOf(companyId);
    return served === null || companyServiceOf(served.status) !== "pro"
      ? PUBLIC_VIEWER
      : proViewer(served.holders, show);
  }

  /**
   * Ce qui se FACTURE à la société — devis et passation. La même décision,
   * mais une société terminée est refusée par son nom.
   *
   * @throws {CompanyClosedOrderRefusedError} la société est terminée.
   */
  async forBilling(companyId: string | null, show: ProCatalogShow): Promise<CatalogViewer> {
    const served = await this.servedOf(companyId);
    if (served === null) {
      return PUBLIC_VIEWER;
    }
    const service = companyServiceOf(served.status);
    if (service === "closed" && companyId !== null) {
      throw new CompanyClosedOrderRefusedError(companyId);
    }
    return service === "pro" ? proViewer(served.holders, show) : PUBLIC_VIEWER;
  }

  /**
   * Les lignes gardées d'une révision (§ 5) : réservation levée pour elles
   * seules — et la même décision : une société servie au public y lit le
   * minimum public.
   */
  async forKeptLines(companyId: string | null): Promise<CatalogViewer> {
    const served = await this.servedOf(companyId);
    return served === null || companyServiceOf(served.status) !== "pro"
      ? PUBLIC_VIEWER
      : keptLinesViewer(served.holders);
  }

  /** Le personnel, au nom d'un compte : les étiquettes « à ce compte » / « à un autre ». */
  async regarding(companyId: string, audience: ShopAudience = "pro"): Promise<StaffCatalogViewer> {
    const served = await this.companies.servedOf(companyId);
    return staffViewer(audience, served?.holders ?? { companyId, activePrincipalId: null });
  }

  private servedOf(companyId: string | null): Promise<ServedCompany | null> {
    return companyId === null ? Promise.resolve(null) : this.companies.servedOf(companyId);
  }
}
