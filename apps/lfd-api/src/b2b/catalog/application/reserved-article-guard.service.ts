import { Injectable } from "@nestjs/common";

import { PUBLIC_VIEWER, proViewer } from "../domain/catalog-viewer.js";
import { ArticleNotServedToPublicError } from "../domain/errors/not-served-to-public.error.js";
import { ReservedArticleRefusedError } from "../domain/errors/reserved-article-refused.error.js";
import { ArticleNotServedToCompanyError } from "../domain/errors/not-served-to-company.error.js";
import { ProductCatalogReader } from "../domain/ports/product-catalog.reader.js";
import { ReservationHoldersReader } from "../domain/ports/reservation-holders.reader.js";

/**
 * **Le mur des articles réservés, pour ceux qui écrivent des lignes sans les
 * tarifer** — la création d'un abonnement et la dérogation d'une échéance
 * (`documentation/catalogue/plan-articles-sur-mesure.md`, § 6).
 *
 * Ces gestes ne résolvent pas le catalogue (vérifié le 2026-10-30) : la
 * garde est leur seul mur. Depuis la décision de Hugo du 2026-10-30, chacun
 * passe le mur COMPLET de son rayon. Un pro : lecteur `pro`
 * (`served_and_locked`) — l'absent est refusé sans dire pourquoi (un réservé
 * invisible ne se distingue pas d'un inconnu), le verrouillé par son nom.
 *
 * Un particulier (société `null`) passe le mur de son rayon : le lecteur
 * `public`, donc `servedTo(item, "public")`. Jusqu'au 2026-10-30 il ne passait
 * aucun mur, et pouvait s'abonner à un article pro, réservé ou sur mesure
 * (§ 12 du plan).
 */
@Injectable()
export class ReservedArticleGuard {
  constructor(
    private readonly catalog: ProductCatalogReader,
    private readonly holders: ReservationHoldersReader,
  ) {}

  /**
   * @param companyId `null` = un particulier : chaque article doit être servi
   *   à son rayon.
   * @throws {ArticleNotServedToPublicError} un particulier, un article que son rayon ne sert pas.
   * @throws {ReservedArticleRefusedError} un article réservé à un autre compte, visible.
   * @throws {ArticleNotServedToCompanyError} un pro, un article que son rayon ne sert pas
   *   (audience, validation, masquage, réservé invisible, inconnu).
   */
  async ensureOpenTo(companyId: string | null, skus: readonly string[]): Promise<void> {
    if (skus.length === 0) {
      return;
    }
    if (companyId === null) {
      return this.ensureServedToPublic(skus);
    }
    const holders = await this.holders.holdersOf(companyId);
    const wanted = [...new Set(skus)];
    const seen = await this.catalog.resolveMany(wanted, proViewer(holders, "served_and_locked"));
    for (const sku of wanted) {
      const item = seen.get(sku);
      if (item === undefined) {
        throw new ArticleNotServedToCompanyError(sku);
      }
      if (item.reservation === "other") {
        throw new ReservedArticleRefusedError(sku);
      }
    }
  }

  private async ensureServedToPublic(skus: readonly string[]): Promise<void> {
    const wanted = [...new Set(skus)];
    const served = await this.catalog.resolveMany(wanted, PUBLIC_VIEWER);
    const missing = wanted.find((sku) => !served.has(sku));
    if (missing !== undefined) {
      throw new ArticleNotServedToPublicError(missing);
    }
  }
}
