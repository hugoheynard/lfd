import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DeliveryAddressAddedByMemberEvent } from "../../domain/events/member-acts.event.js";
import { Clock } from "../../../../platform/time/clock.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { CompanyStepReachedEvent } from "../../domain/events/company-step-reached.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { AddDeliveryAddressCommand } from "./address-commands.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";
import { deliveryAddressOf } from "../../domain/events/journal-names.js";
import { DELIVERY_ADDRESS_ADDED } from "../../domain/events/site-gesture.fact.js";
import { SiteGesturePublisher } from "../services/site-gesture.publisher.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { customerIntentActor } from "../../../shared/intent/customer-intent-actor.js";

/** Le nom stable du geste, dans le registre des intentions. */
const ADD_DELIVERY_GESTURE = "account.add-delivery-address";

/**
 * Ajoute une adresse de livraison, réservé au gestionnaire de l'entreprise.
 *
 * Le handler n'arbitre rien : c'est le carnet qui sait si cette adresse devient
 * le défaut — notamment quand c'est la première, cas qu'aucun écran ne demande
 * mais que le modèle exige.
 *
 * Journalisé dans la transaction de l'écriture depuis le 2026-09-19 (plan
 * `documentation/journalisation/plan-journal-d-activite.md` §3, décision 1) —
 * sous le nom du geste staff jumeau, sans coordonnée.
 *
 * **Une fois par intention** : la clé de l'écran est réclamée après le mur et
 * scellée dans la transaction de l'écriture ; un double envoi rend l'adresse déjà ajoutée,
 * sans seconde adresse ni second fait. L'acteur est le client (`customer:<id>`).
 *
 * @throws {GestureInFlightError} la même clé est encore en vol.
 * @throws {IntentKeyReusedError} la clé a servi pour une autre saisie.
 */
@CommandHandler(AddDeliveryAddressCommand)
export class AddDeliveryAddressHandler implements ICommandHandler<
  AddDeliveryAddressCommand,
  string
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly names: AccountJournalNames,
    private readonly gestures: SiteGesturePublisher,
    private readonly intents: OncePerIntent,
  ) {}

  async execute(command: AddDeliveryAddressCommand): Promise<string> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);
    return this.intents.runSealed(
      {
        actorId: customerIntentActor(command.actorUserId),
        key: command.intentKey,
        gesture: ADD_DELIVERY_GESTURE,
        subject: intentSubject(command.companyId, command.payload),
      },
      CREATED_ID_REPLAY,
      (seal) => this.add(command, seal),
    );
  }

  private async add(
    command: AddDeliveryAddressCommand,
    seal: (addressId: string) => Promise<void>,
  ): Promise<string> {
    const book = await this.addresses.loadDeliveryBook(command.companyId);
    const addressId = this.ids.next();
    book.add(addressId, command.payload, this.clock.now());
    const company = await this.names.company(command.companyId);
    await this.uow.run(async () => {
      await this.addresses.saveDeliveryBook(book);
      await this.gestures.publish({
        type: DELIVERY_ADDRESS_ADDED,
        site: company,
        subjectId: addressId,
        actor: { kind: "customer", userId: command.actorUserId },
      });
      await this.events.publishTraced(
        new DeliveryAddressAddedByMemberEvent(
          company,
          deliveryAddressOf(book, addressId),
          command.payload,
        ),
      );
      await seal(addressId);
    });

    // Pièce d'activation « livraison » franchie (journal idempotent par étape).
    this.events.publish(new CompanyStepReachedEvent(company.id, company.name, "delivery"));
    return addressId;
  }
}
