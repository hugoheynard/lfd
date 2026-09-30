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
import type { PurchaseVehicleCandidateView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldFieldsetComponent,
  FoldInputComponent,
  FoldNumberInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import {
  type CmDraft,
  readVehicleDraft,
  type VehicleCandidateDraft,
  vehicleDraftOf,
} from '../purchase-library';
import { PurchaseLibraryService } from '../purchase-library.service';

/** Ajouter (`candidate` absent) ou corriger un véhicule candidat. */
export interface PurchaseVehicleCandidateDialogData {
  readonly candidate?: PurchaseVehicleCandidateView;
}

/**
 * **Saisir un véhicule candidat** de la bibliothèque d'achat
 * (`plan-bibliotheque-d-achat.md`, B-D1, lot B4) : son plancher, ses passages
 * de roue, et de quoi l'acheter — référence, lien, prix HT.
 *
 * Le prix se tape en euros et part en centimes entiers, lu comme du texte
 * (`parseEurosToCents`) : aucun flottant. Le dialogue écrit lui-même et ne se
 * ferme que sur un succès (`true`) ; un refus du serveur (lien non https,
 * passages qui débordent du plancher) reste affiché tel quel.
 */
@Component({
  selector: 'app-purchase-vehicle-candidate-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldFieldsetComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './purchase-vehicle-candidate-dialog.html',
  styleUrl: './purchase-vehicle-candidate-dialog.scss',
})
export class PurchaseVehicleCandidateDialog implements FoldPanelContent<PurchaseVehicleCandidateDialogData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<PurchaseVehicleCandidateDialogData>();

  private readonly api = inject(PurchaseLibraryService);
  private readonly panel = inject(FoldPanelRef);

  protected readonly draft = signal<VehicleCandidateDraft>(vehicleDraftOf(undefined));
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  private readonly reading = computed(() => readVehicleDraft(this.draft()));
  /** Ce qui empêche l'envoi — ou `''`. */
  protected readonly issue = computed(() => {
    const reading = this.reading();
    return reading.ok ? '' : reading.issue;
  });

  /** Tant que rien n'est nommé, le formulaire est vierge : pas d'avertissement. */
  protected readonly shownIssue = computed(() =>
    this.draft().name.trim() === '' ? '' : this.issue(),
  );

  protected readonly isCreate = computed(() => this.data().candidate === undefined);
  protected readonly title = computed(() =>
    this.isCreate() ? 'Ajouter un véhicule candidat' : 'Corriger le véhicule candidat',
  );

  /** En correction, rien de ce qui PARTIRAIT n'a changé : rien à écrire. */
  private readonly unchanged = computed(() => {
    const candidate = this.data().candidate;
    return (
      candidate !== undefined &&
      JSON.stringify(readVehicleDraft(vehicleDraftOf(candidate))) === JSON.stringify(this.reading())
    );
  });

  protected readonly canSubmit = computed(
    () => this.issue() === '' && !this.unchanged() && !this.saving(),
  );

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      const candidate = this.data().candidate;
      untracked(() => this.draft.set(vehicleDraftOf(candidate)));
    });
  }

  protected set<K extends keyof VehicleCandidateDraft>(
    key: K,
    value: VehicleCandidateDraft[K],
  ): void {
    this.draft.set({ ...this.draft(), [key]: value });
  }

  protected setCargo(patch: Partial<CmDraft>): void {
    this.set('cargo', { ...this.draft().cargo, ...patch });
  }

  protected async submit(): Promise<void> {
    const reading = this.reading();
    if (!this.canSubmit() || !reading.ok) {
      return;
    }
    const candidate = this.data().candidate;
    this.saving.set(true);
    this.refusal.set(null);
    try {
      if (candidate === undefined) {
        await this.api.addVehicleCandidate(reading.payload);
      } else {
        await this.api.updateVehicleCandidate(candidate.id, reading.payload);
      }
      this.panel.close(true);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le véhicule candidat n’a pas pu être enregistré.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.panel.close(false);
  }
}
