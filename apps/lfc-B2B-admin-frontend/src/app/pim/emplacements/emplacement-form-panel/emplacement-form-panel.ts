import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
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

import { NotifyService } from '../../../notify.service';
import type { Emplacement } from '../../data/models';
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
  private readonly notify = inject(NotifyService);

  /** Boutique + intention ; absent = création. */
  readonly data = input<EmplacementPanelData | undefined>(undefined);

  protected readonly emplacement = computed(() => this.data()?.emplacement);

  /**
   * Les brouillons **dérivent** de la boutique reçue.
   *
   * `linkedSignal` plutôt qu'un `effect` d'amorçage : l'effet re-tirait à chaque
   * changement de l'entrée et **écrasait la saisie en cours**, et il laissait
   * une fenêtre où les champs étaient vides — assez pour qu'un enregistrement
   * précoce parte avec un nom vide. Même correction que sur le panneau famille.
   */
  protected readonly draftName = linkedSignal(() => this.emplacement()?.name ?? '');
  protected readonly draftBaseUrl = linkedSignal(() => this.emplacement()?.baseUrl ?? '');
  protected readonly draftClickCollect = linkedSignal(
    () => this.emplacement()?.clickCollect ?? true,
  );
  protected readonly draftSurPlace = linkedSignal(() => this.emplacement()?.surPlace ?? false);
  protected readonly draftTables = linkedSignal<number | null>(
    () => this.emplacement()?.tables.length ?? 0,
  );
  /** Saisie de confirmation en mode suppression (doit égaler le nom de la boutique). */
  protected readonly confirmName = signal('');
  protected readonly busy = signal(false);
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

  /** Combien de familles vendent ici — le référentiel refusera tant que > 0. */
  protected readonly usedByCategories = computed(() => this.emplacement()?.usedByCategories ?? 0);

  /**
   * Supprimable : **personne ne s'en sert**, et le nom est confirmé.
   *
   * Le compte vient de l'API. Sans lui, le bouton était armé quoi qu'il arrive
   * et le refus n'arrivait qu'après le clic — alors que le panneau des taux, à
   * deux dossiers d'ici, désarme le sien pour exactement cette raison.
   */
  protected readonly canDelete = computed(
    () => this.usedByCategories() === 0 && this.confirmMatches(),
  );

  protected get canSubmit(): boolean {
    if (this.isDelete()) {
      return this.canDelete();
    }
    return this.draftName().trim() !== '';
  }

  /**
   * Le panneau **reste ouvert** sur un refus, et le message est celui du
   * référentiel — « Emplacement encore vendeur : 3 famille(s) le cochent » —
   * et non le `message` brut d'une `HttpErrorResponse`, qui aurait affiché
   * « Http failure response for http://… : 409 Conflict ». Le backend prend
   * soin de dire quoi faire ; l'écran le lui reprenait.
   */
  protected async submit(): Promise<void> {
    this.busy.set(true);
    try {
      await this.persist();
      this.ref.close(true);
    } catch (caught) {
      this.notify.refused(caught, 'Opération refusée.');
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
      // Le bouton est désarmé sur un nom vide ; si on arrive quand même ici,
      // se taire et fermer serait annoncer un enregistrement qui n'a pas eu
      // lieu. On refuse, et le va-et-vient ci-dessus le dit.
      throw new Error('Le nom est obligatoire.');
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
