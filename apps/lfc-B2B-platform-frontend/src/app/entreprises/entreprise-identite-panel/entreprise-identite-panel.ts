import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import {
  FoldButtonComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { AccountService } from '../../account/account.service';

/** Charge d'ouverture : l'entreprise visée et ses valeurs actuelles. */
export interface IdentitePanelData {
  readonly companyId: string;
  readonly enseigne: string;
  readonly tvaIntracom: string;
}

/**
 * Panneau **Identité** — édite l'identité *souple* : l'enseigne (nom commercial)
 * et le n° de TVA intracommunautaire. La raison sociale, la forme juridique et le
 * SIRET restent fixés à la création (les changer = une autre société).
 */
@Component({
  selector: 'app-entreprise-identite-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldInputComponent, FoldButtonComponent],
  templateUrl: './entreprise-identite-panel.html',
  styleUrl: './entreprise-identite-panel.scss',
})
export class EntrepriseIdentitePanel {
  private readonly account = inject(AccountService);
  private readonly ref = inject(FoldPanelRef);

  readonly data = input<IdentitePanelData | undefined>(undefined);

  protected readonly enseigne = signal('');
  protected readonly tvaIntracom = signal('');
  protected readonly saving = signal(false);

  protected readonly canSubmit = computed(() => !this.saving());

  constructor() {
    effect(() => {
      const data = this.data();
      if (data === undefined) {
        return;
      }
      this.enseigne.set(data.enseigne);
      this.tvaIntracom.set(data.tvaIntracom);
    });
  }

  protected submit(): void {
    const data = this.data();
    if (data === undefined || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.account.updateIdentity(
      data.companyId,
      { enseigne: this.enseigne().trim(), tvaIntracom: this.tvaIntracom().trim() },
      () => this.ref.close(true),
    );
  }

  protected cancel(): void {
    this.ref.close();
  }
}
