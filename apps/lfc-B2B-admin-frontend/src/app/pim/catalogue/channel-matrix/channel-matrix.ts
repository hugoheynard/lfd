import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import type { ShopChannels, Location, SalesChannels } from '../../data/models';

/**
 * L'atome de la décision « sur quels canaux se vend ce produit ».
 *
 * **Une ligne par emplacement réel**, plus une pour la plateforme B2B. Les deux
 * boutiques étaient auparavant des clés fixes (`b1`/`b2`) avec des libellés en
 * dur — et l'un des deux, « Ardroit », ne correspondait à aucun emplacement du
 * référentiel : l'écran proposait de cocher une boutique qui n'existait pas.
 *
 * Purement présentationnel : il montre les canaux effectifs et émet la nouvelle
 * valeur ; l'hôte décide de la sémantique héritage/override, car elle dépend du
 * défaut de la gamme.
 */
@Component({
  selector: 'app-channel-matrix',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCheckboxComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './channel-matrix.html',
  styleUrl: './channel-matrix.scss',
})
export class ChannelMatrix {
  readonly channels = input.required<SalesChannels>();
  /** Les points de vente à proposer — la liste du référentiel. */
  readonly locations = input.required<readonly Location[]>();
  /**
   * Pourquoi la liste est vide, si elle l'est faute d'avoir pu la lire.
   * L'hôte le sait (il tient le store) ; la grille se contente de le dire.
   */
  readonly unreadable = input<string | null>(null);
  /** `true` = valeurs héritées de la gamme ; `false` = personnalisé. */
  readonly inherited = input<boolean>(true);
  /** Masque l'entête héritage/revert — au niveau gamme, la grille EST la source. */
  readonly showState = input<boolean>(true);

  readonly channelsChange = output<SalesChannels>();
  readonly revert = output<void>();

  /** Une clé absente = rien n'y est vendu ; la carte ne porte que ce qui l'est. */
  protected isOn(locationId: string, mode: keyof ShopChannels): boolean {
    return this.channels().boutiques[locationId]?.[mode] === true;
  }

  /**
   * Écrit une case. L'entrée devenue **entièrement fausse est retirée** plutôt
   * que gardée à zéro : la carte dit ce qui est vendu, et une clé qui ne vend
   * rien ferait grossir la colonne à chaque emplacement décoché — puis
   * bloquerait sa suppression, puisque le référentiel refuse d'ôter un
   * location encore coché.
   */
  protected setCell(locationId: string, mode: keyof ShopChannels, value: boolean): void {
    const current = this.channels();
    const before = current.boutiques[locationId] ?? { emporter: false, surPlace: false };
    const after: ShopChannels = { ...before, [mode]: value };
    const boutiques = { ...current.boutiques };
    if (after.emporter || after.surPlace) {
      boutiques[locationId] = after;
    } else {
      delete boutiques[locationId];
    }
    this.channelsChange.emit({ ...current, boutiques });
  }

  protected setB2b(value: boolean): void {
    this.channelsChange.emit({ ...this.channels(), b2b: value });
  }
}
