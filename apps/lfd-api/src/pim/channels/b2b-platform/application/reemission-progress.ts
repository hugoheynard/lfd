import { CatalogFactsReader } from "../../../catalogue/shared/domain/ports/catalog-facts.reader.js";
import { ReemissionProgress } from "../../../catalogue/shared/domain/ports/catalog-reemission.js";
import {
  readLocalized,
  SOURCE_LOCALE,
} from "../../../catalogue/shared/domain/value-objects/localized-text.js";
import type { CatalogReemissionJob } from "../domain/entities/catalog-reemission-job.js";
import { messageOf } from "../domain/errors/reemission-errors.js";
import { ReemissionJobRepository } from "../domain/ports/reemission-job.repository.js";

/**
 * **Le compte rendu qui s'écrit pendant que la réémission avance** : chaque
 * fiche est comptée et rangée aussitôt. L'écran suit donc un travail vivant,
 * et un arrêt en route — les règles, un redémarrage — laisse les comptes de
 * ce qui est déjà parti.
 */
export class JobProgress extends ReemissionProgress {
  constructor(
    private readonly job: CatalogReemissionJob,
    private readonly jobs: ReemissionJobRepository,
    private readonly facts: CatalogFactsReader,
  ) {
    super();
  }

  async productEmitted(): Promise<void> {
    this.job.productSucceeded();
    await this.jobs.save(this.job);
  }

  async productFailed(productId: string, cause: unknown): Promise<void> {
    this.job.productFailed({
      productId,
      name: await this.nameOf(productId),
      reason: messageOf(cause),
    });
    await this.jobs.save(this.job);
  }

  /**
   * Le nom source de la fiche. Sa relecture peut échouer pour la raison même
   * qui a fait échouer la fiche : le nom manque alors, l'échec reste nommé
   * par son identifiant et sa raison.
   */
  private async nameOf(productId: string): Promise<string | null> {
    try {
      const [product] = await this.facts.products([productId]);
      return product === undefined ? null : readLocalized(product.name, SOURCE_LOCALE);
    } catch {
      return null;
    }
  }
}
