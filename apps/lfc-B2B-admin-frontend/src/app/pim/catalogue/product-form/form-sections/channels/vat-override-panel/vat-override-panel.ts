import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldListboxComponent,
  FoldOptionComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';

import { formatPercent } from '../../../../../data/channels';
import type { VatRate } from '../../../../catalogue-api';

/** Ce que le panneau reçoit : le contexte visé, les taux, et l'état actuel. */
export interface VatOverridePanelData {
  readonly contextKey: string;
  readonly contextLabel: string;
  readonly rates: readonly VatRate[];
  /** Le taux hérité de la famille, nommé — pour que « revenir » dise à quoi. */
  readonly inheritedLabel: string;
  /** La dérogation en cours, ou `null` si la fiche hérite. */
  readonly current: string | null;
}

/** `null` = la fiche revient à sa famille. */
export type VatOverridePanelResult = { readonly rateId: string | null };

/**
 * Panneau **dérogation de TVA** — pour UNE fiche, UN contexte.
 *
 * Un contexte à la fois, et c'est délibéré : déroger est une décision qu'on
 * prend pour une raison précise (« cette tarte-là est vendue à 20 % aux pros »),
 * jamais pour trois contextes d'un coup. Un formulaire à trois lignes aurait
 * invité à cocher le reste par symétrie.
 */
@Component({
  selector: 'app-vat-override-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldListboxComponent,
    FoldOptionComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './vat-override-panel.html',
})
export class VatOverridePanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto' };

  private readonly ref = inject<FoldPanelRef<VatOverridePanelResult>>(FoldPanelRef);

  /** La charge est un SIGNAL d'entrée : elle n'est pas posée à la construction. */
  readonly data = input.required<VatOverridePanelData>();

  /** `''` = hérité. La liste porte l'héritage comme une OPTION, pas comme un
   *  bouton à part : c'est la même décision, prise dans le même geste. */
  protected readonly draft = signal('');

  protected readonly rates = computed(() => this.data().rates);

  constructor() {
    effect(() => {
      this.draft.set(this.data().current ?? '');
    });
  }

  protected label(rate: VatRate): string {
    return `${rate.name} · ${formatPercent(rate.percent)}`;
  }

  protected cancel(): void {
    this.ref.close();
  }

  protected confirm(): void {
    const chosen = this.draft();
    this.ref.close({ rateId: chosen === '' ? null : chosen });
  }
}
