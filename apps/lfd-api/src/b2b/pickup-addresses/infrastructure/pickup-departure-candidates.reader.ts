import { Injectable } from "@nestjs/common";

import {
  type DepartureCandidate,
  DepartureCandidatesReader,
} from "../../../delivery/channels/commerce/index.js";
import { PickupAddressRepository } from "../domain/pickup-address.repository.js";

/**
 * **Le commerce sert à la livraison ses points de retrait**, candidats au
 * départ des tournées — l'implémentation du port que `delivery/` déclare.
 *
 * Il passe par le port des points plutôt que par la table : la lecture (le
 * défaut en tête, les colonnes validées) n'a qu'un seul adaptateur.
 */
@Injectable()
export class PickupDepartureCandidatesReader extends DepartureCandidatesReader {
  constructor(private readonly points: PickupAddressRepository) {
    super();
  }

  async list(): Promise<readonly DepartureCandidate[]> {
    const points = await this.points.list();
    return points.map((point) => ({
      pickupAddressId: point.id,
      label: point.label,
      address: {
        label: point.label,
        ligne1: point.ligne1,
        ligne2: point.ligne2,
        codePostal: point.codePostal,
        ville: point.ville,
        pays: point.pays,
      },
      gps: point.gps ?? null,
      isDefault: point.isDefault,
    }));
  }
}
