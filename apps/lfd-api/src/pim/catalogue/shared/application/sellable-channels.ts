import { PointOfSaleOfferReader } from "../domain/ports/point-of-sale-offer.reader.js";
import {
  ContextNotOfferedError,
  UnknownPointOfSaleError,
} from "../domain/errors/channel-errors.js";
import {
  referencedPointsOfSale,
  type SalesChannels,
} from "../domain/value-objects/sales-channels.js";

/**
 * Refuse une matrice invendable — **une seule fois pour les deux dépôts**.
 *
 * Les familles et les fiches portent la même matrice et méritent donc la même
 * garde. Elle était écrite deux fois, à l'identique ; deux copies finissent par
 * ne plus refuser les mêmes choses, et c'est la fiche qui aurait gagné le droit
 * de vendre là où sa famille ne peut pas.
 *
 * Une lecture, pas une clé étrangère : la seconde tient l'EXISTENCE du point de
 * vente (`Restrict`), pas son offre — laquelle vit dans une autre table. Le
 * refus est donc prononcé ici, avant l'écriture.
 */
export async function refuseUnsellableChannels(
  channels: SalesChannels,
  offers: PointOfSaleOfferReader,
): Promise<void> {
  const cited = referencedPointsOfSale(channels);
  const offered = await offers.offersOf(cited);
  for (const channel of channels) {
    const contexts = offered.get(channel.pointOfSaleId);
    if (contexts === undefined) {
      throw new UnknownPointOfSaleError(channel.pointOfSaleId);
    }
    if (!contexts.has(channel.context)) {
      throw new ContextNotOfferedError(channel.pointOfSaleId, channel.context);
    }
  }
}
