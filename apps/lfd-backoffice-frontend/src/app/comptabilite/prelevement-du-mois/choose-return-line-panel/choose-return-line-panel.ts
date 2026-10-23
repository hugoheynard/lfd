import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { CollectionBatchLineView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldListboxComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { euros } from '../../invoice-dossier-format';

/** Les lignes déposées qui n'ont pas encore leur retour. */
export interface ChooseReturnLinePanelData {
  readonly lines: readonly CollectionBatchLineView[];
}

/**
 * **« Signaler un retour à la main » — le choix de la ligne** (Hugo,
 * 2026-10-23) : depuis la barre d'actions de l'onglet « Retours », sans
 * chercher la ligne dans le tableau. Rend son rang ; la saisie du retour
 * elle-même est celle de « Signaler un retour » (`app-return-panel`).
 */
@Component({
  selector: 'app-choose-return-line-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldListboxComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './choose-return-line-panel.html',
  styleUrl: './choose-return-line-panel.scss',
})
export class ChooseReturnLinePanel {
  private readonly ref = inject(FoldPanelRef<number>);

  readonly data = input<ChooseReturnLinePanelData | undefined>(undefined);

  protected readonly rank = signal<string | null>(null);

  protected readonly options = computed(() =>
    (this.data()?.lines ?? []).map((line) => ({
      value: String(line.rank),
      label: `Ligne ${String(line.rank)} — ${line.debtorName} — ${euros(line.amountCents)}`,
    })),
  );

  protected next(): void {
    const rank = this.rank();
    if (rank !== null) {
      this.ref.close(Number(rank));
    }
  }

  protected close(): void {
    this.ref.close();
  }
}
