import type { DeliveryContact } from "@lfd/contracts";

import type { DepartureWindow } from "../entities/departure-sheet.js";

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

/** « aucun arrêt », « 1 arrêt », « 4 arrêts ». */
export function stopCountPaperLabel(count: number): string {
  if (count === 0) {
    return "aucun arrêt";
  }
  return count === 1 ? "1 arrêt" : `${String(count)} arrêts`;
}
