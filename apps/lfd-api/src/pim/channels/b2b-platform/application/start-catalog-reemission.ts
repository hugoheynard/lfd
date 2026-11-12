import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { currentRequestContext } from "../../../../platform/context/request-context.store.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ProductNotFoundError } from "../../../catalogue/product/domain/errors/product-errors.js";
import { CatalogFactsReader } from "../../../catalogue/shared/domain/ports/catalog-facts.reader.js";
import { CatalogReemissionJob } from "../domain/entities/catalog-reemission-job.js";
import {
  AnonymousReemissionError,
  ReemissionAlreadyRunningError,
} from "../domain/errors/reemission-errors.js";
import { ReemissionJobRepository } from "../domain/ports/reemission-job.repository.js";
import { CatalogReemissionRunner } from "./catalog-reemission-runner.js";

/**
 * `productId` = une fiche ; `null` = tout le catalogue, familles d'abord, règles en dernier.
 * `intentKey` : la clé que l'écran a fabriquée pour ce geste — un double clic
 * ne lance qu'un travail.
 */
export class StartCatalogReemissionCommand {
  constructor(
    readonly productId: string | null,
    readonly intentKey: string,
  ) {}
}

/**
 * **Lancer une réémission** — le filet des faits du catalogue, devenu un
 * travail suivi (2026-10-18, décision de Hugo).
 *
 * Rend l'identifiant du travail tout de suite ; la réémission tourne ensuite
 * en arrière-plan dans le processus, et son compte rendu se relit par
 * `GetCatalogReemissionQuery`. « Tout » durait ~73 s dans la réponse HTTP
 * (293 articles, 2026-10-17), et la réponse se perdait.
 *
 * Ce qui se refuse ici, avant tout travail : une fiche inconnue (404), un
 * second « tout » pendant qu'un premier tourne (409) — l'index partiel de la
 * table le refuse aussi, pour deux clics simultanés.
 *
 * **Une fois par intention** : une fiche relancée deux fois inscrirait deux
 * travaux. La clé de l'écran est scellée avec l'inscription du travail ; un
 * rejeu de la même clé rend le même travail, sans en relancer un.
 *
 * @throws {ProductNotFoundError} la fiche visée n'existe pas.
 * @throws {ReemissionAlreadyRunningError} un « tout » est déjà en cours.
 * @throws {AnonymousReemissionError} aucune identité staff sur la requête.
 *
 * @sans-journal le travail EST la trace : qui, quand, et le compte rendu y sont rangés.
 */
@CommandHandler(StartCatalogReemissionCommand)
export class StartCatalogReemissionHandler implements ICommandHandler<
  StartCatalogReemissionCommand,
  string
> {
  constructor(
    private readonly facts: CatalogFactsReader,
    private readonly jobs: ReemissionJobRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly runner: CatalogReemissionRunner,
    private readonly background: BackgroundWork,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  async execute(command: StartCatalogReemissionCommand): Promise<string> {
    const startedBy = currentRequestContext()?.actor.id ?? null;
    if (startedBy === null) {
      throw new AnonymousReemissionError();
    }
    return this.intents.runSealed(
      {
        actorId: startedBy,
        key: command.intentKey,
        gesture: "pim.catalog.reemit",
        subject: command.productId ?? "everything",
      },
      CREATED_ID_REPLAY,
      (seal) => this.start(command.productId, startedBy, seal),
    );
  }

  private async start(
    productId: string | null,
    startedBy: string,
    seal: (id: string) => Promise<void>,
  ): Promise<string> {
    await this.refuseUnreachable(productId);
    const job = CatalogReemissionJob.start({
      id: this.ids.next(),
      productId,
      startedAt: this.clock.now(),
      startedBy,
    });
    await this.uow.run(async () => {
      await this.jobs.save(job);
      await seal(job.id);
    });
    void this.background.detach(() => this.runner.run(job), "catalog.reemission");
    return job.id;
  }

  private async refuseUnreachable(productId: string | null): Promise<void> {
    if (productId !== null) {
      const [product] = await this.facts.products([productId]);
      if (product === undefined) {
        throw new ProductNotFoundError(productId);
      }
      return;
    }
    const running = await this.jobs.runningEverything();
    if (running !== null) {
      throw new ReemissionAlreadyRunningError(running.id);
    }
  }
}
