import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { ShipmentRef } from "../../domain/value-objects/shipment-ref.value-object.js";
import { instantOf, piecesOf, textOf } from "../packing/payload-fields.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const PRODUCTION_DAY_RETAKEN = "production.day_retaken";

/**
 * **Le tirage d'une journée arrêtée vient d'être repris** — fait DURABLE
 * (plan `documentation/fournil/dossier-prod-du-jour.md`, décision 2,
 * lot E3).
 *
 * Publié par `RetakeProductionDayHandler` dans l'unité de travail du retirage,
 * et SEULEMENT quand des commandes ont été absorbées : un retirage à zéro ne
 * change ni la journée ni `retaken`, il n'y a donc rien de neuf à annoncer.
 *
 * Il vit dans le canal de la LIVRAISON depuis le 2026-10-06 (plan
 * `livraisons/tournees/composition-automatique.md`, §4, CA6b) : la livraison
 * l'écoute pour apprendre les livraisons ajoutées au plan arrêté. Le fournil
 * reste abonné lui-même (l'envoi du dossier complété).
 *
 * `shipments` : les envois ABSORBÉS par ce retirage (plan E7 reliquat,
 * choix 12 — il portait `orderIds`, des commandes nues). Trois formes à la
 * relecture : `shipments` ; l'ancienne `orderIds`, lue au rang 1 ; ni l'une
 * ni l'autre (fait écrit avant CA6b), rendu `shipments: null` plutôt que de
 * lever — sans quoi chaque fait en attente deviendrait un message mort. Deux
 * sources de la liste des arrivées coexistent (`publishArrivals` pour le
 * colisage, ce fait pour la livraison) : assumé, chacune sert son canal (S4).
 *
 * Clé : `production.day_retaken:<serviceDay>:<retakenAt>` — un retirage, un
 * fait ; deux retirages ont deux instants. Le reliquat ne la change pas : il
 * est dans la charge.
 */
export class ProductionDayRetakenEvent implements DurableEvent {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    /** L'instant du retirage — celui que la journée garde en `retaken.at`. */
    readonly retakenAt: Date,
    /** Les commandes absorbées, ≥ 1. */
    readonly absorbed: number,
    /** Les envois absorbés ; `null` sur un fait écrit avant CA6b. */
    readonly shipments: readonly ShipmentRef[] | null,
  ) {}

  durableFact(): DurableFact {
    return {
      type: PRODUCTION_DAY_RETAKEN,
      key: `${PRODUCTION_DAY_RETAKEN}:${this.serviceDay}:${this.retakenAt.toISOString()}`,
      payload: {
        serviceDay: this.serviceDay,
        retakenAt: this.retakenAt.toISOString(),
        absorbed: this.absorbed,
        ...(this.shipments === null
          ? {}
          : { shipments: this.shipments.map((shipment) => shipment.toPayload()) }),
      },
    };
  }

  /**
   * Relit le contrat côté abonné. Un fait sans liste (antérieur à CA6b) se
   * relit avec `shipments: null` ; une liste PRÉSENTE mais mal formée, elle,
   * est refusée.
   *
   * @throws {ProductionDayRetakenPayloadError}
   */
  static fromPayload(payload: Readonly<Record<string, unknown>>): ProductionDayRetakenEvent {
    const serviceDay = textOf(payload["serviceDay"]);
    const retakenAt = instantOf(payload["retakenAt"]);
    const absorbed = piecesOf(payload["absorbed"]);
    const shipments = shipmentsOf(payload);
    if (serviceDay === null || retakenAt === null || absorbed === null || shipments === false) {
      throw new ProductionDayRetakenPayloadError();
    }
    return new ProductionDayRetakenEvent(serviceDay, retakenAt, absorbed, shipments);
  }
}

/**
 * `shipments` d'abord ; à défaut l'ancienne `orderIds`, au rang 1 ; ni l'une
 * ni l'autre → `null` (fait d'avant CA6b) ; présente mais illisible → `false`.
 */
function shipmentsOf(
  payload: Readonly<Record<string, unknown>>,
): readonly ShipmentRef[] | null | false {
  const shipments = payload["shipments"];
  if (shipments !== undefined) {
    if (!Array.isArray(shipments)) {
      return false;
    }
    const refs = shipments.map((entry: unknown) => ShipmentRef.fromPayload(entry));
    const valid = refs.filter((ref): ref is ShipmentRef => ref !== null);
    return valid.length === refs.length ? valid : false;
  }
  const orderIds = payload["orderIds"];
  if (orderIds === undefined) {
    return null;
  }
  if (
    !Array.isArray(orderIds) ||
    !orderIds.every((id): id is string => typeof id === "string" && id !== "")
  ) {
    return false;
  }
  return orderIds.map((orderId) => ShipmentRef.firstOf(orderId));
}

/** Le fait `production.day_retaken` reçu ne respecte pas son contrat. */
export class ProductionDayRetakenPayloadError extends TechnicalError {
  constructor() {
    super(
      "production_day_retaken.payload_invalid",
      "Le fait « tirage repris » reçu est illisible (journée, instant, nombre ou liste de " +
        "commandes manquants) : le dossier complété n'est pas parti. Le message reste dans la boîte " +
        "d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
