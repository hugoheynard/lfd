import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CreditorAccountChangedEvent } from "../../domain/events/legal-entity.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { Iban } from "../../domain/value-objects/iban.js";
import { loadOrFail } from "../legal-entity-support.js";
import { SetCreditorAccountCommand } from "./legal-entity-commands.js";

/**
 * Enregistre le compte où l'argent arrive.
 *
 * Il change — on change de banque — et c'est tout ce qui le distingue de l'ICS,
 * qui lui ne change pas. La différence n'est pas une nuance de rigueur : l'IBAN
 * créancier n'est imprimé sur aucun mandat signé, donc le remplacer ne
 * contredit aucune signature.
 *
 * `Iban.create` valide la clé **mod-97**. Une faute de frappe sur un RIB dicté
 * au téléphone est le mode de panne normal ici, et elle ne se voit pas à l'œil :
 * la refuser à la saisie coûte une seconde, la découvrir au premier lot coûte un
 * mois d'encaissement.
 *
 * 🔴 L'IBAN entre par cette commande et **ne ressort jamais** : ni la vue, ni le
 * journal, ni un message d'erreur ne le portent. Quatre caractères suffisent à
 * répondre à « vers quel compte pointe-t-on ».
 */
@CommandHandler(SetCreditorAccountCommand)
export class SetCreditorAccountHandler implements ICommandHandler<SetCreditorAccountCommand, void> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetCreditorAccountCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    const iban = Iban.create(command.iban);
    entity.setCreditorAccount(iban);

    const at = this.clock.now();
    await this.uow.run(async () => {
      await this.entities.save(entity);
      await this.events.publishTraced(
        new CreditorAccountChangedEvent(command.legalEntityId, at, iban.value.slice(-4)),
      );
    });
  }
}
