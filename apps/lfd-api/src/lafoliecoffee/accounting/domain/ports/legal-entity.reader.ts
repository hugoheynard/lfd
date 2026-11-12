import type { LegalEntityView, PendingCreditorAccountView } from "@lfd/contracts";

/**
 * La vue SANS son calendrier, les dates de ses modes, sa dernière clôture, la
 * dernière tentative de l'automatisme ni le nom de l'auteur d'une saisie en
 * attente (l'annuaire du staff) : le calendrier et les
 * clôtures dépendent de l'heure et de la dernière clôture,
 * que l'application ajoute (`legal-entity-view-support.ts`) — un adaptateur
 * de lecture ne lit pas l'horloge — et la tentative a son propre port.
 */
export type LegalEntityRecord = Omit<
  LegalEntityView,
  | "pendingCreditorAccount"
  | "nextCollection"
  | "lastAutopilotRun"
  | "billingModes"
  | "payersWithoutModeCount"
  | "lastClosure"
  | "lastClosurePeriod"
> & {
  /** La saisie en attente, sans le nom de son auteur — l'application le résout. */
  readonly pendingCreditorAccount: Omit<PendingCreditorAccountView, "proposedByName"> | null;
};

/**
 * Port de **lecture pour l'écran** — ce que Comptabilité › Entités juridiques
 * affiche.
 *
 * Troisième port sur la même table, et les trois ont chacun leur raison : celui
 * d'écriture rend l'agrégat (on va le muter), {@link CreditorReader} rend une
 * copie figée à recopier sur un document, celui-ci rend une **vue**. Un seul
 * port qui ferait les trois obligerait chaque consommateur à dépendre de
 * méthodes qu'il n'appelle pas — et surtout, il laisserait la facturation
 * recevoir un agrégat qu'elle pourrait muter depuis son propre contexte.
 *
 * 🔴 **`canCollect` et `missingToCollect` de la vue viennent de l'agrégat**,
 * jamais d'un calcul refait dans l'adaptateur. Les recalculer ici serait une
 * seconde définition de « complète » à tenir d'accord avec la première pour
 * toujours — et celle qui dériverait est celle que l'écran montre.
 */
export abstract class LegalEntityReader {
  /** Toutes les entités, les vivantes d'abord, puis les archivées. */
  abstract list(): Promise<readonly LegalEntityRecord[]>;

  /** Une entité par son id, ou `null`. */
  abstract byId(id: string): Promise<LegalEntityRecord | null>;
}
