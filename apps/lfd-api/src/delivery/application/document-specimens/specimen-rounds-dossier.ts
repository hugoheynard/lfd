import { localToInstant } from "@lfd/contracts";

import type { DayRoundsDossier } from "../../domain/services/day-rounds-dossier.js";
import { tightestDeadlineOf } from "../../domain/services/day-rounds-dossier.js";
import {
  dossierChecksOf,
  type DossierOrderFacts,
} from "../../domain/services/day-rounds-dossier-checks.js";
import { sectionTitleOf } from "../../domain/services/day-rounds-dossier-pdf.js";
import type { RoundPaper } from "../../domain/services/round-paper.js";
import { PlannedTiming } from "../../domain/value-objects/planned-timing.js";
import { specimenRoundPaper } from "./specimen-data.js";

/**
 * **Le dossier des tournées d'exemple** — sur la planche des documents
 * (`documentation/comptabilite/planche-des-documents.md`), à côté de la
 * feuille seule. Deux tournées du même véhicule (passages 1 et 2, le second
 * avec un transfert vers un site), et une livraison non placée.
 *
 * 🔴 Jamais persisté : rien n'est écrit, le papier est rendu et rendu
 * seulement. Tout ce qui désigne quelqu'un dit « EXEMPLE ».
 */

/** La teinte de transfert d'exemple du site — une valeur, pas une palette lue. */
const SPECIMEN_TRANSFER_COLOR = "#8e24aa";

function secondPassage(first: RoundPaper): RoundPaper {
  const departureAt = localToInstant(first.serviceDay, "10:15");
  const returnAt = localToInstant(first.serviceDay, "12:00");
  return {
    ...first,
    passage: 2,
    planned:
      departureAt === null || returnAt === null
        ? null
        : PlannedTiming.of({ departureAt, returnAt, meters: 18_300 }),
    stops: [
      {
        kind: "transfer",
        siteLabel: "EXEMPLE — Val Village",
        addressLines: ["EXEMPLE — 1 place du Village", "73150 Val d'Isère"],
        arrivalBy: "11:00",
        binCount: 2,
        orderCount: 1,
        orderColors: [SPECIMEN_TRANSFER_COLOR],
        orderTotals: [{ productName: "EXEMPLE — Pain de campagne", quantity: 6 }],
        resupplyCount: 0,
        resupplyTotals: [],
        resupplyNames: [],
      },
    ],
  };
}

/** **Le dossier d'exemple**, pour le lendemain de `now`, tiré à `now`. */
export function specimenRoundsDossier(now: Date): DayRoundsDossier {
  const first = specimenRoundPaper(now);
  const second = secondPassage(first);
  return {
    serviceDay: first.serviceDay,
    printedAt: now,
    dispatch: [
      {
        vehicleName: first.vehicleName,
        passage: 1,
        driverName: first.driverName,
        departure: "06:30",
        stopCount: first.stops.length,
        binsLoaded: 2,
        binsExpected: 3,
        tightestDeadline: tightestDeadlineOf(first.stops),
        transfers: [],
      },
      {
        vehicleName: second.vehicleName,
        passage: 2,
        driverName: second.driverName,
        departure: "10:15",
        stopCount: second.stops.length,
        binsLoaded: 0,
        binsExpected: 2,
        tightestDeadline: tightestDeadlineOf(second.stops),
        transfers: [{ siteLabel: "EXEMPLE — Val Village", color: SPECIMEN_TRANSFER_COLOR }],
      },
    ],
    // Hors tournée, hors plan : pas encore de BL, rien ne s'imprime.
    unplaced: [
      {
        reference: "EXEMPLE-0009",
        deliveryNoteNumber: null,
        customerLabel: "EXEMPLE — Hôtel du Col",
      },
    ],
    // Les alertes de l'ancienne feuille de route (2026-10-26), par les règles mêmes.
    checks: dossierChecksOf([
      specimenFacts("EXEMPLE-0003", "Café de la Gare", sectionTitleOf(first), {
        linkedToAddressBook: false,
        hasContact: false,
      }),
      specimenFacts("EXEMPLE-0007", "Le Refuge", sectionTitleOf(second), {
        shortfall: [{ productName: "EXEMPLE — Tarte aux myrtilles", quantity: 2 }],
      }),
      specimenFacts("EXEMPLE-0009", "Hôtel du Col", null, { hasAddress: false }),
    ]),
    papers: [first, second],
  };
}

/** Une commande d'exemple saine, sauf ce que `flaws` lui retire. */
function specimenFacts(
  reference: string,
  customer: string,
  roundTitle: string | null,
  flaws: Partial<
    Pick<DossierOrderFacts, "hasAddress" | "hasContact" | "linkedToAddressBook" | "shortfall">
  >,
): DossierOrderFacts {
  return {
    orderId: reference,
    // Dans une tournée : le BL-1 du plan ; hors tournée : pas encore de BL.
    deliveryNoteNumber: roundTitle === null ? null : `BL-${reference}-1`,
    roundTitle,
    order: { reference, customerLabel: `EXEMPLE — ${customer}`, cancelled: false },
    hasAddress: true,
    hasContact: true,
    linkedToAddressBook: true,
    shortfall: [],
    ...flaws,
  };
}
