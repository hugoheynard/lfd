import { NO_PICKUP_DISCOUNTS, type CustomerAudience, type PickupAddressView } from "@lfd/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { PickupAddressRepository } from "../domain/pickup-address.repository.js";
import { PickupDiscountAnnouncer } from "../domain/pickup-discount.announcer.js";
import { PrismaPickupAddressRepository } from "./prisma-pickup-address.repository.js";

/**
 * **Les points proposés, avec la remise que la caisse appliquera** (plan des
 * promotions, § 14 B5, lots L8 et L12) — l'adaptateur Prisma, dont la
 * remise est remplacée par l'annonce des promotions.
 *
 * Un décorateur plutôt qu'une branche dans l'adaptateur : la lecture des
 * sites ne sait rien des promotions. Depuis L12, les colonnes de remise du
 * site ne sont plus jamais servies — un point sans promotion n'annonce rien.
 *
 * Tous les lecteurs du port en héritent — la liste de la boutique, la
 * caisse, les heures limites : un seul endroit dit la remise d'un point.
 */
@Injectable()
export class AnnouncedPickupAddressRepository extends PickupAddressRepository {
  constructor(
    // Le port, injecté par la classe Prisma : le décorateur ne dépend que du
    // contrat qu'il enveloppe, et un doublé du port le teste.
    @Inject(PrismaPickupAddressRepository) private readonly sites: PickupAddressRepository,
    private readonly announcer: PickupDiscountAnnouncer,
  ) {
    super();
  }

  async list(audience: CustomerAudience | null): Promise<readonly PickupAddressView[]> {
    return this.announce(await this.sites.list(audience));
  }

  async resolve(id: string): Promise<PickupAddressView | null> {
    const point = await this.sites.resolve(id);
    return point === null ? null : ((await this.announce([point]))[0] ?? point);
  }

  private async announce(
    points: readonly PickupAddressView[],
  ): Promise<readonly PickupAddressView[]> {
    if (points.length === 0) {
      return points;
    }
    const announced = await this.announcer.announced(points.map((point) => point.id));
    return points.map((point) => ({
      ...point,
      discounts: announced.get(point.id) ?? NO_PICKUP_DISCOUNTS,
    }));
  }
}
