import {
  cartAdjustmentCents,
  type BillingAddressPayload,
  type CartAdjustment,
  type FulfillmentMethod,
  type OrderLineInput as OrderLineRequest,
  type PickupAddressView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { DeliveryZoneRepository } from "../../../delivery-zones/domain/delivery-zone.repository.js";
import { PickupAddressRepository } from "../../../pickup-addresses/domain/pickup-address.repository.js";
import { type DeliveryContact, type FulfillmentWindow } from "@lfd/contracts";
import {
  DeliveryDefaultsReader,
  NO_DELIVERY_DEFAULTS,
} from "../../domain/ports/delivery-defaults.reader.js";
import {
  agreeFulfillment,
  type FulfillmentDefaults,
  windowFitsPickup,
} from "../../domain/services/agreed-fulfillment.js";
import { Order } from "../../domain/entities/order.js";
import {
  InvalidOrderFulfillmentError,
  NoDeliveryZoneForPostalCodeError,
  PickupClosedAtRequestedTimeError,
  PickupNotConfiguredError,
  UnknownSkuError,
} from "../../domain/errors/order-errors.js";
import { pricingContextFor } from "../../../pricing/application/pricing-context.js";
import { PriceFloorReader } from "../../../pricing/domain/ports/price-floor.reader.js";
import { PriceRuleReader } from "../../../pricing/domain/ports/price-rule.reader.js";
import { decideFloor } from "../../../pricing/domain/floor-policy.js";
import { observedRatioBp } from "../../../pricing/domain/elasticity.js";
import { rollingWindows } from "../../../pricing/domain/elasticity-windows.js";
import { SkuVolumeReader } from "../../../pricing/domain/ports/sku-volume.reader.js";
import { VolumeLadderReader } from "../../../pricing/domain/ports/volume-ladder.reader.js";
import { ladderAsRule } from "../../../pricing/domain/volume-ladder.js";
import { floorCentsFor, resolveScopedFloor } from "../../../pricing/domain/resolve-floor.js";
import { resolvePrice } from "../../../pricing/domain/resolve-price.js";
import { ProductCatalogReader } from "../../domain/ports/product-catalog.reader.js";
import type { PriceRule, ScopedPriceFloor } from "../../../pricing/domain/price-rule.js";
import type { OrderLineInput } from "../../domain/value-objects/order-line.js";

/** Ce qu'un panier demande, quelle que soit la porte par laquelle il arrive. */
export interface OrderContent {
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly deliveryAddress: BillingAddressPayload | null;
  /** L'adresse du carnet dont elle vient, ou `null` si dictée à la volée. */
  readonly deliveryAddressId: string | null;
  readonly pickupAddressId: string | null;
  readonly requestedDeliveryDate: string | null;
  /**
   * La tranche demandée — engagement, pas préférence. `undefined` = l'écran ne
   * se prononce pas, le réglage du client s'applique (cf. `agreeFulfillment`).
   */
  readonly requestedWindow?: FulfillmentWindow | null | undefined;
  /** Qui reçoit, tel que l'écran l'affiche. `undefined` = prendre le réglage. */
  readonly deliveryContact?: DeliveryContact | null | undefined;
  readonly signatureRequired?: boolean | undefined;
  readonly note: string;
  readonly lines: readonly OrderLineRequest[];
}

/** Qui est concerné : le client porté, et le membre de l'équipe s'il a saisi. */
export interface OrderParties {
  readonly companyId: string | null;
  readonly placedByUserId: string;
  readonly placedByStaffId: string | null;
}

/** Acheminement résolu : les snapshots à figer et les deux ajustements de prix. */
interface ResolvedFulfillment {
  readonly deliveryZoneId: string | null;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddress: BillingAddressPayload | null;
  readonly discountCents: number;
  /** L'ajustement figé qui l'a produite (taux/montant du point), ou `null`. */
  readonly discountAdjustment: CartAdjustment | null;
  readonly deliveryFeeCents: number;
}

/**
 * **Composer** une commande : ré-résoudre les prix au catalogue, résoudre
 * l'acheminement et ses ajustements, puis laisser l'agrégat calculer ses montants.
 *
 * Extrait des handlers parce qu'il y en a désormais deux — le client qui commande
 * pour lui-même, et l'équipe qui saisit pour un client. Ce qui les distingue est
 * le **mur** et la **décision de règlement**, jamais la façon de composer le
 * panier : une seconde implémentation aurait fini par appliquer une autre remise
 * de retrait, ou par oublier de déduire la zone du code postal — sur le chemin
 * qu'on teste le moins.
 *
 * Ce service ne décide **rien** : ni qui a le droit, ni comment on encaisse. Il
 * rend une commande dont le règlement n'est pas encore tranché, et `toPersistence`
 * refusera de la sérialiser tant qu'il ne l'est pas.
 */
@Injectable()
export class OrderDrafting {
  constructor(
    private readonly catalog: ProductCatalogReader,
    private readonly priceRules: PriceRuleReader,
    private readonly priceFloors: PriceFloorReader,
    private readonly skuVolumes: SkuVolumeReader,
    private readonly volumeLadders: VolumeLadderReader,
    private readonly pickups: PickupAddressRepository,
    private readonly zones: DeliveryZoneRepository,
    private readonly deliveryDefaults: DeliveryDefaultsReader,
  ) {}

  /** Compose la commande. Le règlement reste à décider par l'appelant. */
  async draft(parties: OrderParties, content: OrderContent): Promise<Order> {
    const lines = await this.resolveLines(content.lines, parties);
    const subtotalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
    const acheminement = await this.resolveFulfillment(content, subtotalCents);
    const agreed = agreeFulfillment(
      {
        window: content.requestedWindow,
        contact: content.deliveryContact,
        signatureRequired: content.signatureRequired,
      },
      await this.defaultsFor(content),
    );
    return Order.draft({
      agreed,
      companyId: parties.companyId,
      placedByUserId: parties.placedByUserId,
      placedByStaffId: parties.placedByStaffId,
      fulfillment: {
        method: content.fulfillmentMethod,
        deliveryZoneId: acheminement.deliveryZoneId,
        deliveryAddress: acheminement.deliveryAddress,
        pickupAddress: acheminement.pickupAddress,
      },
      requestedDeliveryDate: content.requestedDeliveryDate
        ? new Date(content.requestedDeliveryDate)
        : null,
      note: content.note,
      lines,
      discountCents: acheminement.discountCents,
      discountAdjustment: acheminement.discountAdjustment,
      deliveryFeeCents: acheminement.deliveryFeeCents,
    });
  }

  /**
   * Les réglages qui **préremplissent** cette commande.
   *
   * En coursier ils viennent de l'adresse du carnet — et seulement si elle en
   * vient : une adresse dictée à la volée n'a aucun réglage, donc tout ce que le
   * client y met est un choix, pas une reprise.
   *
   * En retrait il n'y a **aucun défaut** : le point est partagé entre tous les
   * clients, ses heures sont une contrainte d'ouverture et non une préférence de
   * ce client-là. Ce que le client demande y est donc toujours un choix.
   */
  private async defaultsFor(content: OrderContent): Promise<FulfillmentDefaults> {
    if (content.fulfillmentMethod === "pickup" || content.deliveryAddressId === null) {
      return NO_DELIVERY_DEFAULTS;
    }
    return this.deliveryDefaults.of(content.deliveryAddressId);
  }

  /**
   * Résout l'acheminement et ses deux ajustements (autoritaires, jamais envoyés
   * par le client). **Retrait** : snapshot du point (choisi ou défaut) + sa remise.
   * **Coursier** : adresse livrée figée + zone **déduite de son code postal**,
   * dont on tire le frais.
   */
  private async resolveFulfillment(
    content: OrderContent,
    subtotalCents: number,
  ): Promise<ResolvedFulfillment> {
    if (content.fulfillmentMethod === "pickup") {
      const point = await this.pickups.resolve(content.pickupAddressId);
      if (point === null) {
        throw new PickupNotConfiguredError();
      }
      // La tranche demandée doit tenir dans l'une des fenêtres du point — jamais
      // dans leur union : entre le créneau pro et l'ouverture publique il peut y
      // avoir porte close, et l'accepter serait promettre une remise impossible.
      if (!windowFitsPickup(content.requestedWindow ?? null, point.opening)) {
        throw new PickupClosedAtRequestedTimeError();
      }
      return {
        deliveryZoneId: null,
        deliveryAddress: null,
        pickupAddress: toSnapshot(point),
        discountCents: point.discount ? cartAdjustmentCents(point.discount, subtotalCents) : 0,
        discountAdjustment: point.discount,
        deliveryFeeCents: 0,
      };
    }

    // Coursier — le schéma garantit l'adresse ; on garde une défense typée.
    const address = content.deliveryAddress;
    if (address === null) {
      throw new InvalidOrderFulfillmentError("Adresse de livraison requise en coursier.");
    }
    // La zone se DÉDUIT du code postal livré : c'est une propriété de l'adresse,
    // pas un choix. Personne ne peut donc annoncer un secteur moins cher que le sien.
    const zone = await this.zones.resolveForPostalCode(address.codePostal);
    if (zone === null) {
      throw new NoDeliveryZoneForPostalCodeError(address.codePostal);
    }
    return {
      deliveryZoneId: zone.id,
      deliveryAddress: address,
      pickupAddress: null,
      discountCents: 0,
      // Le coursier n'ouvre droit à aucune remise : c'est le retrait qui en porte une.
      discountAdjustment: null,
      deliveryFeeCents: cartAdjustmentCents(zone.fee, subtotalCents),
    };
  }

  /**
   * Fusionne les lignes par SKU (quantités additionnées) puis résout chacune —
   * c'est ici que le prix devient autoritaire, jamais celui du client.
   *
   * Trois étapes, dans cet ordre : le **catalogue** donne le prix canonique, les
   * **règles tarifaires** l'altèrent, et le **plancher** arbitre le résultat. La
   * fusion par SKU précède les trois, et
   * c'est ce qui rend le palier de volume juste : deux lignes de 60 croissants
   * ouvrent le palier « 100+ », alors qu'aucune ne l'ouvrirait seule.
   */
  private async resolveLines(
    input: readonly OrderLineRequest[],
    parties: OrderParties,
  ): Promise<OrderLineInput[]> {
    const quantities = new Map<string, number>();
    for (const line of input) {
      quantities.set(line.sku, (quantities.get(line.sku) ?? 0) + line.quantity);
    }

    // L'instant est pris UNE fois pour toute la commande : deux lignes résolues à
    // quelques millisecondes d'écart pourraient sinon tomber de part et d'autre
    // du basculement d'une promotion.
    const at = new Date();

    // Le catalogue est résolu EN UN LOT, avant la boucle : depuis qu'il vient de
    // la base, le résoudre ligne à ligne ferait une requête par ligne de panier
    // sur le chemin qui facture.
    const catalogue = await this.catalog.resolveMany([...quantities.keys()]);

    return Promise.all(
      [...quantities].map(async ([sku, quantity]) => {
        const item = catalogue.get(sku) ?? null;
        if (item === null) {
          throw new UnknownSkuError(sku);
        }
        const context = pricingContextFor(item.sku, item.category, quantity, parties, at);
        const [rules, floors, ladders] = await Promise.all([
          this.priceRules.candidatesFor(context),
          this.priceFloors.candidatesFor(context),
          this.volumeLadders.candidatesFor(context),
        ]);

        // Le barème de volume rejoint les règles sous la forme de la règle
        // d'étage volume qu'il est à CETTE quantité. La spécificité arbitre
        // ensuite comme d'habitude — un barème de produit l'emporte sur celui de
        // sa famille, sans que la résolution apprenne un cas de plus.
        const volumeRules = ladders
          .map((ladder) => ladderAsRule(ladder, context))
          .filter((rule): rule is PriceRule => rule !== null);

        // Quel plancher VISE cet article, puis lequel de ses étages s'ouvre :
        // deux questions distinctes, la seconde dépendant de la commande et de
        // l'historique.
        const scoped = resolveScopedFloor(floors, context);
        const decision =
          scoped === null
            ? null
            : decideFloor(scoped.policy, {
                quantity,
                observedVolumeRatioBp: await this.observedRatio(item.sku, scoped, at),
              });

        const resolved = resolvePrice(
          item.unitPriceCents,
          [...rules, ...volumeRules],
          context,
          decision?.applied ?? null,
        );

        return {
          sku: item.sku,
          productName: item.name,
          unitPriceCents: resolved.finalCents,
          vatRate: item.vatRate,
          quantity,
          // La trace part avec le prix, et pour la même raison : dans six mois,
          // les règles qui l'ont produit peuvent avoir été retirées. Sans elle,
          // la seule réponse à « pourquoi ce prix ? » serait « c'était le prix ».
          pricing: {
            basePriceCents: resolved.basePriceCents,
            steps: resolved.steps,
            floored: resolved.floored,
            // La décision de plancher est figée AVEC le prix. C'est ce qui rend
            // le plancher dynamique tenable : sans la mesure consignée, un prix
            // qui dépend de l'historique cesse d'être explicable dès que
            // l'historique bouge. Elle ne se relit jamais.
            floorDecision:
              decision === null
                ? null
                : {
                    tier: decision.tier,
                    floorCents: floorCentsFor(decision.applied, item.unitPriceCents),
                    observedVolumeRatioBp: decision.unlock?.observedVolumeRatioBp ?? null,
                    quantityMet: decision.unlock?.quantityMet ?? true,
                    volumeMet: decision.unlock?.volumeMet ?? true,
                  },
          },
        };
      }),
    );
  }

  /**
   * Le ratio de volume observé sur cet article — **uniquement quand il décide
   * de quelque chose**.
   *
   * Aucune requête si le plancher n'a pas de porte, ou si sa clé ne parle pas de
   * volume : la très grande majorité des commandes ne paie donc rien pour cette
   * mesure. C'est la seule façon d'admettre une lecture d'historique sur le
   * chemin qui facture sans le ralentir pour tout le monde.
   */
  private async observedRatio(
    sku: string,
    scoped: ScopedPriceFloor,
    at: Date,
  ): Promise<number | null> {
    if (scoped.policy.dynamic?.unlock.minVolumeRatioBp == null) {
      return null;
    }
    const windows = rollingWindows(at);
    const [baseline, observed] = await Promise.all([
      this.skuVolumes.volumesFor([sku], windows.baseline),
      this.skuVolumes.volumesFor([sku], windows.observed),
    ]);
    return observedRatioBp(baseline.get(sku) ?? 0, observed.get(sku) ?? 0);
  }
}

/** Le point de retrait résolu, réduit à ses champs postaux (le snapshot figé). */
function toSnapshot(point: PickupAddressView): BillingAddressPayload {
  return {
    label: point.label,
    ligne1: point.ligne1,
    ligne2: point.ligne2,
    codePostal: point.codePostal,
    ville: point.ville,
    pays: point.pays,
  };
}
