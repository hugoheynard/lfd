import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { DeliveryAddressView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';
import { DeliveryProcedureEditor } from '@lfd/b2b-ui/company';

import { PermissionsStore } from '../../../auth/permissions.store';
import { DeliveryDepositToggle } from '../delivery-deposit-toggle/delivery-deposit-toggle';
import { DeliveryDoorstepRule } from '../delivery-doorstep-rule/delivery-doorstep-rule';

/** Charge d'ouverture : l'adresse, et de quoi prévenir la fiche que son compteur a bougé. */
export interface AdminDeliveryProcedurePanelData {
  /** La société de la fiche — la route de « dépôt autorisé » la nomme. */
  readonly companyId: string;
  readonly address: DeliveryAddressView;
  /** Appelé à chaque changement du nombre d'étapes. */
  readonly onStepCountChange: (count: number) => void;
  /** Appelé quand « dépôt autorisé » a été enregistré. */
  readonly onDepositChange: (depositAllowed: boolean) => void;
}

/**
 * La **procédure de livraison** d'une adresse, côté staff : l'éditeur partagé
 * dans un panneau. Le commercial la règle au téléphone, comme le reste de
 * l'adresse. « Dépôt autorisé » y vit aussi (`a-la-porte.md`, AP-D5) : même
 * droit, même interlocuteur, même moment. Et la décision réglée d'avance à la
 * porte de l'adresse (B3 bis), pour la même raison.
 *
 * 🔴 **Les trois suivent `delivery_procedures`**, comme toutes leurs routes
 * (`@AdminSurface("delivery_procedures")`) : lire sous `:read`, écrire sous
 * `:write`. L'éditeur s'ouvrait en écriture sans test de droit, et un rôle sans
 * la ressource prenait 403 dès la première lecture (audit F2, 2026-10-07).
 *
 * ⚠️ Sans `:read`, le panneau ne monte AUCUN des trois blocs et dit pourquoi :
 * la décision à la porte et l'éditeur lisent leur route en paraissant (403 sans
 * le droit) ; « Dépôt autorisé » ne lit rien, mais ne s'écrit que sous `:write`,
 * et un panneau à un bloc sur trois dirait moins que l'état vide (vérifié le
 * 2026-10-07). Il s'ouvre quand même : l'entrée
 * « Procédure de livraison » vit dans la carte d'adresses partagée, qui la
 * propose à tous, et un clic qui n'ouvrirait rien ne dirait pas ce qui manque.
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
    FoldEmptyStateComponent,
    DeliveryDepositToggle,
    DeliveryDoorstepRule,
    DeliveryProcedureEditor,
  ],
  templateUrl: './delivery-procedure-panel.html',
})
export class AdminDeliveryProcedurePanel {
  /** Large : une photo de porte doit se lire sans l'ouvrir ailleurs. */
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', width: 'lg' };

  private readonly ref = inject(FoldPanelRef);
  private readonly permissions = inject(PermissionsStore);

  readonly data = input.required<AdminDeliveryProcedurePanelData>();

  protected readonly canRead = computed(() => this.permissions.can('delivery_procedures:read'));
  /** Le même droit que « dépôt autorisé » et la décision à la porte, ses deux voisins. */
  protected readonly canEdit = computed(() => this.permissions.can('delivery_procedures:write'));

  protected readonly subtitle = computed(() => {
    const address = this.data().address;
    return address.label || `${address.ligne1}, ${address.ville}`;
  });

  protected close(): void {
    this.ref.close();
  }
}
