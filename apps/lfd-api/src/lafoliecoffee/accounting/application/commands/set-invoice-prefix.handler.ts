import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { InvoicePrefixTakenError } from "../../domain/errors/invoice-errors.js";
import { InvoicePrefixSetEvent } from "../../domain/events/legal-entity.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { InvoicePrefix } from "../../domain/value-objects/invoice-prefix.js";
import { loadOrFail } from "../legal-entity-support.js";
import { SetInvoicePrefixCommand } from "./legal-entity-commands.js";

/**
 * Pose le préfixe de numéro des factures de l'entité (plan
 * `plan-zero-faille.md`, F14, lot ZA).
 *
 * L'agrégat refuse un changement après la première pièce ; l'unicité entre
 * entités est une question sur l'ensemble, posée ici au dépôt pour refuser
 * avec un nom. La base tient les deux pour qui passerait entre la lecture et
 * l'écriture (index unique, déclencheur `legal_entity_invoice_prefix_frozen`).
 * Une saisie rejouée n'écrit rien.
 *
 * @throws {InvalidInvoicePrefixError} autre chose que 2 à 6 lettres.
 * @throws {InvoicePrefixIsFrozenError} l'entité a déjà émis.
 * @throws {InvoicePrefixTakenError} une autre entité le porte.
 */
@CommandHandler(SetInvoicePrefixCommand)
export class SetInvoicePrefixHandler implements ICommandHandler<SetInvoicePrefixCommand, void> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetInvoicePrefixCommand): Promise<void> {
    const prefix = InvoicePrefix.create(command.prefix);
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    const before = entity.invoicePrefix?.value ?? null;
    if (!entity.setInvoicePrefix(prefix)) {
      return;
    }
    const holder = await this.entities.invoicePrefixHolder(prefix.value, entity.id);
    if (holder !== null) {
      throw new InvoicePrefixTakenError(prefix.value, holder);
    }
    const at = this.clock.now();
    await this.uow.run(async () => {
      await this.entities.save(entity);
      await this.events.publishTraced(
        new InvoicePrefixSetEvent({ id: entity.id, name: entity.name }, at, before, prefix.value),
      );
    });
  }
}
