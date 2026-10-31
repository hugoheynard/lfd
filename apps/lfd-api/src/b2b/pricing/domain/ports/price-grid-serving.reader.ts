import type { PriceGridBasis } from "../price-grid-row.js";

/** Comment ce public est servi : son assiette, et le compte dont la porte lit le tarif. */
export interface PriceGridServing {
  readonly basis: PriceGridBasis;
  readonly pricingCompanyId: string | null;
}

/**
 * **Pro ou public ?** — la décision de la vitrine (`CatalogViewers`), sans lire
 * le rayon : la liste des promotions n'a besoin que d'elle. Une société en
 * attente est servie en pro, une suspendue au public.
 */
export abstract class PriceGridServingReader {
  abstract servingOf(companyId: string | null): Promise<PriceGridServing>;
}
