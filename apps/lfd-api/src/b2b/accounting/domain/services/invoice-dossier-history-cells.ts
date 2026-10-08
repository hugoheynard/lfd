import type {
  DossierHandoverVia,
  DossierHistoryEvent,
  DossierHistoryKind,
  DossierOrderHistory,
} from "./invoice-dossier-history.js";
import type { DossierOrderPlace } from "./invoice-dossier.types.js";

/**
 * **Le lieu et la frise d'un bon, en une cellule CSV chacun** (DF3) — lus par
 * un comptable, donc en toutes lettres. Une nature de fait de plus est une
 * entrée de plus dans la table, pas une branche.
 */
const KIND_LABEL: Readonly<Record<DossierHistoryKind, string>> = {
  handed_over: "retiré au comptoir",
  handed_over_at_door: "remis à la porte",
  deposited: "déposé à la porte",
  departed: "parti en tournée",
  brought_back: "rapporté",
  replaced: "replacé",
};

const VIA_LABEL: Readonly<Record<DossierHandoverVia, string>> = {
  scan: "scan",
  manual: "saisie",
  deposit: "dépôt",
};

const EVENT_SEPARATOR = " · ";

/** `Retrait — Labo, 1 rue X, 75001 Paris` ou `Livraison — 3 rue Y, …`. */
export function placeCell(place: DossierOrderPlace): string {
  const mode = place.method === "pickup" ? "Retrait" : "Livraison";
  const where = [place.label, place.address].filter((part) => part !== null).join(", ");
  return where === "" ? mode : `${mode} — ${where}`;
}

/** Les faits datés, du plus ancien au plus récent, ou « aucun fait de retrait ». */
export function historyCell(history: DossierOrderHistory): string {
  const events = history.events.map(eventLabel).join(EVENT_SEPARATOR);
  if (history.handedOver) {
    return events;
  }
  return events === ""
    ? "aucun fait de retrait"
    : `${events}${EVENT_SEPARATOR}aucun fait de retrait`;
}

function eventLabel(event: DossierHistoryEvent): string {
  const details = [
    event.serviceDay === null ? null : `tournée du ${event.serviceDay}`,
    event.via === null ? null : VIA_LABEL[event.via],
  ].filter((part) => part !== null);
  const suffix = details.length === 0 ? "" : ` (${details.join(", ")})`;
  return `${KIND_LABEL[event.kind]} ${event.at.toISOString()}${suffix}`;
}
