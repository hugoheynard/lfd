import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MandateSchemeChangedEvent } from "../../domain/events/legal-entity.events.js";
import { IssuedDraftMandates } from "../../domain/ports/issued-draft-mandates.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { loadOrFail } from "../legal-entity-support.js";
import { SetMandateSchemeCommand } from "./set-mandate-scheme.command.js";

/**
 * Bascule le schéma des mandats à venir de l'entité.
 *
 * ## Rien n'est écrit quand rien ne change
 *
 * Ni sauvegarde, ni fait, ni caducité : un double clic sur le même schéma ne
 * doit pas révoquer les brouillons que des clients sont peut-être en train de
 * signer. C'est `changeMandateScheme` qui le dit, pas une comparaison ici.
 *
 * ## Quand il change — une seule transaction
 *
 * L'entité, le fait `legal_entity.mandate_scheme_changed` (avant → après) et la
 * révocation de **tous** ses brouillons partent ensemble (plan
 * `documentation/b2b/plan-mandat-deux-schemas.md` §3.3 et §9 objection 8). Sans
 * la caducité, un client imprimerait un brouillon CORE alors que l'entité est
 * passée interentreprises — et c'est ce papier-là que le staff activerait.
 *
 * Les mandats actifs ne bougent pas : ils ont figé leur schéma à la frappe.
 *
 * 🔴 Dans la transaction, **uniquement** `publishTraced` : un abonné qui
 * réagirait à un `publish` hériterait d'une transaction refermée entre-temps.
 * La cloche part après, hors transaction.
 */
@CommandHandler(SetMandateSchemeCommand)
export class SetMandateSchemeHandler implements ICommandHandler<SetMandateSchemeCommand, void> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly drafts: IssuedDraftMandates,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute({ legalEntityId, scheme }: SetMandateSchemeCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, legalEntityId);
    const previous = entity.mandateScheme;
    if (!entity.changeMandateScheme(scheme)) {
      return;
    }

    const at = this.clock.now();
    const voided = await this.uow.run(async () => {
      await this.entities.save(entity);
      await this.events.publishTraced(
        new MandateSchemeChangedEvent(legalEntityId, at, previous, scheme),
      );
      return this.drafts.voidDraftsOf(legalEntityId, "mandate_scheme_changed", "staff");
    });
    await this.drafts.announceVoided(voided, "mandate_scheme_changed");
  }
}
