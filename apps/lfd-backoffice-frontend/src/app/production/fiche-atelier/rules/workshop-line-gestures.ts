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

export function lineGestures(line: WorkshopLine): LineGestures {
  const level = trackingLevelOf(line);
  switch (level) {
    case 'always_green':
      return { level, count: false, check: false, report: true };
    case 'simple':
      return { level, count: false, check: !line.done && checkLeft(line) > 0, report: true };
    default:
      return { level, count: true, check: false, report: false };
  }
}
