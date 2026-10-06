import { type DeliveryContact, instantToLocal } from "@lfd/contracts";

import type { DepartureWindow } from "../entities/departure-sheet.js";
import type { PlannedTiming } from "../value-objects/planned-timing.js";

/** Une étape de la procédure de livraison, en texte : les photos ne s'impriment pas. */
export interface RoundPaperStep {
  readonly title: string;
  /** `""` quand l'étape n'a pas de texte. */
  readonly body: string;
}

/** Un arrêt dont le commerce sert la feuille — figée au départ, vivante au dépôt. */
export interface RoundPaperSheetStop {
  readonly kind: "sheet";
  readonly reference: string;
  readonly customerLabel: string;
  /** Les lignes postales non vides ; vide sans adresse sur la commande. */
  readonly addressLines: readonly string[];
  readonly window: DepartureWindow | null;
  readonly contact: DeliveryContact | null;
  readonly signatureRequired: boolean;
  /** Les codes courts des bacs non annulés de la commande. */
  readonly binCodes: readonly string[];
  /** Vide sans procédure, ou sans le droit de la lire. */
  readonly steps: readonly RoundPaperStep[];
  readonly orderNote: string;
  readonly addressNote: string | null;
  readonly cancelled: boolean;
}

/**
 * Un arrêt dont le commerce ne sert aucune feuille : on n'invente ni adresse
 * ni contact, on imprime l'identifiant de la commande et le constat.
 */
export interface RoundPaperAbsentStop {
  readonly kind: "absent";
  readonly orderId: string;
}

export type RoundPaperStop = RoundPaperSheetStop | RoundPaperAbsentStop;

/**
 * **Le papier d'une tournée** — ce que l'écran des tournées imprimait par
 * `window.print()`, rendu côté serveur. **Aucun montant** : rien de ce qui
 * entre n'en porte.
 */
export interface RoundPaper {
  readonly vehicleName: string;
  readonly passage: number;
  readonly serviceDay: string;
  /** Le nom du livreur affecté ; `null` sans livreur, ou fiche sans nom. */
  readonly driverName: string | null;
  /** L'horaire prévu à l'application de la proposition ; `null` : rien ne s'imprime. */
  readonly planned: PlannedTiming | null;
  /** Dans l'ordre de passage. */
  readonly stops: readonly RoundPaperStop[];
  /** Quand le papier est tiré — le pied l'imprime, les métadonnées le figent. */
  readonly printedAt: Date;
}

/** « Kangoo blanc », puis « Kangoo blanc · passage 2 » dès le second passage — comme l'écran. */
export function roundPaperTitle(paper: Pick<RoundPaper, "vehicleName" | "passage">): string {
  return paper.passage > 1
    ? `${paper.vehicleName} · passage ${String(paper.passage)}`
    : paper.vehicleName;
}

/** « 8 h 30 » à partir de « 08:30 » ; une valeur illisible est rendue telle quelle. */
function timeLabel(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/u.exec(time);
  return match === null ? time : `${String(Number(match[1]))} h ${match[2] ?? "00"}`;
}

/**
 * « 8 h 00 – 10 h 00 », « avant 10 h 00 » sans début — le formateur du
 * back-office (`shared/window-label.ts`), recopié parce qu'un front et un
 * serveur ne partagent pas de code de présentation. Une fenêtre par défaut le
 * dit : ce n'est pas une promesse.
 */
export function windowPaperLabel(window: DepartureWindow | null): string {
  if (window === null) {
    return "Sans créneau";
  }
  const bounds =
    window.start === null
      ? `avant ${timeLabel(window.end)}`
      : `${timeLabel(window.start)} – ${timeLabel(window.end)}`;
  return window.source === "default" ? `${bounds} (horaire par défaut)` : bounds;
}

const METERS_PER_KM = 1000;

/**
 * « 42 km » — à l'entier ; sous le kilomètre, « < 1 km » plutôt qu'un « 0 km »
 * qui ment. Le `roundKmLabel` du back-office (`livraison/rounds-board-model.ts`),
 * recopié pour la même raison que `windowPaperLabel`.
 */
export function kmPaperLabel(meters: number): string {
  const km = Math.round(meters / METERS_PER_KM);
  return meters < METERS_PER_KM || km < 1 ? "< 1 km" : `${km.toLocaleString("fr-FR")} km`;
}

/**
 * « Départ 6 h 30 · retour 9 h 45 · 42 km », à l'heure de Paris ; `null` sans
 * horaire prévu — le papier ne l'invente pas.
 */
export function plannedPaperLabel(planned: PlannedTiming | null): string | null {
  if (planned === null) {
    return null;
  }
  const departure = timeLabel(instantToLocal(planned.departureAt).time);
  const back = timeLabel(instantToLocal(planned.returnAt).time);
  return `Départ ${departure} · retour ${back} · ${kmPaperLabel(planned.meters)}`;
}

/** « aucun arrêt », « 1 arrêt », « 4 arrêts ». */
export function stopCountPaperLabel(count: number): string {
  if (count === 0) {
    return "aucun arrêt";
  }
  return count === 1 ? "1 arrêt" : `${String(count)} arrêts`;
}
