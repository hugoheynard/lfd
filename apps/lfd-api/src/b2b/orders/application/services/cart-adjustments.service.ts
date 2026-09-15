import {
  cartAdjustmentCents,
  deliveryOpenTo,
  discountCentsOf,
  pickupDiscountFor,
  type CartAdjustment,
  type CustomerAudience,
} from "@lfd/contracts";
import type { DeliveryZoneView, PickupAddressView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { DeliveryAvailabilityReader } from "../../../delivery-availability/domain/ports/delivery-availability.reader.js";
import { DeliveryZoneRepository } from "../../../delivery-zones/domain/delivery-zone.repository.js";
import { PickupAddressRepository } from "../../../pickup-addresses/domain/pickup-address.repository.js";
import {
  DeliveryClosedForAudienceError,
  NoDeliveryZoneForPostalCodeError,
  PickupNotConfiguredError,
} from "../../domain/errors/order-errors.js";

/** Le point de retrait retenu, et ce qu'il retire du panier. */
export interface ResolvedPickup {
  readonly point: PickupAddressView;
  readonly discountCents: number;
  readonly discountAdjustment: CartAdjustment | null;
}

/** La zone déduite du code postal, et ce qu'elle ajoute au panier. */
export interface ResolvedDelivery {
  readonly zone: DeliveryZoneView;
  readonly feeCents: number;
  /**
   * **Ce qui a produit** `feeCents` — le barème de la zone, tel qu'il était.
   *
   * Rendu à côté du montant pour que la commande le FIGE, exactement comme elle
   * fige déjà celui de la remise : `zone.fee` est mutable, et un montant nu ne
   * se relit pas. Cf. `OrderView.deliveryFeeAdjustment`.
   */
  readonly feeAdjustment: CartAdjustment;
}

/**
 * **Ce que l'acheminement retire ou ajoute au panier**, et rien d'autre.
 *
 * ## Pourquoi ce service existe
 *
 * Deux surfaces posent la même question : la **caisse**, qui compose une
 * commande, et le **devis de la boutique**, qui annonce ce qu'elle coûtera. La
 * réponse doit être identique au centime — c'est tout l'objet d'un devis.
 *
 * La réponse dépend aussi de la **clientèle** (plan
 * `remise-et-livraison-par-clientele`, D3 et D5) : une remise de point peut ne
 * viser que les pros ou que les particuliers, et la livraison peut être fermée
 * à l'une des deux. Cette dépendance-là vit ICI aussi, et nulle part ailleurs —
 * au 2026-09-15, aucun autre chemin ne compose remise ni frais (un seul
 * `Order.draft`, l'estimation staff s'arrête au sous-total, les abonnements ne
 * génèrent pas de commande ; vérifié ce jour-là).
 *
 * Ce service ne DÉDUIT pas la clientèle : il la reçoit. C'est `CustomerAudiences`,
 * appelé par ses deux appelants, qui la tire du statut de la société agissante.
 *
 * Cette règle vivait dans `OrderDrafting.resolveFulfillment`, en privé. L'y
 * laisser aurait obligé le devis à la réécrire : six lignes, deux fois, dont la
 * seconde aurait dérivé au premier changement de politique de remise. C'est le
 * synonyme que ce dépôt refuse partout ailleurs sur l'arithmétique d'argent.
 *
 * ## Ce qu'il ne fait pas
 *
 * Ni snapshot, ni contrôle d'horaire, ni décision d'acheminement : la caisse a
 * besoin de tout cela, le devis d'aucun. Ce service rend **le point, la zone,
 * et les deux montants** ; ce qu'on en fige ensuite regarde l'appelant.
 *
 * Il ne connaît pas non plus le taux de TVA du transport : le montant sort
 * hors taxe, et c'est `ventilateVat` qui le frappe, au même endroit pour les
 * deux surfaces.
 */
@Injectable()
export class CartAdjustments {
  constructor(
    private readonly pickups: PickupAddressRepository,
    private readonly zones: DeliveryZoneRepository,
    private readonly delivery: DeliveryAvailabilityReader,
  ) {}

  /**
   * Le point retenu — celui qu'on a choisi, ou **le point par défaut** — et sa
   * remise **pour cette clientèle**.
   *
   * `pickupAddressId` peut être `null` : le client n'a rien choisi, et c'est
   * alors le défaut qui sert. Rendre le point ET son identifiant compte pour
   * la caisse, qui doit opposer l'heure limite du point EFFECTIVEMENT retenu.
   *
   * Une remise qui ne vise pas la clientèle rend `0` et `null` — ce que la
   * commande fige alors, comme pour un point sans remise.
   *
   * @throws {PickupNotConfiguredError} aucun point n'est configuré.
   */
  async forPickup(
    pickupAddressId: string | null,
    subtotalCents: number,
    audience: CustomerAudience,
  ): Promise<ResolvedPickup> {
    const point = await this.pickups.resolve(pickupAddressId);
    if (point === null) {
      throw new PickupNotConfiguredError();
    }
    const discount = pickupDiscountFor(point, audience);
    return {
      point,
      // `discountCentsOf` et non `cartAdjustmentCents` : une remise est bornée à
      // ce qu'elle remise. Les frais de zone, juste en dessous, ne le sont pas —
      // une course peut coûter plus cher qu'un petit panier.
      discountCents: discount === null ? 0 : discountCentsOf(discount, subtotalCents),
      discountAdjustment: discount,
    };
  }

  /**
   * La zone **déduite du code postal livré**, et ses frais — si la livraison est
   * proposée à cette clientèle.
   *
   * Déduite, jamais choisie : c'est une propriété de l'adresse. Personne ne peut
   * donc annoncer un secteur moins cher que le sien — ni à la commande, ni au
   * devis, ce qui est la moitié de la raison d'être de ce service.
   *
   * L'ouverture se juge AVANT la zone : fermée, la livraison l'est partout, et
   * répondre « on ne livre pas ce code postal » mentirait sur la raison.
   *
   * @throws {DeliveryClosedForAudienceError} la livraison est fermée à la clientèle.
   * @throws {NoDeliveryZoneForPostalCodeError} on ne livre pas ce code postal.
   */
  async forDelivery(
    codePostal: string,
    subtotalCents: number,
    audience: CustomerAudience,
  ): Promise<ResolvedDelivery> {
    if (!deliveryOpenTo(await this.delivery.current(), audience)) {
      throw new DeliveryClosedForAudienceError();
    }
    const zone = await this.zones.resolveForPostalCode(codePostal);
    if (zone === null) {
      throw new NoDeliveryZoneForPostalCodeError(codePostal);
    }
    return {
      zone,
      feeCents: cartAdjustmentCents(zone.fee, subtotalCents),
      feeAdjustment: zone.fee,
    };
  }
}
