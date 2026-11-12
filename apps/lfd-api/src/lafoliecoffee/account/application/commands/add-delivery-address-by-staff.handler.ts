import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { CompanyStepReachedEvent } from "../../domain/events/company-step-reached.event.js";
import { DeliveryAddressAddedByStaffEvent } from "../../domain/events/staff-address-acts.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { AddDeliveryAddressByStaffCommand } from "./add-delivery-address-by-staff.command.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";
import { deliveryAddressOf } from "../../domain/events/journal-names.js";
import { DELIVERY_ADDRESS_ADDED } from "../../domain/events/site-gesture.fact.js";
import { SiteGesturePublisher } from "../services/site-gesture.publisher.js";

/** Le nom stable du geste, dans le registre des intentions. */
const ADD_DELIVERY_GESTURE = "account.add-delivery-address-by-staff";

/**
 * Geste du staff sur les **adresses** d'un client : une adresse de livraison de
 * plus.
 *
 * Il partage avec les autres gestes d'adresse staff un dépôt, un mur (le
 * rattachement à la société) et une famille de faits (`staff-address-acts`).
 *
 * **Une fois par intention** : la clé de l'écran est réclamée avant tout et
 * scellée dans la transaction de l'ajout ; un double clic rend l'adresse déjà
 * ajoutée, sans seconde adresse ni second fait. Le sujet est la société et
 * l'empreinte de la saisie : la même clé sur une autre adresse est refusée (409).
 *
 * @throws {GestureInFlightError} la même clé est encore en vol.
 * @throws {IntentKeyReusedError} la clé a servi pour un autre ajout.
 */
@CommandHandler(AddDeliveryAddressByStaffCommand)
export class AddDeliveryAddressByStaffHandler implements ICommandHandler<
  AddDeliveryAddressByStaffCommand,
  string
> {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly names: AccountJournalNames,
    private readonly gestures: SiteGesturePublisher,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: AddDeliveryAddressByStaffCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: ADD_DELIVERY_GESTURE,
        subject: intentSubject(command.companyId, command.payload),
      },
      CREATED_ID_REPLAY,
      (seal) => this.add(command, seal),
    );
  }

  private async add(
    command: AddDeliveryAddressByStaffCommand,
    seal: (addressId: string) => Promise<void>,
  ): Promise<string> {
    const book = await this.addresses.loadDeliveryBook(command.companyId);
    const created = this.ids.next();
    book.add(created, command.payload, this.clock.now());
    const company = await this.names.company(command.companyId);
    const addressId = await this.uow.run(async () => {
      await this.addresses.saveDeliveryBook(book);
      await this.gestures.publish({
        type: DELIVERY_ADDRESS_ADDED,
        site: company,
        subjectId: created,
        actor: { kind: "team" },
      });
      await this.events.publishTraced(
        new DeliveryAddressAddedByStaffEvent(
          company,
          deliveryAddressOf(book, created),
          command.payload,
        ),
      );
      await seal(created);
      return created;
    });
    // Pièce « livraison » franchie : fait d'entonnoir, best-effort.
    this.events.publish(new CompanyStepReachedEvent(company.id, company.name, "delivery"));
    return addressId;
  }
}
