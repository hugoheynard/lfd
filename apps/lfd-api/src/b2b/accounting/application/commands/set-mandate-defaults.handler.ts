import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { MandateDefaults } from "../../domain/value-objects/mandate-defaults.js";
import { loadOrFail } from "../legal-entity-support.js";
import { SetMandateDefaultsCommand } from "./legal-entity-commands.js";

/**
 * Règle ce que les mandats de cette entité diront du contrat.
 *
 * ## Pas d'événement de journal, contrairement au délai de pré-notification
 *
 * Le délai est **opposable au débiteur** : il annonce combien de jours avant le
 * débit il sera prévenu, et le changer change une promesse. Ces deux réglages,
 * eux, sont indicatifs — la norme le dit de la zone 20, et la zone 12 se relit
 * sur chaque mandat déjà signé, qui garde la sienne. Journaliser ce qui
 * n'engage personne dilue un journal qu'on lit pour répondre à « qui a changé
 * quoi » le jour d'une contestation.
 *
 * ⚠️ À rouvrir si la zone 12 devenait modifiable après le premier mandat sans
 * qu'on s'en aperçoive : passer de récurrent à ponctuel change ce qu'un mandat
 * futur autorise, et ça, ça s'explique.
 */
@CommandHandler(SetMandateDefaultsCommand)
export class SetMandateDefaultsHandler implements ICommandHandler<SetMandateDefaultsCommand, void> {
  constructor(private readonly entities: LegalEntityRepository) {}

  async execute({ legalEntityId, payload }: SetMandateDefaultsCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, legalEntityId);
    entity.setMandateDefaults(
      MandateDefaults.create(payload.contractDescription, payload.paymentType),
    );
    await this.entities.save(entity);
  }
}
