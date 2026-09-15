import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IssuedDraftMandates } from "../../domain/ports/issued-draft-mandates.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { defaultsChangeReprintsDraft } from "../../domain/services/mandate-printed-zones.js";
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
 *
 * ## Les brouillons deviennent caducs quand leur papier change (2026-09-15)
 *
 * Plan `documentation/b2b/plan-mandat-deux-schemas.md` §10.4 : le type de
 * paiement s'imprime sous les deux schémas, la description sous CORE seulement.
 * Chaque brouillon révoqué a SON fait `payment_mandate.draft_voided`, dans la
 * transaction du réglage — la trace du geste est donc là où elle compte, sur le
 * papier qui ne vaut plus rien.
 */
@CommandHandler(SetMandateDefaultsCommand)
export class SetMandateDefaultsHandler implements ICommandHandler<SetMandateDefaultsCommand, void> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly drafts: IssuedDraftMandates,
    private readonly uow: UnitOfWork,
  ) {}

  async execute({ legalEntityId, payload }: SetMandateDefaultsCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, legalEntityId);
    const previous = entity.mandateDefaults;
    const next = MandateDefaults.create(payload.contractDescription, payload.paymentType);
    entity.setMandateDefaults(next);

    if (!defaultsChangeReprintsDraft(previous, next, entity.mandateScheme)) {
      await this.entities.save(entity);
      return;
    }
    const voided = await this.uow.run(async () => {
      await this.entities.save(entity);
      return this.drafts.voidDraftsOf(legalEntityId, "mandate_defaults_changed", "staff");
    });
    await this.drafts.announceVoided(voided, "mandate_defaults_changed");
  }
}
