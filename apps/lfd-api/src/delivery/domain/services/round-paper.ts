import { type DeliveryContact, instantToLocal } from "@lfd/contracts";
import type { SaleUnit } from "@lfd/money";

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
  /**
   * Le numéro du bon de livraison de CET envoi (« BL-1042-1 », reliquat
   * compris) ; `null` : aucun BL vivant (commande hors plan) — rien ne
   * s'imprime, jamais un numéro deviné (Hugo, 2026-10-26).
   */
  readonly deliveryNoteNumber: string | null;
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
  /**
   * La couleur de l'arrêt (`#rrggbb`) — celle de livraison du site de départ
   * pour sa clientèle, lue au tirage (plan du tri et des couleurs, L5) ;
   * `null` : clientèle inconnue ou couleur non posée, aucun carré.
   */
  readonly color: string | null;
}

/**
 * Un arrêt dont le commerce ne sert aucune feuille : on n'invente ni adresse
 * ni contact, on imprime l'identifiant de la commande et le constat.
 */
export interface RoundPaperAbsentStop {
  readonly kind: "absent";
  readonly orderId: string;
}

/** Une ligne de manifeste imprimée : un article, une quantité. */
export interface RoundPaperTransferLine {
  readonly productName: string;
  /** Des pièces, ou des grammes si `saleUnit = "weight"`. */
  readonly quantity: number;
  readonly saleUnit: SaleUnit;
}

/**
 * **Un arrêt de transfert interne** (décision de Hugo du 2026-10-13) : le
 * site, l'heure d'arrivée requise, les bacs, et ce que le transfert
 * transporte — commandes et réassorts, totalisés par article.
 * Aucun client.
 */
export interface RoundPaperTransferStop {
  readonly kind: "transfer";
  readonly siteLabel: string;
  /** Les lignes postales du site ; vide : le commerce ne le connaît plus. */
  readonly addressLines: readonly string[];
  /** L'heure d'arrivée requise (`HH:MM`), ou `null` : incalculable. */
  readonly arrivalBy: string | null;
  readonly binCount: number;
  readonly orderCount: number;
  /**
   * Une pastille par commande colorée, dans l'ordre du manifeste (plan
   * `comptabilite/plan-planche-des-documents-v2.md`, §0 bis, Hugo
   * 2026-10-22) — lue au tirage. Une commande sans couleur n'en a pas : la
   * liste peut être plus courte que `orderCount`.
   */
  readonly orderColors: readonly string[];
  readonly orderTotals: readonly RoundPaperTransferLine[];
  readonly resupplyCount: number;
  readonly resupplyTotals: readonly RoundPaperTransferLine[];
  /** Les noms des réassorts nommés (R1g), dans l'ordre du manifeste ; vide : aucun nommé. */
  readonly resupplyNames: readonly string[];
}

export type RoundPaperStop = RoundPaperSheetStop | RoundPaperAbsentStop | RoundPaperTransferStop;

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

/**
 * « Commande ORD-1042 · BL-1042-1 » — la commande et le bon qui voyage avec
 * elle, ou la commande seule sans BL. La référence d'une ligne du dossier se
 * dit de la même façon, sans le mot « Commande ».
 */
export function orderWithNoteLabel(reference: string, deliveryNoteNumber: string | null): string {
  return deliveryNoteNumber === null ? reference : `${reference} · ${deliveryNoteNumber}`;
}

/** « 8 h 30 » à partir de « 08:30 » ; une valeur illisible est rendue telle quelle. */
export function timeLabel(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/u.exec(time);
  return match === null ? time : `${String(Number(match[1]))} h ${match[2] ?? "00"}`;
}

/**
 * « 8 h 00 – 10 h 00 », « avant 10 h 00 » sans début — le formateur du
 * back-office (`shared/window-label.ts`), recopié parce qu'un front et un
 * serveur ne partagent pas de code de présentation. Une fenêtre par défaut
 * s'imprime comme les autres : la préciser chargeait la feuille pour rien
 * (Hugo, 2026-10-26).
 */
export function windowPaperLabel(window: DepartureWindow | null): string {
  if (window === null) {
    return "Sans créneau";
  }
  const bounds =
    window.start === null
      ? `avant ${timeLabel(window.end)}`
      : `${timeLabel(window.start)} – ${timeLabel(window.end)}`;
  return bounds;
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
