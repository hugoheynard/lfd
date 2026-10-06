import { Injectable } from "@nestjs/common";

import {
  type DeliveryAddressPointCorrection,
  DeliveryAddressPointCorrector,
} from "../../../../delivery/channels/commerce/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DeliveryAddressPointCorrectedEvent } from "../../domain/events/delivery-address-point.event.js";
import { deliveryAddressOf } from "../../domain/events/journal-names.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { AccountJournalNames } from "./account-journal-names.service.js";

/**
 * **Le carnet corrigé à la demande de la livraison**
 * (`documentation/livraisons/gps-y-aller-et-position.md`, §6) — le
 * commerce implémente `DeliveryAddressPointCorrector`.
 *
 * Le cycle de tout geste du carnet : charger le carnet POUR cette société (une
 * adresse d'une autre est introuvable — le mur), muter par
 * `correctPoint`, écrire, journaliser dans la même unité. Un point déjà en
 * place n'écrit rien et ne journalise rien.
 *
 * L'unité REJOINT celle de l'appelant (`PrismaUnitOfWork`) : la décision de la
 * livraison et l'écriture du carnet partent ensemble.
 *
 * @throws {CompanyAddressNotFoundError} @throws {InvalidAddressPointError}
 */
@Injectable()
export class CommerceDeliveryAddressPointCorrector extends DeliveryAddressPointCorrector {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly names: AccountJournalNames,
  ) {
    super();
  }

  async correct(correction: DeliveryAddressPointCorrection): Promise<void> {
    const book = await this.addresses.loadDeliveryBook(correction.companyId);
    if (!book.correctPoint(correction.addressId, correction.kind, correction.point)) {
      return;
    }
    const company = await this.names.company(correction.companyId);
    const address = deliveryAddressOf(book, correction.addressId);
    await this.uow.run(async () => {
      await this.addresses.saveDeliveryBook(book);
      await this.events.publishTraced(
        new DeliveryAddressPointCorrectedEvent(company, address, correction.kind),
      );
    });
  }
}
