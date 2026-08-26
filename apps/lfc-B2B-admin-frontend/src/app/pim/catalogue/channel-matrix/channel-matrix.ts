import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import type { Location, SalesChannels } from '../../data/models';
import { sellsAt, withCell } from '../../data/channels';
import { SalesContextStore } from '../sales-contexts/sales-context-store';

/**
 * L'atome de la décision « sur quels canaux se vend ce produit ».
 *
 * **Tout y est une donnée.** Les colonnes sont les contextes de vente qui ont
 * besoin d'un lieu ; les lignes, les emplacements du référentiel ; et chaque
 * contexte SANS lieu obtient sa propre case en pied de grille.
 *
 * Les deux boutiques étaient des clés fixes (`b1`/`b2`) avec des libellés en
 * dur — l'un d'eux, « Ardroit », ne désignait aucun emplacement réel. Puis les
 * lignes sont devenues une donnée, mais pas les colonnes : « à emporter » et
 * « sur place » restaient écrits ici, et la case B2B était un cas à part. Un
 * quatrième contexte de vente demandait donc encore de livrer ce composant.
 * Plus maintenant : une ligne de plus au registre suffit.
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
  private readonly contexts = inject(SalesContextStore);

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

  /** Les colonnes : les contextes qui se vendent depuis un lieu. */
  protected readonly columns = computed(() =>
    this.contexts.items().filter((context) => context.perLocation),
  );

  /**
   * Les contextes SANS lieu — une case chacun, en pied de grille.
   *
   * Le B2B en était le seul, et il était écrit en dur ici. Il n'a plus rien de
   * particulier : c'est un contexte que le registre déclare comme n'ayant pas
   * besoin d'un point de vente.
   */
  protected readonly standalone = computed(() =>
    this.contexts.items().filter((context) => !context.perLocation),
  );

  protected isOn(locationId: string | null, contextKey: string): boolean {
    return sellsAt(this.channels(), locationId, contextKey);
  }

  /**
   * Écrit une case. Une paire absente = rien n'y est vendu : décocher RETIRE la
   * ligne plutôt que de la garder à faux, sans quoi la matrice grossirait à
   * chaque case touchée — et bloquerait la suppression d'un emplacement que
   * plus personne ne vend.
   */
  protected setCell(locationId: string | null, contextKey: string, sold: boolean): void {
    this.channelsChange.emit(withCell(this.channels(), locationId, contextKey, sold));
  }
}
