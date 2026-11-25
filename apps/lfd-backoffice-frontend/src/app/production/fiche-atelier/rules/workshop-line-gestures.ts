import type { ProductionTrackingLevel, WorkshopLine } from '@lfd/contracts';

/**
 * **Les gestes qu'une ligne permet, selon son niveau de suivi**
 * (`documentation/fournil/les-niveaux-de-suivi.md`).
 *
 * Seul endroit de l'écran qui traduit un niveau en gestes : chaque vue de la
 * fiche (par produit, par tranche) le lit au lieu de redécider, sans quoi une
 * vue qui oublie un niveau offre à une ligne toujours vert de compter des
 * plaques que le serveur sort déjà.
 *
 * - `detailed` : on compte (fournées, pavé, annulation).
 * - `simple` : on coche la ligne en entier, et on signale.
 * - `always_green` : on signale, rien d'autre.
 *
 * Une ligne d'**étape** (`role: 'step'`, `plan-produit-sur-plusieurs-postes.md`,
 * § 2.7) n'a aucun de ces gestes, quel que soit son niveau : le poste qui
 * finit compte les pièces et signale ; une étape se coche à part
 * (`LineStep`), et sa quantité se lit seulement.
 */
export interface LineGestures {
  readonly level: ProductionTrackingLevel;
  /** Déclarer une fournée : « + 1 plaque », « Saisir », le pavé. */
  readonly count: boolean;
  /** « Fait » : déclarer d'un coup ce qui reste. */
  readonly check: boolean;
  /** « Problème » : ouvrir le panneau rouge. */
  readonly report: boolean;
}

/** Le niveau servi ; un double qui l'omet se lit `detailed`, comme le contrat le dit. */
export function trackingLevelOf(line: WorkshopLine): ProductionTrackingLevel {
  return line.trackingLevel ?? 'detailed';
}

/** Ce que « Fait » déclarerait : le reste sous le plafond, `remaining` faute du champ. */
export function checkLeft(line: WorkshopLine): number {
  return line.remainingUnderCeiling ?? line.remaining;
}

/** Ce poste fait une étape de la ligne : il ne compte aucune pièce. */
export function isStepLine(line: WorkshopLine): boolean {
  return line.role === 'step';
}

/**
 * « En attente de : Boulangerie, Tourier » — les postes d'étape qui n'ont pas
 * coché, nommés ; `null` quand aucun n'attend. Un poste qu'on ne sait pas
 * nommer (fiche absente du jour) se dit « un autre poste ».
 */
export function stepsWaitingLabel(
  line: WorkshopLine,
  names: ReadonlyMap<string, string>,
): string | null {
  const pending = line.stepsPending ?? [];
  if (pending.length === 0) {
    return null;
  }
  return `En attente de : ${pending.map((id) => names.get(id) ?? 'un autre poste').join(', ')}`;
}

export function lineGestures(line: WorkshopLine): LineGestures {
  const level = trackingLevelOf(line);
  if (isStepLine(line)) {
    return { level, count: false, check: false, report: false };
  }
  switch (level) {
    case 'always_green':
      return { level, count: false, check: false, report: true };
    case 'simple':
      return { level, count: false, check: !line.done && checkLeft(line) > 0, report: true };
    default:
      return { level, count: true, check: false, report: false };
  }
}
