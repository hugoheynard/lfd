import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { BILLING_RHYTHM_KIND_LABELS, type PayerBillingModeView } from '@lfd/contracts';
import { FoldCalloutComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { LegalEntitiesService } from '../../comptabilite/legal-entities.service';
import { PayerBillingModeService } from '../facturation/payer-billing-mode.service';

/**
 * **Le rappel du mode de facturation**, dans l'onglet Facturation : une ligne
 * qui dit le mode en vigueur et renvoie à Informations, où il se règle
 * (`payer-billing-mode-card`, déplacée le 2026-10-21 — un seul endroit pour
 * régler une chose).
 *
 * Il lit le mode chez la première entité émettrice en service, comme la carte
 * par défaut. Une lecture qui échoue ou un droit absent ne nomment pas de mode :
 * la ligne garde le renvoi, sans inventer « Mensuel ».
 */
@Component({
  selector: 'app-payer-billing-mode-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoldCalloutComponent],
  templateUrl: './payer-billing-mode-note.html',
})
export class PayerBillingModeNote {
  readonly company = input.required<AdminCompanyDetail>();

  private readonly entitiesApi = inject(LegalEntitiesService);
  private readonly api = inject(PayerBillingModeService);
  private readonly permissions = inject(PermissionsStore);

  private readonly view = signal<PayerBillingModeView | null>(null);

  /** Le payeur d'un site facturé chez un autre (même lecture que la carte), sinon `null`. */
  protected readonly followedPayer = computed(() => {
    const { parent, follows } = this.company().hierarchy;
    return parent !== null && follows.some((follow) => follow.aspect === 'billing')
      ? parent.enseigne
      : null;
  });

  /** La phrase du mode, sans le renvoi ; `null` quand on ne sait pas le nommer. */
  protected readonly sentence = computed(() => {
    const payer = this.followedPayer();
    if (payer !== null) {
      return `Mode de facturation : celui de ${payer}, qui le facture.`;
    }
    const view = this.view();
    if (view === null) {
      return null;
    }
    const next = view.scheduled;
    const scheduled =
      next === null ? '' : ` (passage à ${BILLING_RHYTHM_KIND_LABELS[next.mode]} programmé)`;
    return `Mode de facturation : ${BILLING_RHYTHM_KIND_LABELS[view.mode]}${scheduled}.`;
  });

  constructor() {
    effect(() => {
      const id = this.company().id;
      const followed = this.followedPayer();
      untracked(() => {
        if (followed === null && this.permissions.can('b2b_accounting:read')) {
          void this.load(id);
        }
      });
    });
  }

  private async load(companyId: string): Promise<void> {
    try {
      const entity = (await this.entitiesApi.list()).find((e) => e.archivedAt === null);
      this.view.set(entity === undefined ? null : await this.api.get(entity.id, companyId));
    } catch {
      this.view.set(null);
    }
  }
}
