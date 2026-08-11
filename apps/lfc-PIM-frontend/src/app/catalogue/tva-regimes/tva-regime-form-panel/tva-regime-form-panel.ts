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
  FoldCalloutComponent,
  FoldInputComponent,
  FoldNumberInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { type TvaRegime } from '../../catalogue-api';
import { TvaStore } from '../tva-store';

/** Ce qu'on fait d'un régime existant depuis le panneau. */
export type TvaRegimePanelMode = 'edit' | 'delete';

/** Charge passée à `open()` : le régime visé et l'intention. Absente = création. */
export interface TvaRegimePanelData {
  readonly mode: TvaRegimePanelMode;
  readonly regime: TvaRegime;
}

/**
 * Panneau **régime de TVA** : création, édition ou suppression, ouvert
 * impérativement via `FoldPanelHostService.open()`. Sans `data` il crée ; avec
 * `{ mode: 'edit', regime }` il édite (champs préremplis) ; avec
 * `{ mode: 'delete', regime }` il affiche une **zone dangereuse** — confirmation
 * en retapant le nom du régime, car la suppression touchera les plateformes qui
 * consomment ce taux à la prochaine synchronisation.
 */
@Component({
  selector: 'app-tva-regime-form-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
  ],
  templateUrl: './tva-regime-form-panel.html',
  styleUrl: './tva-regime-form-panel.scss',
})
export class TvaRegimeFormPanel {
  private readonly store = inject(TvaStore);
  private readonly ref = inject(FoldPanelRef);

  /** Régime + intention ; absent = création. */
  readonly data = input<TvaRegimePanelData | undefined>(undefined);

  protected readonly draftName = signal('');
  protected readonly draftDescription = signal('');
  protected readonly draftPercent = signal<number | null>(null);
  /** Saisie de confirmation en mode suppression (doit égaler le nom du régime). */
  protected readonly confirmName = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly regime = computed(() => this.data()?.regime);
  protected readonly isEdit = computed(() => this.data()?.mode === 'edit');
  protected readonly isDelete = computed(() => this.data()?.mode === 'delete');

  protected readonly heading = computed(() =>
    this.isDelete()
      ? 'Supprimer le régime'
      : this.isEdit()
        ? 'Modifier le régime'
        : 'Nouveau régime',
  );
  protected readonly subtitle = computed(() =>
    this.isDelete()
      ? 'Action irréversible.'
      : 'Un taux = une collection Shopify (tva-5-5, tva-10, tva-20).',
  );
  protected readonly submitLabel = computed(() =>
    this.isDelete()
      ? 'Supprimer définitivement'
      : this.isEdit()
        ? 'Enregistrer'
        : 'Ajouter le régime',
  );

  /** En suppression, le nom retapé doit correspondre exactement. */
  protected readonly confirmMatches = computed(() => {
    const target = this.regime();
    return target !== undefined && this.confirmName().trim() === target.name;
  });

  constructor() {
    // Préremplit les champs quand un régime est fourni (édition).
    effect(() => {
      const target = this.regime();
      if (target !== undefined) {
        this.draftName.set(target.name);
        this.draftDescription.set(target.description);
        this.draftPercent.set(target.percent);
      }
    });
  }

  protected get canSubmit(): boolean {
    if (this.isDelete()) {
      return this.confirmMatches();
    }
    return this.draftName().trim() !== '' && this.draftPercent() !== null;
  }

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.persist();
      this.ref.close(true);
    } catch (caught) {
      this.error.set(caught instanceof Error ? caught.message : 'Erreur inattendue.');
    } finally {
      this.busy.set(false);
    }
  }

  private async persist(): Promise<void> {
    const target = this.regime();
    if (this.isDelete() && target !== undefined) {
      await this.store.remove(target.id);
      return;
    }
    const name = this.draftName().trim();
    const percent = this.draftPercent();
    if (name === '' || percent === null) {
      return;
    }
    const payload = { name, description: this.draftDescription(), percent };
    if (target !== undefined) {
      await this.store.update(target.id, payload);
    } else {
      await this.store.create(payload);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
