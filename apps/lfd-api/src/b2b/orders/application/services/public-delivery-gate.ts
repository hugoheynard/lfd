import type { FulfillmentMethod } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { FeatureLevelResolver } from "../../../feature-access/application/feature-level.resolver.js";
import type { FeatureSubject } from "../../../feature-access/domain/feature-level-resolution.js";
import { PublicDeliveryClosedError } from "../../../feature-access/domain/public-delivery-closed.error.js";
import { CustomerAudiences } from "./customer-audiences.service.js";

/**
 * **La livraison aux particuliers, refusée au serveur quand elle est fermée**
 * — pour un particulier CONNECTÉ (`POST /orders`), comme `PlaceShopOrderHandler`
 * le fait pour qui n'a pas de compte.
 *
 * Jusqu'au 2026-10-07, seule la route sans compte lisait la clé
 * `publicDelivery` : un particulier connecté n'était refusé que par la
 * disponibilité de la livraison à sa clientèle (`openToB2c`), et commandait en
 * livraison alors que l'admin l'avait fermée aux particuliers (audit
 * livraisons, § 3.3 ; Hugo : « pas si la livraison publique est fermée »).
 *
 * Le niveau est lu POUR LA PERSONNE : la clé est exemptible, et c'est ainsi
 * qu'on l'essaie sur une adresse avant de l'ouvrir — la même lecture que
 * l'écran (`GET /me/feature-levels`). Un pro n'est jamais concerné.
 */
@Injectable()
export class PublicDeliveryGate {
  constructor(
    private readonly audiences: CustomerAudiences,
    private readonly features: FeatureLevelResolver,
  ) {}

  /** @throws {PublicDeliveryClosedError} un particulier, en livraison, clé fermée pour lui. */
  async ensureOpen(
    method: FulfillmentMethod,
    companyId: string | null,
    subject: FeatureSubject,
  ): Promise<void> {
    if (method !== "delivery" || (await this.audiences.of(companyId)) === "b2b") {
      return;
    }
    if ((await this.features.levelFor("publicDelivery", subject)) === "closed") {
      throw new PublicDeliveryClosedError();
    }
  }
}
