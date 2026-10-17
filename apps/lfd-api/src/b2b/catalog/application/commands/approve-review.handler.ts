import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import type { JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { CatalogItem } from "../../domain/entities/catalog-item.js";
import {
  CatalogItemProReviewApprovedEvent,
  CatalogItemPublicReviewApprovedEvent,
  type CatalogItemSubject,
} from "../../domain/events/catalog-item.events.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import type { ShopAudience } from "../../domain/ports/catalog.reader.js";
import { ApproveReviewCommand } from "./approve-review.command.js";
import { loadManyOrFail, subjectOf } from "./catalog-decision-support.js";

/** Le fait de journal d'une validation, par audience. */
const APPROVED: Readonly<Record<ShopAudience, (item: CatalogItemSubject) => JournaledEvent>> = {
  pro: (item) => new CatalogItemProReviewApprovedEvent(item),
  public: (item) => new CatalogItemPublicReviewApprovedEvent(item),
};

/**
 * Lève l'attente de validation des articles désignés, pour les audiences
 * désignées : elles les voient dès lors, s'ils ne sont pas masqués. Un fait
 * de journal par article ET par audience réellement validée ; une audience
 * déjà validée n'en écrit pas.
 *
 * **Tout ou rien**, dans une unité de travail : un SKU que la plateforme ne
 * vend plus (retiré entre l'affichage et le clic) fait échouer le lot en le
 * nommant, plutôt que d'en valider une partie sans le dire. Un SKU ou une
 * audience cités deux fois ne comptent qu'une.
 *
 * **Un nombre de requêtes qui ne croît pas avec le lot** : une lecture, au plus
 * quatre écritures d'attente, deux pour le journal. Le 2026-10-17, 64 SKU × 2
 * audiences chargés, sauvés et journalisés un par un (~400 allers-retours) ont
 * fait expirer la transaction en production (P2028, 500).
 */
@CommandHandler(ApproveReviewCommand)
export class ApproveReviewHandler implements ICommandHandler<ApproveReviewCommand, void> {
  constructor(
    private readonly items: CatalogItemRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ApproveReviewCommand): Promise<void> {
    const audiences = [...new Set(command.audiences)];
    await this.uow.run(async () => {
      const changed: CatalogItem[] = [];
      const facts: JournaledEvent[] = [];
      for (const item of await loadManyOrFail(this.items, command.skus)) {
        const approved = audiences.filter((audience) => item.approveFor(audience));
        if (approved.length > 0) {
          changed.push(item);
          facts.push(...approved.map((audience) => APPROVED[audience](subjectOf(item))));
        }
      }
      if (changed.length === 0) {
        return;
      }
      await this.items.saveReviewStates(changed);
      await this.events.publishTracedAll(facts);
    });
  }
}
