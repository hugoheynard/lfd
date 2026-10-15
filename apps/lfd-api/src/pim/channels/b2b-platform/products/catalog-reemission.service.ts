import { Injectable, Logger } from "@nestjs/common";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CatalogEmitter } from "../../../catalogue/shared/domain/ports/catalog-emitter.js";
import { CatalogFactsReader } from "../../../catalogue/shared/domain/ports/catalog-facts.reader.js";
import { CatalogRulesEmitter } from "../../../order-time-limitation/domain/ports/catalog-rules.emitter.js";
import {
  CatalogReemission,
  type ReemissionReport,
} from "../../../catalogue/shared/domain/ports/catalog-reemission.js";

const NOTHING: ReemissionReport = { categories: 0, products: 0, failedProducts: [] };

/**
 * **Réémettre, une transaction par fiche** (C3, et « réémettre tout » de 2a6).
 *
 * Chaque fiche ouvre SA transaction : le verrou de l'émetteur ne tient qu'une
 * ligne à la fois, et un geste qui touche quarante fiches ne bloque pas la
 * saisie des quarante autres. Le prix : une réémission interrompue laisse des
 * fiches en retard — la parité les montre, « réémettre » les répare.
 *
 * Fermé (mêmes interrupteurs que l'émetteur), il ne lit même pas la liste.
 */
@Injectable()
export class B2bCatalogReemission extends CatalogReemission {
  private readonly logger = new Logger(B2bCatalogReemission.name);

  constructor(
    private readonly config: AppConfig,
    private readonly facts: CatalogFactsReader,
    private readonly emitter: CatalogEmitter,
    private readonly uow: UnitOfWork,
    private readonly rules: CatalogRulesEmitter,
  ) {
    super();
  }

  async productsOfCategories(categoryIds: readonly string[]): Promise<void> {
    if (!this.open() || categoryIds.length === 0) {
      return;
    }
    await this.emitEach(await this.facts.productIdsOfFamilies(categoryIds));
  }

  async everything(): Promise<ReemissionReport> {
    if (!this.open()) {
      return NOTHING;
    }
    // Les familles D'ABORD : une fiche apporte la sienne si la plateforme ne
    // la connaît pas, mais seule la famille émise pour elle-même porte son
    // propre numéro et la met à jour.
    const families = await this.facts.allFamilyIds();
    for (const id of families) {
      await this.uow.run(() => this.emitter.emitCategories([id]));
    }
    const products = await this.facts.allProductIds();
    const failedProducts = await this.emitEach(products);
    // Les règles EN DERNIER (lot 2b) : la plateforme les descend sur chaque
    // article, et c'est le fait d'une fiche qui lui apprend l'identifiant de
    // déclinaison qu'une règle de ce rang vise.
    await this.uow.run(() => this.rules.emitRules());
    return { categories: families.length, products: products.length, failedProducts };
  }

  /** @returns les fiches dont la transaction a échoué. */
  private async emitEach(productIds: readonly string[]): Promise<string[]> {
    const failed: string[] = [];
    for (const id of productIds) {
      try {
        await this.uow.run(() => this.emitter.emitProducts([id]));
      } catch (cause) {
        // Le geste qui a demandé la réémission est déjà validé : lever ici le
        // ferait rejouer. La fiche en échec est nommée, et se répare seule.
        this.logger.error(`Réémission de la fiche ${id} en échec`, cause);
        failed.push(id);
      }
    }
    return failed;
  }

  private open(): boolean {
    return this.config.catalogFactsEnabled() && this.config.publicationEnabled();
  }
}
