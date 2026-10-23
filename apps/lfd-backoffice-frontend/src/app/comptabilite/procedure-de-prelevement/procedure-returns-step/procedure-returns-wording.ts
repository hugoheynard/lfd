import type {
  CollectionProcedureReturnFiguresView,
  CollectionProcedureReturnsView,
} from '@lfd/contracts';

import { day } from '../../invoice-dossier-format';

/** Un chiffre clé de l'onglet 4. */
export interface ReturnFigure {
  readonly key: string;
  readonly count: number;
  readonly label: string;
  /** Un nombre qui attend un geste : mis en avant. */
  readonly action: boolean;
}

/**
 * Les chiffres clés en tête de l'onglet 4 (Hugo, 2026-10-23) : les lignes du
 * lot, les retours en attente de décision, et les retours traités — chacun
 * par sa décision. Vide sans lot déposé.
 */
export function returnFigures(
  figures: CollectionProcedureReturnFiguresView | null,
): readonly ReturnFigure[] {
  if (figures === null) {
    return [];
  }
  return [
    { key: 'lines', count: figures.lineCount, label: 'lignes du lot', action: false },
    {
      key: 'pending',
      count: figures.pendingCount,
      label: 'retours en attente de décision',
      action: figures.pendingCount > 0,
    },
    { key: 'represented', count: figures.representedCount, label: 're-présentés', action: false },
    {
      key: 'settled',
      count: figures.settledOtherwiseCount,
      label: 'réglés autrement',
      action: false,
    },
    { key: 'written-off', count: figures.writtenOffCount, label: 'passés en perte', action: false },
  ];
}

/** Ce que dit l'onglet, selon la raison que le serveur donne. */
export function returnsSentence(view: CollectionProcedureReturnsView): string {
  const until = view.watchUntilDay === null ? '' : day(view.watchUntilDay);
  switch (view.reason) {
    case 'before_collection_day':
      return 'Rien à contrôler avant l’échéance : les impayés arrivent après elle, chaque jour.';
    case 'pending_returns':
      return `${String(view.pendingReturnCount)} retour(s) attendent un geste : re-présenter, régler autrement, ou passer en perte.`;
    case 'watching':
      return `Chaque jour ouvré jusqu’au ${until} : importer le fichier de rejets de la banque, puis noter « Retours contrôlés », qu’il y ait eu des impayés ou non.`;
    case 'unchecked_days':
      return `La fenêtre de suivi s’est close le ${until}, mais des jours n’ont pas de contrôle noté : un trou ne vaut pas « aucun impayé ».`;
    case 'watch_over':
      return 'Aucune action à mener : chaque jour de la fenêtre est contrôlé et aucun retour n’attend. Un retour tardif reviendra par l’import et la cloche.';
    case 'not_deposited':
      return '';
  }
}
