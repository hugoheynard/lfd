import { Injectable } from "@nestjs/common";

import { InHouseRecapDocument } from "../domain/ports/in-house-recap-document.js";

/**
 * Le document du récapitulatif, pas encore produit : le PDF rangé et
 * l'e-mail arrivent au lot L4 (`plan-restaurants-maison.md`, D10), qui
 * remplace cet adaptateur. Le récapitulatif reste sans `storage_key`.
 */
@Injectable()
export class NoInHouseRecapDocumentYet extends InHouseRecapDocument {
  afterIssued(): Promise<void> {
    return Promise.resolve();
  }
}
