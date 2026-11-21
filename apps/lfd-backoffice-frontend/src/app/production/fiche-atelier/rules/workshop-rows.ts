import type { WorkshopLine, WorkshopShortcutView } from '@lfd/contracts';

import type { LinePending } from '../outbox/workshop-outbox';

/**
 * **Une rangée de la vue produit** : la ligne servie, et tout ce que l'écran
 * sait d'elle à cet instant — calculé une fois par changement, dans un
 * `computed`, plutôt qu'appelé par le gabarit à chaque passage.
 */
export interface WorkshopRow {
  readonly line: WorkshopLine;
  /** L'intertitre de sous-catégorie qui ouvre cette rangée ; `null` sans changement. */
  readonly intertitle: string | null;
  readonly busy: boolean;
  readonly pending: LinePending | null;
  readonly doneWaiting: boolean;
  readonly shortcuts: readonly WorkshopShortcutView[];
  /** La ligne que le lien de la cloche désigne. */
  readonly linked: boolean;
}

/** Ce que les rangées lisent de l'écran, ligne par ligne. */
export interface WorkshopRowSources {
  readonly intertitles: ReadonlyMap<string, string>;
  readonly isBusy: (line: WorkshopLine) => boolean;
  readonly pendingOf: (sku: string) => LinePending | null;
  readonly doneWaiting: (sku: string) => boolean;
  readonly shortcuts: ReadonlyMap<string, readonly WorkshopShortcutView[]>;
  readonly linkedSku: string | null;
}

export function workshopRows(
  lines: readonly WorkshopLine[],
  sources: WorkshopRowSources,
): readonly WorkshopRow[] {
  return lines.map((line) => ({
    line,
    intertitle: sources.intertitles.get(line.sku) ?? null,
    busy: sources.isBusy(line),
    pending: sources.pendingOf(line.sku),
    doneWaiting: sources.doneWaiting(line.sku),
    shortcuts: sources.shortcuts.get(line.sku) ?? [],
    linked: sources.linkedSku === line.sku,
  }));
}
