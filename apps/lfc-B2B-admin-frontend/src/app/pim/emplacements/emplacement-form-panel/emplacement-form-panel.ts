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
  FoldCheckboxComponent,
  FoldInputComponent,
  FoldNumberInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { type Emplacement } from '../../catalogue/catalogue-api';
import { EmplacementStore } from '../emplacement-store';

/** Ce qu'on fait d'un emplacement existant depuis le panneau. */
export type EmplacementPanelMode = 'edit' | 'delete';

/** Charge passée à `open()` : la boutique visée et l'intention. Absente = création. */
export interface EmplacementPanelData {
  readonly mode: EmplacementPanelMode;
  readonly emplacement: Emplacement;
}

/**
 * Panneau **emplacement** : création, édition ou suppression, ouvert
 * impérativement via `FoldPanelHostService.open()`. Sans `data` il crée ; avec
 * `{ mode: 'edit', emplacement }` il édite (champs préremplis) ; avec
 * `{ mode: 'delete', emplacement }` il affiche une **zone dangereuse** —
 * confirmation en retapant le nom, car supprimer la boutique emporte ses tables
 * et rend caducs les QR déjà imprimés.
 */
@Component({
  selector: 'app-emplacement-form-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldCheckboxComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
  ],
  templateUrl: './emplacement-form-panel.html',
  styleUrl: './emplacement-form-panel.scss',
})
export class EmplacementFormPanel {
  private readonly store = inject(EmplacementStore);
  private readonly ref = inject(FoldPanelRef);

  /** Boutique + intention ; absent = création. */
  readonly data = input<EmplacementPanelData | undefined>(undefined);

  protected readonly draftName = signal('');
  protected readonly draftBaseUrl = signal('');
  protected readonly draftClickCollect = signal(true);
  protected readonly draftSurPlace = signal(false);
  protected readonly draftTables = signal<number | null>(0);
  /** Saisie de confirmation en mode suppression (doit égaler le nom de la boutique). */
  protected readonly confirmName = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly emplacement = computed(() => this.data()?.emplacement);
  protected readonly isEdit = computed(() => this.data()?.mode === 'edit');
  protected readonly isDelete = computed(() => this.data()?.mode === 'delete');

  protected readonly heading = computed(() =>
    this.isDelete()
      ? "Supprimer l'emplacement"
      : this.isEdit()
        ? "Modifier l'emplacement"
        : 'Nouvel emplacement',
  );
  protected readonly subtitle = computed(() =>
    this.isDelete() ? 'Action irréversible.' : 'Une boutique, ses modes de vente et ses tables.',
  );
  protected readonly submitLabel = computed(() =>
    this.isDelete()
      ? 'Supprimer définitivement'
      : this.isEdit()
        ? 'Enregistrer'
        : "Ajouter l'emplacement",
  );

  /** En suppression, le nom retapé doit correspondre exactement. */
  protected readonly confirmMatches = computed(() => {
    const target = this.emplacement();
    return target !== undefined && this.confirmName().trim() === target.name;
  });

  constructor() {
    // Préremplit les champs quand une boutique est fournie (édition).
    effect(() => {
      const target = this.emplacement();
      if (target !== undefined) {
        this.draftName.set(target.name);
        this.draftBaseUrl.set(target.baseUrl);
        this.draftClickCollect.set(target.clickCollect);
        this.draftSurPlace.set(target.surPlace);
        this.draftTables.set(target.tables.length);
      }
    });
  }

  protected get canSubmit(): boolean {
    if (this.isDelete()) {
      return this.confirmMatches();
    }
    return this.draftName().trim() !== '';
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
    const target = this.emplacement();
    if (this.isDelete() && target !== undefined) {
      await this.store.remove(target.id);
      return;
    }
    const name = this.draftName().trim();
    if (name === '') {
      return;
    }
    const payload = {
      name,
      baseUrl: this.draftBaseUrl(),
      clickCollect: this.draftClickCollect(),
      surPlace: this.draftSurPlace(),
      tableCount: this.draftTables() ?? 0,
    };
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
