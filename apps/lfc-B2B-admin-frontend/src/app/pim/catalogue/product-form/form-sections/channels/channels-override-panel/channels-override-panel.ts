import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';

import { ChannelMatrix } from '../../../../channel-matrix/channel-matrix';
import type { Location, SalesChannels } from '../../../../../data/models';

/** Ce que le panneau reçoit : la matrice courante, l'héritage, et le référentiel. */
export interface ChannelsOverridePanelData {
  /** La matrice de la fiche, ou `null` si elle hérite. */
  readonly current: SalesChannels | null;
  /** Celle de la famille — la valeur à laquelle « revenir » ramène. */
  readonly inherited: SalesChannels;
  readonly locations: readonly Location[];
  /** Pourquoi la liste d'emplacements est vide, si elle l'est faute de lecture. */
  readonly unreadable: string | null;
}

/** `null` = la fiche revient à sa famille. */
export type ChannelsOverridePanelResult = { readonly channels: SalesChannels | null };

/**
 * Panneau **canaux de la fiche** — où elle se vend quand elle ne suit pas sa
 * famille.
 *
 * Il réutilise `ChannelMatrix`, la même grille que le panneau famille : deux
 * grilles pour la même décision finiraient par ne pas cocher les mêmes cases.
 * L'hôte y ajoute la seule chose que la grille ne sait pas — ce que « revenir »
 * veut dire ici, c'est-à-dire la matrice de la famille.
 */
@Component({
  selector: 'app-channels-override-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ChannelMatrix,
    FoldButtonComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './channels-override-panel.html',
})
export class ChannelsOverridePanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto' };

  private readonly ref = inject<FoldPanelRef<ChannelsOverridePanelResult>>(FoldPanelRef);

  readonly data = input.required<ChannelsOverridePanelData>();

  /** `null` tant que la fiche hérite — la grille montre alors l'héritage. */
  protected readonly draft = signal<SalesChannels | null>(null);

  constructor() {
    effect(() => {
      this.draft.set(this.data().current);
    });
  }

  /** Ce que la grille affiche : la dérogation si elle existe, l'héritage sinon. */
  protected shown(): SalesChannels {
    return this.draft() ?? this.data().inherited;
  }

  /**
   * Cocher une case fait sortir de l'héritage : on ne peut pas modifier la
   * matrice de sa famille depuis une fiche, on peut seulement cesser de la
   * suivre. Le premier clic est donc la décision de déroger.
   */
  protected write(channels: SalesChannels): void {
    this.draft.set(channels);
  }

  protected inherit(): void {
    this.draft.set(null);
  }

  protected cancel(): void {
    this.ref.close();
  }

  protected confirm(): void {
    this.ref.close({ channels: this.draft() });
  }
}
