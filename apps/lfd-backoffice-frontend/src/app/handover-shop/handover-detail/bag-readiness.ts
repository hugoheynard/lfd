import type { HandoverQueueEntryView, PackingSheet } from '@lfd/contracts';
import type { FoldCalloutVariant, FoldIconName } from 'fold-ng';

import { clockLabel } from '../../supervision/supervision-labels';

/** Une barre du rail : où en est une étape, et ce qu'on en dit à voix haute. */
export interface ReadinessStep {
  readonly done: number;
  readonly total: number;
  readonly complete: boolean;
  readonly label: string;
}

/**
 * **Où en est le sac** — le fournil, puis le colisage (Hugo, 2026-09-28).
 *
 * « Déclarée prête par le fournil » disait une seule chose, et un sac a deux
 * étapes : les produits sont-ils sortis du four, et ont-ils été posés dans le
 * bac ? Les deux se lisent sur la fiche de colis de la commande, que le
 * colisage tient déjà : `awaitingProduction` ligne par ligne pour le four,
 * `packedLines` et `packedAt` pour le bac.
 */
export interface BagReadiness {
  readonly oven: ReadinessStep;
  readonly packing: ReadinessStep;
  /** Les deux étapes finies : les gestes du comptoir reprennent leur poids. */
  readonly ready: boolean;
}

/** `null` = aucune fiche : la journée n'est pas arrêtée, ou la commande est hors plan. */
export function bagReadiness(sheet: PackingSheet | null): BagReadiness | null {
  if (sheet === null) {
    return null;
  }
  const total = sheet.lineCount;
  const baked = sheet.lines.filter((line) => !line.awaitingProduction).length;
  const ovenDone = baked >= total;
  const packedDone = sheet.packedAt !== null;
  const packedAt = sheet.packedAt === null ? null : clockLabel(sheet.packedAt);
  return {
    oven: {
      done: baked,
      total,
      complete: ovenDone,
      label: ovenDone
        ? 'Fournil · tout est sorti'
        : `Fournil · ${String(baked)} / ${String(total)} produits sortis`,
    },
    packing: {
      done: sheet.packedLines,
      total,
      complete: packedDone,
      label: packedDone
        ? `Colisage · sac fermé${packedAt === null ? '' : ` à ${packedAt}`}`
        : `Colisage · ${String(sheet.packedLines)} / ${String(total)} posés dans le bac`,
    },
    ready: ovenDone && packedDone,
  };
}

/** Le verdict affiché en tête du rail. */
export interface ReadyVerdict {
  readonly text: string;
  readonly tone: FoldCalloutVariant;
  readonly icon: FoldIconName;
}

/**
 * Le verdict du fournil, **et rien de plus que ce qu'il a dit**.
 *
 * 🔴 Pas de « et complète » : il n'existe ni rupture ni avoir dans le modèle,
 * donc personne n'a vérifié qu'elle l'était. Une phrase rassurante fausse est
 * pire qu'une absence sur un écran qu'on lit avec quelqu'un en face.
 *
 * Sorti du composant le 2026-09-28, avec les barres du sac : les deux disent
 * où en est la commande, et le composant restait sous les 300 lignes.
 */
export function readyVerdict(entry: HandoverQueueEntryView | null): ReadyVerdict {
  if (entry === null) {
    return { text: '', tone: 'neutral', icon: 'check' };
  }
  if (entry.state === 'handed_over') {
    return { text: 'Déjà retirée. Le sac est parti.', tone: 'success', icon: 'check' };
  }
  return entry.readyAt === null
    ? { text: 'Pas encore déclarée prête par le fournil.', tone: 'warning', icon: 'clock' }
    : { text: 'Déclarée prête par le fournil.', tone: 'success', icon: 'check' };
}
