import { deliverySpecsSchema } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import {
  type DeliveryDefaults,
  DeliveryDefaultsReader,
  NO_DELIVERY_DEFAULTS,
} from "../domain/ports/delivery-defaults.reader.js";

/**
 * Les consignes d'une adresse du carnet, lues **au moment de la commande** —
 * après quoi elles sont figées sur elle et plus jamais relues.
 *
 * Le JSON est validé plutôt que casté : une adresse antérieure aux consignes
 * n'en porte pas, et une forme inattendue ne doit pas entrer dans une commande.
 * Dans les deux cas on retombe sur « aucun réglage », ce qui rend simplement
 * tout ce que le client saisit *choisi* plutôt que *repris*.
 */
@Injectable()
export class PrismaDeliveryDefaultsReader extends DeliveryDefaultsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async of(addressId: string): Promise<DeliveryDefaults> {
    const row = await this.prisma.address.findUnique({
      where: { id: addressId },
      select: { deliverySpecs: true },
    });
    const specs = deliverySpecsSchema.safeParse(row?.deliverySpecs);
    if (!specs.success) {
      return NO_DELIVERY_DEFAULTS;
    }
    return {
      contact: specs.data.deliveryContact,
      signatureRequired: specs.data.signatureRequired,
      // Le créneau « tous les jours » est le seul qui vaille comme
      // préremplissage : un créneau PAR JOUR dépend du jour servi, que le
      // panier ne connaît qu'après le choix de la date. Le brancher demanderait
      // de faire dépendre le défaut de la date — à faire le jour où le besoin
      // se présente, pas à deviner ici.
      window: specs.data.slots.mode === "everyday" ? specs.data.slots.slot : null,
    };
  }
}
