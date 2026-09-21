import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { DeliveryAddressView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';
import { DeliveryProcedureEditor } from '@lfd/b2b-ui/company';

/** Charge d'ouverture : l'adresse, et de quoi prévenir la fiche que son compteur a bougé. */
export interface AdminDeliveryProcedurePanelData {
  readonly address: DeliveryAddressView;
  /** Appelé à chaque changement du nombre d'étapes. */
  readonly onStepCountChange: (count: number) => void;
}

/**
 * La **procédure de livraison** d'une adresse, côté staff : l'éditeur partagé
 * dans un panneau. Le commercial la règle au téléphone, comme le reste de
 * l'adresse — d'où l'écriture ouverte.
 *
 * La passerelle n'est pas injectée à la racine : elle arrive par les
 * `providers` de l'ouverture, liée à la société de la fiche.
 */
@Component({
  selector: 'app-delivery-procedure-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldButtonComponent,
    DeliveryProcedureEditor,
  ],
  templateUrl: './delivery-procedure-panel.html',
})
export class AdminDeliveryProcedurePanel {
  /** Large : une photo de porte doit se lire sans l'ouvrir ailleurs. */
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', width: 'lg' };

  private readonly ref = inject(FoldPanelRef);

  readonly data = input.required<AdminDeliveryProcedurePanelData>();

  protected readonly subtitle = computed(() => {
    const address = this.data().address;
    return address.label || `${address.ligne1}, ${address.ville}`;
  });

  protected close(): void {
    this.ref.close();
  }
}
