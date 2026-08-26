import { deliverySpecsSchema } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
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
    // La société vient avec l'adresse : la signature se résout ICI, et c'est le
    // seul endroit où les deux étages sont visibles ensemble. Les lire en deux
    // requêtes laisserait à l'appelant le soin de les composer — donc à chaque
    // appelant, donc un jour à un appelant qui l'oublie.
    const row = await this.prisma.address.findUnique({
      where: { id: addressId },
      select: {
        deliverySpecs: true,
        company: { select: { deliverySignatureRequired: true } },
      },
    });
    const floor = row?.company.deliverySignatureRequired ?? false;
    const specs = deliverySpecsSchema.safeParse(row?.deliverySpecs);
    if (!specs.success) {
      // Une adresse sans consignes lisibles hérite : elle n'a jamais rien
      // décidé, et le socle de la société est ce qu'il reste de vrai.
      return { ...NO_DELIVERY_DEFAULTS, signatureRequired: floor };
    }
    return {
      contact: specs.data.deliveryContact,
      // `null` = l'adresse hérite. C'est la seule ligne de tout ce chantier qui
      // décide vraiment : deux états auraient figé le socle au moment où
      // l'adresse a été créée.
      signatureRequired: specs.data.signatureRequired ?? floor,
      // Le créneau « tous les jours » est le seul qui vaille comme
      // préremplissage : un créneau PAR JOUR dépend du jour servi, que le
      // panier ne connaît qu'après le choix de la date. Le brancher demanderait
      // de faire dépendre le défaut de la date — à faire le jour où le besoin
      // se présente, pas à deviner ici.
      window: specs.data.slots.mode === "everyday" ? specs.data.slots.slot : null,
    };
  }
}
