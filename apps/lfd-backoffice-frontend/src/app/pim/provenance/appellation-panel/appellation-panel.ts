import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { AppellationView } from '@lfd/pim-contracts';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { LangSwitch } from '../../../shared/lang-switch/lang-switch';
import { localizedField } from '../../../shared/lang-switch/localized-field';
import { NotifyService } from '../../../notify.service';
import { ProvenanceStore } from '../provenance.store';

/** Charge passée à `open()` : l'appellation à régler. Absente = ouverture. */
export interface AppellationPanelData {
  readonly appellation: AppellationView;
}

/**
 * Panneau **appellation** — ouverture ou réglage, plus la zone dangereuse.
 *
 * Le **code** est une identité que les ingrédients citent par clé étrangère :
 * saisissable à l'ouverture, verrouillé ensuite. Le renommer serait le chemin
 * en deux temps vers une autre ligne.
 *
 * Le **libellé** se traduit ; le signe (« AOP ») non — c'est un sigle
 * réglementaire, identique dans les trois langues.
 */
@Component({
  selector: 'app-appellation-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldInputComponent,
    FoldCheckboxComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    LangSwitch,
  ],
  templateUrl: './appellation-panel.html',
  styleUrl: './appellation-panel.scss',
})
export class AppellationPanel {
  private readonly store = inject(ProvenanceStore);
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  readonly data = input<AppellationPanelData | undefined>(undefined);

  protected readonly appellation = computed(() => this.data()?.appellation);
  protected readonly isEdit = computed(() => this.appellation() !== undefined);

  protected readonly draftCode = signal('');
  protected readonly draftScheme = signal('');
  protected readonly draftActive = signal(true);
  protected readonly confirmCode = signal('');
  protected readonly busy = signal(false);
  protected readonly dangerOpen = signal(false);

  protected readonly label = localizedField({
    source: () => this.appellation()?.label ?? { fr: '' },
    label: 'Libellé',
    subject: 'Le libellé',
  });

  protected readonly heading = computed(() =>
    this.isEdit() ? "Régler l'appellation" : 'Nouvelle appellation',
  );

  /** Ce qui la retient — zéro = suppression sans conséquence. */
  protected readonly held = computed(() => this.appellation()?.usedBy ?? 0);

  protected readonly confirmMatches = computed(
    () => this.confirmCode().trim() === (this.appellation()?.code ?? ' '),
  );

  protected readonly canDelete = computed(
    () => this.held() === 0 && this.confirmMatches() && !this.busy(),
  );

  constructor() {
    effect(() => {
      const target = this.appellation();
      if (target !== undefined) {
        this.draftCode.set(target.code);
        this.draftScheme.set(target.scheme);
        this.draftActive.set(target.active);
      }
    });
  }

  protected get canSubmit(): boolean {
    return this.draftCode().trim() !== '' && this.label.filled() && !this.busy();
  }

  protected async submit(): Promise<void> {
    await this.run(() => this.persist());
  }

  protected async remove(): Promise<void> {
    const target = this.appellation();
    if (target === undefined) {
      return;
    }
    await this.run(() => this.store.removeAppellation(target.code));
  }

  protected toggleDanger(): void {
    this.dangerOpen.update((open) => !open);
  }

  protected cancel(): void {
    this.ref.close();
  }

  /** Le panneau **reste ouvert** sur un refus : les champs sont encore là pour corriger. */
  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.ref.close(true);
    } catch (caught) {
      this.notify.refused(caught, 'Opération refusée.');
    } finally {
      this.busy.set(false);
    }
  }

  private async persist(): Promise<void> {
    const target = this.appellation();
    if (target === undefined) {
      await this.store.createAppellation({
        code: this.draftCode().trim(),
        label: this.label.text(),
        scheme: this.draftScheme().trim(),
      });
      return;
    }
    await this.store.updateAppellation(target.code, {
      label: this.label.text(),
      scheme: this.draftScheme().trim(),
      active: this.draftActive(),
    });
  }
}
