import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import {
  FoldButtonComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { HolderPicker, type HolderChoice } from '../../holder-picker/holder-picker';

/** Charge d'ouverture : la société à qui donner un détenteur. */
export interface AdminDetenteurPanelData {
  readonly companyId: string;
}

/**
 * Panneau **Détenteur** — l'autre moitié de « un compte s'ouvre avec l'enseigne
 * seule ».
 *
 * Le commercial note la société pendant l'appel, obtient l'adresse du gérant le
 * lendemain, et la pose ici. Le même formulaire qu'à l'ouverture (`HolderPicker`)
 * plutôt qu'un jumeau : deux saisies du détenteur divergeraient au premier champ
 * ajouté d'un seul côté.
 *
 * Il **ne remplace pas** : sur une société qui a déjà son détenteur, le serveur
 * refuse (409). En changer est une autre décision, et elle aura son geste.
 *
 * Container mince : il ne sait ni appeler l'API ni recharger la fiche — il rend
 * le détenteur retenu à qui l'a ouvert.
 */
@Component({
  selector: 'app-admin-detenteur-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, HolderPicker],
  templateUrl: './detenteur-panel.html',
  styleUrl: './detenteur-panel.scss',
})
export class AdminDetenteurPanel {
  /** Tiroir au large, bottom-sheet sur étroit — comme les autres panneaux. */
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto' };

  private readonly ref = inject(FoldPanelRef);

  readonly data = input.required<AdminDetenteurPanelData>();

  /** Le détenteur retenu, `null` tant qu'aucune adresse n'est saisie. */
  protected readonly holder = signal<HolderChoice | null>(null);

  protected submit(): void {
    const holder = this.holder();
    if (holder === null) {
      return;
    }
    this.ref.close(holder);
  }

  protected cancel(): void {
    this.ref.close();
  }
}
