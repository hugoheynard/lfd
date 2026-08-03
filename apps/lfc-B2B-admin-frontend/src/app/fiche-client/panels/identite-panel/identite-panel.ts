import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';

import {
  FoldButtonComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';

/** Charge d'ouverture : la société + l'identité souple courante (à préremplir). */
export interface AdminIdentitePanelData {
  readonly companyId: string;
  readonly enseigne: string;
  readonly tvaIntracom: string;
}

/**
 * Panneau **Identité** côté staff — édite l'identité **souple** d'une société
 * (enseigne + n° de TVA) à la place du client (Porte B). L'identité légale
 * (raison sociale, forme, SIRET) reste fixée.
 */
@Component({
  selector: 'app-admin-identite-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldInputComponent, FoldButtonComponent],
  templateUrl: './identite-panel.html',
  styleUrl: './identite-panel.scss',
})
export class AdminIdentitePanel {
  private readonly service = inject(AdminCompaniesService);
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  readonly data = input.required<AdminIdentitePanelData>();

  protected readonly enseigne = signal('');
  protected readonly tvaIntracom = signal('');
  protected readonly submitting = signal(false);

  constructor() {
    // Préremplit à l'ouverture ; `data` est fixé et ne change plus.
    effect(() => {
      this.enseigne.set(this.data().enseigne);
      this.tvaIntracom.set(this.data().tvaIntracom);
    });
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    this.submitting.set(true);
    try {
      await this.service.updateIdentity(this.data().companyId, {
        enseigne: this.enseigne().trim(),
        tvaIntracom: this.tvaIntracom().trim(),
      });
      this.notify.success('Identité mise à jour.');
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.submitting.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
