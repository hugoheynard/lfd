import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { FoldBadgeComponent, FoldButtonComponent, FoldCheckboxComponent } from 'fold-ng';

import { BOUTIQUE_LABEL } from '../../data/boutiques';
import type { SalesChannels } from '../../data/models';

/**
 * L'atome de la décision « sur quels canaux se vend ce produit ». Grille
 * **asymétrique** : les boutiques déclinent « à emporter » et « sur place », la
 * plateforme B2B est une seule case. Purement présentationnel : il montre les canaux
 * effectifs et émet la nouvelle valeur ; l'hôte décide de la sémantique
 * héritage/override (tout-ou-rien) car elle dépend du défaut de la gamme.
 */
@Component({
  selector: 'app-channel-matrix',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCheckboxComponent, FoldBadgeComponent, FoldButtonComponent],
  templateUrl: './channel-matrix.html',
  styleUrl: './channel-matrix.scss',
})
export class ChannelMatrix {
  readonly channels = input.required<SalesChannels>();
  /** `true` = valeurs héritées de la gamme ; `false` = personnalisé. */
  readonly inherited = input<boolean>(true);
  /** Masque l'entête héritage/revert — au niveau gamme, la grille EST la source. */
  readonly showState = input<boolean>(true);

  readonly channelsChange = output<SalesChannels>();
  readonly revert = output<void>();

  protected readonly boutiques = BOUTIQUE_LABEL;

  protected setCell(boutique: 'b1' | 'b2', mode: 'emporter' | 'surPlace', value: boolean): void {
    const current = this.channels();
    this.channelsChange.emit({
      ...current,
      [boutique]: { ...current[boutique], [mode]: value },
    });
  }

  protected setB2b(value: boolean): void {
    this.channelsChange.emit({ ...this.channels(), b2b: value });
  }
}
