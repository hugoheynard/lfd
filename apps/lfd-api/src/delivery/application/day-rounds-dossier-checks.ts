import { Injectable } from "@nestjs/common";

import {
  DeliveryAddressPointsReader,
  type DeliveryDeparture,
  DeliveryDeparturesReader,
  DeliveryOrdersReader,
} from "../channels/commerce/index.js";
import type { ShipmentNoteNumbers } from "./shipment-note-numbers.js";
import {
  type DossierCheck,
  dossierChecksOf,
  type DossierOrderFacts,
} from "../domain/services/day-rounds-dossier-checks.js";

/** Une commande à passer en revue, et la tournée qui la porte (`null` : hors tournée). */
export interface DossierCheckTarget {
  readonly orderId: string;
  /** Le rang de l'envoi — celui de son BL ; 1 pour une livraison non placée. */
  readonly rank: number;
  readonly roundTitle: string | null;
}

const NO_DEPARTURE: DeliveryDeparture = { lines: [], shortfall: null };

/**
 * **Les lectures de « À vérifier »** (décision de Hugo du 2026-10-26) — les
 * alertes de l'ancienne feuille de route, lues au commerce par les canaux de
 * la livraison seulement : la commande (`byIds`), sa feuille de départ
 * (adresse, contact), son lien au carnet sous le mur de la société
 * (`addressesOfOrders`, le même critère que la feuille de route : adresse de
 * livraison vivante de SA société), et le départ incomplet décidé.
 *
 * ⚠️ `departureOf` se lit commande par commande — le canal n'a pas de forme
 * par lot (2026-10-26). En parallèle, sur les seules commandes du jour : une
 * poignée de dizaines, au tirage d'un papier.
 */
@Injectable()
export class DayRoundsDossierChecks {
  constructor(
    private readonly orders: DeliveryOrdersReader,
    private readonly addresses: DeliveryAddressPointsReader,
    private readonly departures: DeliveryDeparturesReader,
  ) {}

  /** `noteNumbers` : les BL des envois, lus une fois par le dossier pour toutes ses rubriques. */
  async checksOf(
    targets: readonly DossierCheckTarget[],
    noteNumbers: ShipmentNoteNumbers,
  ): Promise<readonly DossierCheck[]> {
    // Une commande dans deux tournées n'est vérifiée qu'une fois : la première la nomme.
    const firstOf = new Map<string, DossierCheckTarget>();
    for (const target of targets) {
      if (!firstOf.has(target.orderId)) {
        firstOf.set(target.orderId, target);
      }
    }
    const orderIds = [...firstOf.keys()];
    if (orderIds.length === 0) {
      return [];
    }
    const [facts, sheets, linked, departures] = await Promise.all([
      this.orders.byIds(orderIds),
      this.orders.departureSheetsOf(orderIds),
      this.addresses.addressesOfOrders(orderIds),
      Promise.all(orderIds.map(async (id) => [id, await this.departures.departureOf(id)] as const)),
    ]);
    const factsById = new Map(facts.map((fact) => [fact.orderId, fact]));
    const sheetsById = new Map(sheets.map((sheet) => [sheet.orderId, sheet]));
    const linkedIds = new Set(linked.map((address) => address.orderId));
    const departureById = new Map(departures);
    return dossierChecksOf(
      [...firstOf.values()].map((target): DossierOrderFacts => {
        const fact = factsById.get(target.orderId);
        const sheet = sheetsById.get(target.orderId);
        const shortfall = (departureById.get(target.orderId) ?? NO_DEPARTURE).shortfall;
        return {
          orderId: target.orderId,
          deliveryNoteNumber: noteNumbers.numberOf(target.orderId, target.rank),
          roundTitle: target.roundTitle,
          order:
            fact === undefined
              ? null
              : {
                  reference: fact.reference,
                  customerLabel: fact.customerLabel,
                  cancelled: fact.status === "cancelled",
                },
          hasAddress: sheet !== undefined && sheet.address !== null,
          hasContact: sheet !== undefined && sheet.contact !== null,
          linkedToAddressBook: linkedIds.has(target.orderId),
          shortfall: shortfall?.lines ?? [],
        };
      }),
    );
  }
}
