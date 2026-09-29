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
import {
  BIN_DIMENSION_MAX_CM,
  BIN_DIMENSION_MIN_CM,
  BIN_MAX_STACK_MAX,
  BIN_MAX_STACK_MIN,
  type BinTypeView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
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
  binDraftOf,
  draftInnerVolumeLiters,
  litersLabel,
  readBinDraft,
  sameBinPayload,
  type BinTypeDraft,
  type DimensionsDraft,
} from '../delivery-bins';
import { DeliveryBinsService } from '../delivery-bins.service';

/** Créer (`bin` absent) ou corriger un type de bac. */
export interface BinTypeDialogData {
  readonly bin?: BinTypeView;
}

type Side = 'outer' | 'inner';

/**
 * **Saisir un type de bac** : son nom, ses dimensions extérieures (celles du
 * chargement) et intérieures (informatives), le froid, la pile, la cloison.
 *
 * Le dialogue écrit lui-même et ne se ferme que sur un succès (`true`). Ce qui
 * empêche l'envoi se dit sous les champs (`readBinDraft`) ; un refus du
 * serveur reste affiché tel quel, dialogue ouvert, pour corriger sans
 * ressaisir. La charge part toujours COMPLÈTE : `PUT` remplace la fiche.
 */
@Component({
  selector: 'app-bin-type-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
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
  templateUrl: './bin-type-dialog.html',
  styleUrl: './bin-type-dialog.scss',
})
export class BinTypeDialog implements FoldPanelContent<BinTypeDialogData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<BinTypeDialogData>();

  private readonly api = inject(DeliveryBinsService);
  private readonly panel = inject(FoldPanelRef);

  protected readonly draft = signal<BinTypeDraft>(binDraftOf(undefined));
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** Les deux jeux de dimensions, dans l'ordre où on les mesure. */
  protected readonly sides: readonly {
    readonly key: Side;
    readonly legend: string;
    readonly hint: string;
  }[] = [
    {
      key: 'outer',
      legend: 'Dimensions extérieures (cm)',
      hint: 'Celles qui comptent au chargement du véhicule.',
    },
    {
      key: 'inner',
      legend: 'Dimensions intérieures (cm)',
      hint: 'Informatives ; aucune ne dépasse l’extérieur.',
    },
  ];

  protected readonly bounds = {
    cmMin: BIN_DIMENSION_MIN_CM,
    cmMax: BIN_DIMENSION_MAX_CM,
    stackMin: BIN_MAX_STACK_MIN,
    stackMax: BIN_MAX_STACK_MAX,
  } as const;

  private readonly reading = computed(() => readBinDraft(this.draft()));

  /** Ce qui empêche l'envoi — ou `''`. */
  protected readonly issue = computed(() => {
    const reading = this.reading();
    return reading.ok ? '' : reading.issue;
  });

  /** « Volume intérieur : 54 L », en direct — ou `null` tant qu'une dimension manque. */
  protected readonly volume = computed(() => {
    const liters = draftInnerVolumeLiters(this.draft().inner);
    return liters === null ? null : `Volume intérieur : ${litersLabel(liters)}`;
  });

  protected readonly isCreate = computed(() => this.data().bin === undefined);
  protected readonly title = computed(() =>
    this.isCreate() ? 'Ajouter un type de bac' : 'Corriger le type de bac',
  );

  /** En correction, rien n'a changé : Enregistrer n'a rien à écrire. */
  private readonly unchanged = computed(() => {
    const bin = this.data().bin;
    const reading = this.reading();
    return bin !== undefined && reading.ok && sameBinPayload(bin, reading.payload);
  });

  protected readonly canSubmit = computed(
    () => this.issue() === '' && !this.unchanged() && !this.saving(),
  );

  constructor() {
    // Une entrée requise n'est pas posée quand le constructeur tourne.
    effect(() => {
      const bin = this.data().bin;
      untracked(() => this.draft.set(binDraftOf(bin)));
    });
  }

  protected setName(name: string): void {
    this.draft.set({ ...this.draft(), name });
  }

  protected setDimension(side: Side, key: keyof DimensionsDraft, value: number | null): void {
    const draft = this.draft();
    this.draft.set({ ...draft, [side]: { ...draft[side], [key]: value } });
  }

  protected setMaxStack(maxStack: number | null): void {
    this.draft.set({ ...this.draft(), maxStack });
  }

  protected setIsotherm(isotherm: boolean): void {
    this.draft.set({ ...this.draft(), isotherm });
  }

  protected setDivisible(divisible: boolean): void {
    this.draft.set({ ...this.draft(), divisible });
  }

  protected async submit(): Promise<void> {
    const reading = this.reading();
    if (!this.canSubmit() || !reading.ok) {
      return;
    }
    const bin = this.data().bin;
    this.saving.set(true);
    this.refusal.set(null);
    try {
      if (bin === undefined) {
        await this.api.addBinType(reading.payload);
      } else {
        await this.api.updateBinType(bin.id, reading.payload);
      }
      this.panel.close(true);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "Le type de bac n'a pas pu être enregistré."));
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.panel.close(false);
  }
}
