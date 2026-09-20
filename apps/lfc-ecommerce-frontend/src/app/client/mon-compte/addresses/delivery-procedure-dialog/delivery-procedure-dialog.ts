import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DeliveryProcedureEditor } from '@lfd/b2b-ui/company';
import type { CompanyView, DeliveryAddressView } from '@lfd/contracts';
import {
  FOLD_INLINE_CONFIRM_DEFAULT_LABELS,
  FOLD_INLINE_CONFIRM_LABELS,
  FoldButtonComponent,
  type FoldInlineConfirmLabels,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { ClientAddresses } from '../../../client-addresses.service';
import { clientDeliveryProcedureGateway } from '../../../client-delivery-procedure.gateway';
import { ClientLocale } from '../../../client-locale.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { deliveryProcedureCopy } from '../../../copy/screens/delivery-procedure.copy';
import { dialogSide } from '../../../panel-side';
import { canWriteAddresses, postalLine } from '../addresses-section';

/** Charge d'ouverture : l'adresse, sa société, et si le rôle écrit le carnet. */
export interface DeliveryProcedureDialogData {
  readonly companyId: string;
  readonly address: DeliveryAddressView;
  /** `owner`/`admin` — la même règle que l'édition d'une adresse (`ensureCompanyAdmin`). */
  readonly canEdit: boolean;
}

/**
 * Les mots de la confirmation de suppression d'une étape : `fold-danger-zone`
 * n'a pas d'entrée de libellés (vérifié dans `delivery-address-dialog` le
 * 2026-09-14), et fold parle anglais par défaut.
 */
function removeConfirmLabels(): FoldInlineConfirmLabels {
  const account = inject(ClientCopyService).t().account;
  const procedure = deliveryProcedureCopy(inject(ClientLocale).current());
  return {
    ...FOLD_INLINE_CONFIRM_DEFAULT_LABELS,
    confirm: procedure.editor.removeAction,
    cancel: account.cancel,
    cancelAria: account.cancel,
    busy: procedure.removeBusy,
    group: procedure.removeGroup,
  };
}

/**
 * Le **dialogue de la procédure de livraison** d'une adresse, dans `/mon-compte` :
 * l'éditeur partagé `lfd-delivery-procedure-editor`, dans la langue de l'écran.
 *
 * Tout membre l'ouvre : le livreur ne lit pas cet écran, mais celui qui prépare
 * la réception doit pouvoir relire ce qui a été écrit. Seul le gestionnaire
 * écrit (plan `procedure-de-livraison` §2.4) ; les autres reçoivent le même
 * dialogue en lecture seule.
 *
 * L'éditeur écrit lui-même, par la passerelle client fournie à l'ouverture et
 * liée à la société. Ce dialogue n'apporte que son cadre — et la relecture du
 * carnet quand le nombre d'étapes change, parce que c'est lui que la ligne de
 * l'adresse affiche.
 */
@Component({
  selector: 'app-delivery-procedure-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DeliveryProcedureEditor,
    FoldButtonComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  providers: [{ provide: FOLD_INLINE_CONFIRM_LABELS, useFactory: removeConfirmLabels }],
  templateUrl: './delivery-procedure-dialog.html',
})
export class DeliveryProcedureDialog {
  /** `lg`, comme le panneau du back-office : une photo de porte doit se lire sans l'ouvrir ailleurs. */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'lg', surface: 'solid' };

  /**
   * Ouvre le dialogue sur une livraison du carnet.
   *
   * `stack` : ouvert depuis le panneau des adresses, il s'empile par-dessus au
   * lieu de le fermer.
   */
  static open(
    panels: FoldPanelHostService,
    company: CompanyView,
    address: DeliveryAddressView,
    stack = false,
  ): FoldPanelRef {
    return panels.open<DeliveryProcedureDialogData>(DeliveryProcedureDialog, {
      side: dialogSide(),
      stack,
      data: { companyId: company.id, address, canEdit: canWriteAddresses(company) },
      providers: [clientDeliveryProcedureGateway(company.id)],
    });
  }

  readonly data = input.required<DeliveryProcedureDialogData>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly locale = inject(ClientLocale);
  /** Hors de `ClientCopy` : voir `delivery-procedure.copy.ts`. */
  protected readonly procedure = computed(() => deliveryProcedureCopy(this.locale.current()));
  private readonly addresses = inject(ClientAddresses);
  private readonly ref = inject(FoldPanelRef);

  protected readonly subtitle = computed(() => {
    const address = this.data().address;
    return address.label === '' ? postalLine(address) : `${address.label} · ${postalLine(address)}`;
  });

  /** Le nombre d'étapes a changé : la ligne de l'adresse le relit dans le carnet. */
  protected stepCountChanged(): void {
    void this.addresses.refresh(this.data().companyId);
  }

  protected close(): void {
    this.ref.close();
  }
}
