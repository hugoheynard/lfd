import type { DossierPart, DossierSelection } from "../services/day-dossier-selection.js";
import { InvalidProvisionalRunError } from "../errors/provisional-print-errors.js";

/**
 * **Quelles commandes une impression provisoire tire** — les trois choix de la
 * fenêtre (plan `documentation/fournil/plan-impression-provisoire.md`) :
 * toutes, celles qui sont nouvelles ou modifiées depuis le tirage `run`, ou
 * celles qu'on a cochées.
 */
export type ProvisionalOrderChoice =
  | { readonly kind: "all" }
  | { readonly kind: "since"; readonly run: number }
  | { readonly kind: "chosen"; readonly orderIds: ReadonlySet<string> };

/** Ce que la fenêtre a coché, gardé avec le tirage pour s'y relire. */
export interface ProvisionalChoice {
  readonly parts: ReadonlySet<DossierPart>;
  readonly groups: ReadonlySet<string> | "all";
  readonly orders: ProvisionalOrderChoice;
}

/**
 * La sélection du rendu : « depuis #N » devient les commandes `changed` que
 * l'appelant a calculées (`changedSince`) ; les deux autres choix se
 * recopient.
 */
export function selectionOfChoice(
  choice: ProvisionalChoice,
  changed: ReadonlySet<string>,
): DossierSelection {
  const { orders } = choice;
  return {
    parts: choice.parts,
    groups: choice.groups,
    orders: orders.kind === "all" ? "all" : orders.kind === "since" ? changed : orders.orderIds,
  };
}

/**
 * Le choix en données simples — listes plutôt qu'ensembles : ce qui se garde
 * avec l'impression (colonne `parts`) et ce qui fait le sujet de l'intention.
 */
export interface PlainProvisionalChoice {
  readonly parts: readonly DossierPart[];
  readonly groups: "all" | readonly string[];
  readonly orders:
    | { readonly kind: "all" }
    | { readonly kind: "since"; readonly run: number }
    | { readonly kind: "chosen"; readonly orderIds: readonly string[] };
}

export function plainChoiceOf(choice: ProvisionalChoice): PlainProvisionalChoice {
  const { orders } = choice;
  return {
    parts: [...choice.parts],
    groups: choice.groups === "all" ? "all" : [...choice.groups],
    orders: orders.kind === "chosen" ? { kind: "chosen", orderIds: [...orders.orderIds] } : orders,
  };
}

/** L'état d'une impression provisoire, tel qu'il s'écrit et se relit. */
export interface ProvisionalPrintState {
  readonly id: string;
  readonly serviceDay: string;
  /** Le `#` du bandeau : 1, 2, 3… par journée. */
  readonly run: number;
  /** La version du journal du commerce lue au tirage, opaque. */
  readonly commerceVersion: number;
  readonly printedAt: Date;
  /** L'id de la fiche staff (jamais le `sub`). */
  readonly printedBy: string;
  /** L'empreinte de chaque commande dont la fiche a été imprimée. */
  readonly orderFingerprints: ReadonlyMap<string, string>;
  readonly choice: ProvisionalChoice;
}

/**
 * **Une impression provisoire du dossier** : un numéro de la journée, et de
 * quoi dire plus tard ce qui a changé depuis. Elle ne se modifie pas : une
 * autre impression est une autre ligne. Sa seule règle est celle du numéro.
 */
export class ProvisionalPrint {
  private constructor(readonly state: ProvisionalPrintState) {}

  /**
   * Le tirage qui vient d'être fait.
   *
   * @throws {InvalidProvisionalRunError} le numéro n'est pas un entier ≥ 1.
   */
  static drawn(state: ProvisionalPrintState): ProvisionalPrint {
    if (!Number.isInteger(state.run) || state.run < 1) {
      throw new InvalidProvisionalRunError(state.run);
    }
    return new ProvisionalPrint(state);
  }

  /** Le numéro qui suit le dernier tiré de la journée (`0` : aucun). */
  static nextRunAfter(lastRun: number): number {
    return lastRun + 1;
  }
}

/**
 * Où se range le PDF d'une impression : `<jour>/provisoire-<run>.pdf`, dans
 * le stockage des papiers du fournil. Le numéro est réservé en base avant que
 * le fichier ne s'écrive : deux tirages ne rangent jamais sous la même clé.
 */
export function provisionalPdfKey(serviceDay: string, run: number): string {
  return `${serviceDay}/provisoire-${String(run)}.pdf`;
}

/** Le nom proposé au téléchargement. */
export function provisionalPdfFileName(serviceDay: string, run: number): string {
  return `dossier-provisoire-${serviceDay}-${String(run)}.pdf`;
}
