import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { CaptureLeadPayload } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { LeadsService } from '../../leads.service';

/**
 * Panneau **Ajouter un lead** (démarchage) : saisit un prospect **sortant** que le
 * commercial a rencontré/appelé. Seule la raison sociale est requise ; l'e-mail,
 * s'il est fourni, sert de **clé de rapprochement** — si la personne s'inscrit plus
 * tard, le lead se convertit tout seul. Container mince : signaux → payload → POST,
 * ferme avec `true` pour que la page recharge la file.
 */
@Component({
  selector: 'app-lead-capture-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, FoldInputComponent],
  templateUrl: './lead-capture-panel.html',
  styleUrl: './lead-capture-panel.scss',
})
export class LeadCapturePanel {
  private readonly leads = inject(LeadsService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  /** Le panneau ne prend aucune donnée d'ouverture (satisfait `FoldPanelContent`). */
  readonly data = input<undefined>(undefined);

  protected readonly businessName = signal('');
  protected readonly contactName = signal('');
  protected readonly email = signal('');
  protected readonly phone = signal('');
  protected readonly siret = signal('');
  protected readonly notes = signal('');
  protected readonly saving = signal(false);

  protected readonly canSubmit = computed(() => this.businessName().trim() !== '');

  protected async submit(): Promise<void> {
    if (!this.canSubmit() || this.saving()) {
      return;
    }
    this.saving.set(true);
    const payload: CaptureLeadPayload = {
      businessName: this.businessName().trim(),
      contactName: this.contactName().trim(),
      email: this.email().trim(),
      phone: this.phone().trim(),
      siret: this.siret().trim(),
      notes: this.notes().trim(),
    };
    try {
      await this.leads.capture(payload);
      this.notify.success('Lead ajouté au démarchage.');
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
