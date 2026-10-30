import { Injectable } from "@nestjs/common";

import { proViewer, staffViewer } from "../domain/catalog-viewer.js";
import { ReservedArticleRefusedError } from "../domain/errors/reserved-article-refused.error.js";
import { UnknownSkuError } from "../domain/errors/unknown-sku.error.js";
import { ProductCatalogReader } from "../domain/ports/product-catalog.reader.js";
import { ReservationHoldersReader } from "../domain/ports/reservation-holders.reader.js";

/**
 * **Le mur des articles réservés, pour ceux qui écrivent des lignes sans les
 * tarifer** — la création d'un abonnement et la dérogation d'une échéance
 * (`documentation/catalogue/plan-articles-sur-mesure.md`, § 6).
 *
 * Ces gestes ne résolvent pas le catalogue et ne refusent pas un SKU inconnu
 * (vérifié le 2026-10-30) : ils ne passent donc pas par le refus du devis. La
 * garde lit le catalogue au nom du compte (`staff`, `regarding`) pour trouver
 * ce qui est réservé ailleurs, quelle que soit sa visibilité, puis répond
 * comme le devis : un article `visible_locked` est refusé par son nom, un
 * `hidden` reste un article inconnu — le nommer dirait qu'il existe.
 */
@Injectable()
export class ReservedArticleGuard {
  constructor(
    private readonly catalog: ProductCatalogReader,
    private readonly holders: ReservationHoldersReader,
  ) {}

  /**
   * @param companyId `null` = un particulier : rien à juger ici, la réservation
   *   est un mur entre comptes pros.
   * @throws {ReservedArticleRefusedError} un article réservé à un autre compte, visible.
   * @throws {UnknownSkuError} un article réservé à un autre compte, invisible.
   */
  async ensureOpenTo(companyId: string | null, skus: readonly string[]): Promise<void> {
    if (companyId === null || skus.length === 0) {
      return;
    }
    const holders = await this.holders.holdersOf(companyId);
    const wanted = [...new Set(skus)];
    const regarded = await this.catalog.resolveMany(wanted, staffViewer("pro", holders));
    const elsewhere = wanted.filter((sku) => regarded.get(sku)?.reservation === "other");
    const [first] = elsewhere;
    if (first === undefined) {
      return;
    }
    const seen = await this.catalog.resolveMany([first], proViewer(holders, "served_and_locked"));
    throw seen.has(first) ? new ReservedArticleRefusedError(first) : new UnknownSkuError(first);
  }
}
