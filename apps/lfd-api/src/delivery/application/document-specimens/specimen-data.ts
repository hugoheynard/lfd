import { addDays, instantToLocal, localToInstant } from "@lfd/contracts";

import type { RoundPaper, RoundPaperSheetStop } from "../../domain/services/round-paper.js";
import { PlannedTiming } from "../../domain/value-objects/planned-timing.js";

/**
 * **Les données d'exemple de la feuille de tournée** — le bon du livreur, sur
 * la planche des documents de la Comptabilité
 * (`documentation/comptabilite/planche-des-documents.md`).
 *
 * 🔴 **Elles ne sont JAMAIS persistées** : aucune tournée, aucun bac, aucun
 * arrêt n'est écrit ; le papier est rendu et rendu seulement.
 *
 * Le premier arrêt est la commande pro du bon d'exemple du commerce, recopiée
 * et non importée : la livraison ne lit le commerce que par son canal
 * (`CLAUDE.md` §3). Tout ce qui désigne quelqu'un dit « EXEMPLE ».
 */

/** Départ et retour prévus, à l'heure de Paris, et la distance du calcul routier. */
const PLANNED_DEPARTURE = "06:30";
const PLANNED_RETURN = "09:45";
const PLANNED_METERS = 41_600;

function stop(overrides: Partial<RoundPaperSheetStop>): RoundPaperSheetStop {
  return {
    kind: "sheet",
    reference: "EXEMPLE-0000",
    customerLabel: "EXEMPLE",
    addressLines: [],
    window: null,
    contact: null,
    signatureRequired: false,
    binCodes: [],
    steps: [],
    orderNote: "",
    addressNote: null,
    cancelled: false,
    color: null,
    ...overrides,
  };
}

const STOPS: RoundPaper["stops"] = [
  stop({
    reference: "EXEMPLE-0001",
    customerLabel: "EXEMPLE — Hôtel des Trois Ponts",
    addressLines: ["EXEMPLE — 1 rue des Trois Ponts", "73150 Val d'Isère"],
    window: { start: "07:00", end: "08:30", source: "override" },
    contact: { prenom: "EXEMPLE", nom: "Réception", telephone: "04 00 00 00 00" },
    signatureRequired: true,
    binCodes: ["A12", "A13"],
    steps: [
      { title: "Entrée de service", body: "Contourner l'hôtel par la gauche, porte grise." },
      { title: "Chambre froide", body: "" },
    ],
    orderNote: "EXEMPLE — Livrer par l'entrée de service, sonner à la réception.",
    addressNote: "Code du portail : EXEMPLE",
  }),
  stop({
    reference: "EXEMPLE-0002",
    customerLabel: "EXEMPLE — Restaurant Le Chalet",
    addressLines: ["EXEMPLE — 12 chemin du Fornet", "73150 Val d'Isère"],
    window: { start: null, end: "09:00", source: "default" },
    contact: { prenom: "EXEMPLE", nom: "Cuisine", telephone: "04 00 00 00 01" },
    binCodes: ["B04"],
  }),
  stop({
    reference: "EXEMPLE-0003",
    customerLabel: "EXEMPLE — Café de la Daille",
    addressLines: ["EXEMPLE — place de la Daille", "73150 Val d'Isère"],
    binCodes: ["C21"],
    cancelled: true,
  }),
];

/** L'horaire prévu de la tournée, ou `null` si le jour ne se lit pas. */
function plannedOf(serviceDay: string): PlannedTiming | null {
  const departureAt = localToInstant(serviceDay, PLANNED_DEPARTURE);
  const returnAt = localToInstant(serviceDay, PLANNED_RETURN);
  return departureAt === null || returnAt === null
    ? null
    : PlannedTiming.of({ departureAt, returnAt, meters: PLANNED_METERS });
}

/** **La feuille de tournée d'exemple**, pour le lendemain de `now`, tirée à `now`. */
export function specimenRoundPaper(now: Date): RoundPaper {
  const serviceDay = addDays(instantToLocal(now).day, 1);
  return {
    vehicleName: "EXEMPLE — Kangoo blanc",
    passage: 1,
    serviceDay,
    driverName: "EXEMPLE — Paul Durand",
    planned: plannedOf(serviceDay),
    stops: STOPS,
    printedAt: now,
  };
}
