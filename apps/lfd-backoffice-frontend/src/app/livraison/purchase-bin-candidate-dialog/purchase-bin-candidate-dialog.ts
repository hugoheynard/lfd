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
import type { PurchaseBinCandidateView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
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
  readBinDraft,
  type BinCandidateDraft,
  binDraftOf,
} from '../purchase-library';
import { PurchaseLibraryService } from '../purchase-library.service';

/** Ajouter (`candidate` absent) ou corriger un format de bac candidat. */
export interface PurchaseBinCandidateDialogData {
  readonly candidate?: PurchaseBinCandidateView;
}

/**
 * **Saisir un format de bac candidat** de la bibliothèque d'achat
 * (`plan-bibliotheque-d-achat.md`, B-D1, lot B4) : la géométrie d'un type de
 * bac, et de quoi l'acheter — fournisseur, référence, lien, prix unitaire HT.
 *
 * Le prix se tape en euros et part en centimes entiers, lu comme du texte
 * (`parseEurosToCents`) : aucun flottant. Le dialogue écrit lui-même et ne se
 * ferme que sur un succès (`true`) ; un refus du serveur (intérieur plus
 * grand que l'extérieur, lien non https) reste affiché tel quel.
 */
@Component({
  selector: 'app-purchase-bin-candidate-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldFieldsetComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './purchase-bin-candidate-dialog.html',
  styleUrl: './purchase-bin-candidate-dialog.scss',
})
export class PurchaseBinCandidateDialog implements FoldPanelContent<PurchaseBinCandidateDialogData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<PurchaseBinCandidateDialogData>();

  private readonly api = inject(PurchaseLibraryService);
  private readonly panel = inject(FoldPanelRef);

  protected readonly draft = signal<BinCandidateDraft>(binDraftOf(undefined));
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  private readonly reading = computed(() => readBinDraft(this.draft()));
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
    this.isCreate() ? 'Ajouter un format candidat' : 'Corriger le format candidat',
  );

  /** En correction, rien de ce qui PARTIRAIT n'a changé : rien à écrire. */
  private readonly unchanged = computed(() => {
    const candidate = this.data().candidate;
    return (
      candidate !== undefined &&
      JSON.stringify(readBinDraft(binDraftOf(candidate))) === JSON.stringify(this.reading())
    );
  });

  protected readonly canSubmit = computed(
    () => this.issue() === '' && !this.unchanged() && !this.saving(),
  );

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      const candidate = this.data().candidate;
      untracked(() => this.draft.set(binDraftOf(candidate)));
    });
  }

  protected set<K extends keyof BinCandidateDraft>(key: K, value: BinCandidateDraft[K]): void {
    this.draft.set({ ...this.draft(), [key]: value });
  }

  protected setOuter(patch: Partial<CmDraft>): void {
    this.set('outer', { ...this.draft().outer, ...patch });
  }

  protected setInner(patch: Partial<CmDraft>): void {
    this.set('inner', { ...this.draft().inner, ...patch });
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
        await this.api.addBinCandidate(reading.payload);
      } else {
        await this.api.updateBinCandidate(candidate.id, reading.payload);
      }
      this.panel.close(true);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le format candidat n’a pas pu être enregistré.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.panel.close(false);
  }
}
