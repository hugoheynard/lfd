import { Injectable } from "@nestjs/common";
import type { StoredCatalogSnapshot } from "@lfd/catalog-sync";

/** Ce qu'une ingestion a réellement changé, pour que l'appelant puisse le dire. */
export interface IngestionOutcome {
  readonly acceptedProducts: number;
  readonly acceptedVariants: number;
  readonly acceptedCategories: number;
  /**
   * Les SKU présents avant, absents du snapshot — donc **retirés de la vente**.
   *
   * Retirés, pas supprimés : leur ligne reste, leur prix négocié aussi, et un
   * push qui les rapporte les remet en rayon. Le nom garde le mot du contrat de
   * fil, que la plateforme rend à l'émetteur.
   */
  readonly removedSkus: readonly string[];
  /** Les clés d'opérations tenues avant, absentes de l'envoi — donc marquées retirées. */
  readonly withdrawnOperations: readonly string[];
}

/**
 * Applique un snapshot du PIM — et n'écrit **plus rien** depuis le 2026-10-17.
 *
 * Les faits du catalogue tiennent fiches et familles (sous `applied_seq`), et
 * les opérations s'écrivent au commerce : le push n'a plus rien à poser. Avant
 * X1 (`documentation/catalogue/plan-sans-interrupteurs.md`), c'était le
 * comportement interrupteurs OUVERTS ; l'ancien écrivain retirait tout ce qui
 * n'était pas dans son instantané, fiches inactives des faits comprises, et
 * réécrivait les opérations nées au commerce.
 *
 * Il reste jusqu'au retrait du push et de la réception (X2) : un envoi
 * accepté rend un compte-rendu vide, sans bruit.
 */
@Injectable()
export class IngestCatalogService {
  apply(
    _snapshot: StoredCatalogSnapshot,
    _excludedSkus: readonly string[] = [],
  ): Promise<IngestionOutcome> {
    return Promise.resolve({
      acceptedProducts: 0,
      acceptedVariants: 0,
      acceptedCategories: 0,
      removedSkus: [],
      withdrawnOperations: [],
    });
  }
}
