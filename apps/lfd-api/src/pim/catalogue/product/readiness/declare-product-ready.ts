import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { currentRequestContext } from "../../../../platform/context/request-context.store.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { PimJournalReader } from "../../../journal/pim-journal-reader.js";
import { ArchivedProductNotReadyError } from "../domain/errors/product-errors.js";
import type { ReadinessSignature } from "../domain/entities/product-readiness.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { ReadinessRepository } from "../domain/ports/readiness.repository.js";
import { signatureStillHolds } from "../domain/services/readiness-renewal.js";
import { requireProduct } from "../shared/product-support.js";
import { CatalogEmitter } from "../../../shared/catalog-emitter.js";

export class DeclareProductReadyCommand {
  constructor(readonly id: string) {}
}

/**
 * **Quelqu'un affirme que la fiche est juste.**
 *
 * Le geste qui manquait entre « tout est rempli » et « c'est en vente ». Le
 * schéma valide la FORME — un prix est un entier, un nom a une source — et il
 * ne dira jamais que 10,00 € est le bon prix ni que la description parle du bon
 * produit. Cette commande n'inscrit donc aucune vérification : elle inscrit une
 * signature, avec sa date, et c'est tout ce qu'on peut honnêtement inscrire.
 *
 * Elle ne touche PAS au statut. Une fiche déclarée publiable reste un
 * brouillon : mettre en vente est un second geste, et les fondre en un seul
 * ferait disparaître celui qui a du sens.
 *
 * Rejouée par le même signataire sur une fiche dont le contenu n'a pas bougé,
 * elle ne fait rien : ni fait, ni nouvelle date, ni réémission.
 */
@CommandHandler(DeclareProductReadyCommand)
export class DeclareProductReadyHandler implements ICommandHandler<
  DeclareProductReadyCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly readiness: ReadinessRepository,
    private readonly journal: PimJournal,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
    private readonly history: PimJournalReader,
  ) {}

  async execute(command: DeclareProductReadyCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    if (product.status === "archived") {
      throw new ArchivedProductNotReadyError(command.id);
    }
    // Hors requête (seed, cron) il n'y a personne : l'agrégat refuse alors de
    // signer, et le rejeu ne s'examine que pour une identité réelle.
    const actor = currentRequestContext()?.actor.id ?? null;
    const readiness = await this.readiness.load(command.id);
    if (actor !== null && (await this.alreadySigned(command.id, readiness.signature, actor))) {
      return;
    }
    // L'horloge de la requête, pas `new Date()` : la déclaration se compare à
    // des dates de modification, et deux sources de temps qui divergent d'une
    // milliseconde suffiraient à la dire périmée à l'instant où elle est faite.
    readiness.declare(new Date(this.clock.now()), actor);
    const { sku, name } = product.snapshot();
    // Le fait et la signature dans la MÊME transaction. Une seule écriture ne
    // dispense pas de l'unité de travail : si la trace passait et la
    // déclaration non, l'historique affirmerait une signature que la base ne
    // porte pas — et c'est justement l'historique qu'on vient consulter le jour
    // où l'on demande qui a validé ce prix.
    await this.uow.run(async () => {
      await this.journal.trace({
        type: PIM_EVENTS.productDeclaredReady,
        subjectType: "product",
        subjectId: command.id,
        payload: { subjectLabel: name.fr, sku, name },
      });
      await this.readiness.save(readiness);
      await this.emitter.emitProducts([command.id]);
    });
  }

  private async alreadySigned(
    productId: string,
    current: ReadinessSignature | null,
    actor: string,
  ): Promise<boolean> {
    if (current === null) {
      return false;
    }
    const facts = await this.history.factsAbout(
      "product",
      productId,
      current.readyAt,
      new Date(this.clock.now()),
    );
    return signatureStillHolds(
      current,
      actor,
      facts.map((fact) => fact.type),
    );
  }
}
