import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { IngredientView } from '@lfd/pim-contracts';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldOptionComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { LangSwitch } from '../../../shared/lang-switch/lang-switch';
import { localizedField } from '../../../shared/lang-switch/localized-field';
import { NotifyService } from '../../../notify.service';
import { ProvenanceStore } from '../provenance.store';

/** Charge passée à `open()` : l'ingrédient à régler. Absente = déclaration. */
export interface IngredientPanelData {
  readonly ingredient: IngredientView;
}

/** Ce que « pas d'appellation » vaut dans la liste — le vide n'est pas une option. */
const NO_APPELLATION = '';

/**
 * Panneau **ingrédient** — déclaration ou réglage, plus la zone dangereuse.
 *
 * Le **nom** et la **description** se traduisent ; l'origine géographique non —
 * « Savoie, France » est un lieu, pas une phrase, et le traduire inventerait
 * trois façons de nommer le même endroit.
 *
 * L'appellation est **facultative** : la farine du moulin d'à côté n'a pas de
 * signe officiel, et l'obliger à en porter un fabriquerait des appellations
 * creuses pour satisfaire un champ.
 */
@Component({
  selector: 'app-ingredient-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldOptionComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    LangSwitch,
  ],
  templateUrl: './ingredient-panel.html',
  styleUrl: './ingredient-panel.scss',
})
export class IngredientPanel {
  private readonly store = inject(ProvenanceStore);
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  readonly data = input<IngredientPanelData | undefined>(undefined);

  protected readonly ingredient = computed(() => this.data()?.ingredient);
  protected readonly isEdit = computed(() => this.ingredient() !== undefined);

  protected readonly draftKey = signal('');
  protected readonly draftOrigin = signal('');
  protected readonly draftAppellation = signal<string>(NO_APPELLATION);
  protected readonly confirmKey = signal('');
  protected readonly busy = signal(false);
  protected readonly dangerOpen = signal(false);

  protected readonly name = localizedField({
    source: () => this.ingredient()?.name ?? { fr: '' },
    label: 'Nom',
    subject: 'Le nom',
  });

  protected readonly description = localizedField({
    source: () => this.ingredient()?.description ?? { fr: '' },
    label: 'Description',
    subject: 'La description',
  });

  protected readonly heading = computed(() =>
    this.isEdit() ? "Régler l'ingrédient" : 'Nouvel ingrédient',
  );

  /**
   * Les appellations qu'on peut POSER, plus « aucune ».
   *
   * Celles hors service en sont absentes — mais celle que l'ingrédient porte
   * DÉJÀ y reste, même retirée : sinon le panneau l'effacerait en silence au
   * premier enregistrement.
   */
  protected readonly appellationOptions = computed<{ value: string; text: string }[]>(() => {
    const held = this.ingredient()?.appellation ?? null;
    const offered = this.store.offeredAppellations();
    const all =
      held !== null && !offered.some((row) => row.code === held.code)
        ? [...offered, held]
        : offered;
    return [
      { value: NO_APPELLATION, text: 'Aucune appellation' },
      ...all.map((row) => ({
        value: row.code,
        text: row.scheme === '' ? row.label.fr : `${row.scheme} — ${row.label.fr}`,
      })),
    ];
  });

  protected readonly held = computed(() => this.ingredient()?.usedBy ?? 0);

  protected readonly confirmMatches = computed(
    () => this.confirmKey().trim() === (this.ingredient()?.key ?? ' '),
  );

  protected readonly canDelete = computed(
    () => this.held() === 0 && this.confirmMatches() && !this.busy(),
  );

  constructor() {
    effect(() => {
      const target = this.ingredient();
      if (target !== undefined) {
        this.draftKey.set(target.key);
        this.draftOrigin.set(target.origin);
        this.draftAppellation.set(target.appellation?.code ?? NO_APPELLATION);
      }
    });
  }

  protected get canSubmit(): boolean {
    return this.draftKey().trim() !== '' && this.name.filled() && !this.busy();
  }

  /** `valueChange` rend `null` quand rien n'est choisi — ce qui EST « aucune ». */
  protected pickAppellation(value: string | null): void {
    this.draftAppellation.set(value ?? NO_APPELLATION);
  }

  protected async submit(): Promise<void> {
    await this.run(() => this.persist());
  }

  protected async remove(): Promise<void> {
    const target = this.ingredient();
    if (target === undefined) {
      return;
    }
    await this.run(() => this.store.removeIngredient(target.key));
  }

  protected toggleDanger(): void {
    this.dangerOpen.update((open) => !open);
  }

  protected cancel(): void {
    this.ref.close();
  }

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

  /**
   * Une description vidée part en `null` : le serveur en fait une absence, et
   * une absence n'est pas un texte vide — c'est ce que le référentiel compte
   * comme « personne n'a écrit ».
   */
  private async persist(): Promise<void> {
    const appellationCode =
      this.draftAppellation() === NO_APPELLATION ? null : this.draftAppellation();
    const description = this.description.filled() ? this.description.text() : null;
    const target = this.ingredient();

    if (target === undefined) {
      await this.store.createIngredient({
        key: this.draftKey().trim(),
        name: this.name.text(),
        description,
        origin: this.draftOrigin().trim(),
        appellationCode,
      });
      return;
    }
    await this.store.updateIngredient(target.key, {
      name: this.name.text(),
      description,
      origin: this.draftOrigin().trim(),
      appellationCode,
    });
  }
}
