import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CatalogEmitter } from "../../../catalogue/shared/domain/ports/catalog-emitter.js";
import { CatalogFactsReader } from "../../../catalogue/shared/domain/ports/catalog-facts.reader.js";
import { CatalogReemission } from "../../../catalogue/shared/domain/ports/catalog-reemission.js";
import type { CatalogReemissionJob } from "../domain/entities/catalog-reemission-job.js";
import { messageOf } from "../domain/errors/reemission-errors.js";
import { ReemissionJobRepository } from "../domain/ports/reemission-job.repository.js";
import { JobProgress } from "./reemission-progress.js";

/**
 * **Fait tourner une réémission jusqu'à son issue**, et l'écrit.
 *
 * Il ne lève jamais vers son lanceur : il tourne en arrière-plan, et personne
 * n'attend sa réponse. Ce qui l'arrête — une famille, les règles — devient
 * l'erreur du travail (`failed`) ; une fiche en échec n'arrête rien et se
 * nomme dans le compte rendu (`done`). Les règles du compte rendu sont celles
 * de `B2bCatalogReemission`, désormais écrites au lieu d'un 500.
 */
@Injectable()
export class CatalogReemissionRunner {
  constructor(
    private readonly facts: CatalogFactsReader,
    private readonly emitter: CatalogEmitter,
    private readonly reemission: CatalogReemission,
    private readonly uow: UnitOfWork,
    private readonly jobs: ReemissionJobRepository,
    private readonly clock: Clock,
  ) {}

  async run(job: CatalogReemissionJob): Promise<void> {
    const progress = new JobProgress(job, this.jobs, this.facts);
    try {
      if (job.productId === null) {
        await this.reemission.everything(progress);
      } else {
        await this.emitOne(job.productId, progress);
      }
      job.finish(this.clock.now());
    } catch (cause) {
      job.fail(messageOf(cause), this.clock.now());
    }
    await this.jobs.save(job);
  }

  /** Une fiche, dans sa transaction : son échec se nomme, il n'arrête pas le travail. */
  private async emitOne(productId: string, progress: JobProgress): Promise<void> {
    try {
      await this.uow.run(() => this.emitter.emitProducts([productId]));
    } catch (cause) {
      await progress.productFailed(productId, cause);
      return;
    }
    await progress.productEmitted();
  }
}
