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
  BATCH_SHORTCUT_LABEL_MAX,
  DEFAULT_BATCH_SHORTCUT_LABEL,
  type BatchShortcutView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDangerZoneComponent,
  FoldInputComponent,
  FoldNumberInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { BatchShortcutsService } from '../batch-shortcuts.service';

/**
 * Ce que le dialogue règle : un raccourci à créer pour un produit, ou un
 * raccourci existant à modifier ou supprimer.
 */
export interface BatchShortcutDialogData {
  readonly sku: string;
  readonly productName: string;
  /** `null` : un raccourci neuf, son nom prérempli de « 1 plaque ». */
  readonly shortcut: BatchShortcutView | null;
  /** `production_settings:write` ? Sans lui, le dialogue se lit et se ferme. */
  readonly canWrite: boolean;
}

/**
 * **Le dialogue d'un raccourci du fournil** (plan
 * `documentation/fournil/plan-raccourcis-du-fournil.md`, §2, S1) : un nom
 * et un nombre de pièces ; en modification, une `fold-danger-zone` pour le
 * supprimer. Centré au bureau, feuille du bas en mobile — c'est la page qui
 * choisit le côté à l'ouverture.
 *
 * Il écrit lui-même et dit le refus du serveur sur place (doublon, plafond) :
 * fermé, il rend `true` si quelque chose a changé, rien sinon.
 */
@Component({
  selector: 'app-batch-shortcut-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDangerZoneComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './batch-shortcut-dialog.html',
  styleUrl: './batch-shortcut-dialog.scss',
})
export class BatchShortcutDialog {
  private readonly api = inject(BatchShortcutsService);
  private readonly ref = inject<FoldPanelRef<boolean>>(FoldPanelRef);

  readonly data = input.required<BatchShortcutDialogData>();

  protected readonly labelMax = BATCH_SHORTCUT_LABEL_MAX;
  protected readonly editing = computed(() => this.data().shortcut !== null);
  protected readonly canWrite = computed(() => this.data().canWrite);
  protected readonly title = computed(() =>
    this.editing() ? 'Raccourci' : 'Ajouter un raccourci',
  );

  protected readonly label = linkedSignal(
    () => this.data().shortcut?.label ?? DEFAULT_BATCH_SHORTCUT_LABEL,
  );
  protected readonly pieces = linkedSignal<number | null>(
    () => this.data().shortcut?.pieces ?? null,
  );
  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);

  /** La forme qui peut partir ; le serveur juge le reste et le dit. */
  protected readonly canSubmit = computed(() => {
    const label = this.label().trim();
    const pieces = this.pieces();
    return (
      this.canWrite() &&
      !this.saving() &&
      label.length > 0 &&
      [...label].length <= BATCH_SHORTCUT_LABEL_MAX &&
      pieces !== null &&
      Number.isInteger(pieces) &&
      pieces >= 1
    );
  });

  protected async submit(): Promise<void> {
    const pieces = this.pieces();
    if (!this.canSubmit() || pieces === null) {
      return;
    }
    const label = this.label().trim();
    const { sku, shortcut } = this.data();
    await this.gesture(async () => {
      if (shortcut === null) {
        await this.api.create({ sku, label, pieces });
      } else {
        await this.api.update(shortcut.id, { label, pieces });
      }
    }, "Le raccourci n'a pas pu être enregistré.");
  }

  protected async remove(): Promise<void> {
    const shortcut = this.data().shortcut;
    if (shortcut === null || !this.canWrite() || this.saving()) {
      return;
    }
    await this.gesture(
      () => this.api.remove(shortcut.id),
      "Le raccourci n'a pas pu être supprimé.",
    );
  }

  protected cancel(): void {
    this.ref.close();
  }

  /** Un geste vers le serveur : fermé sur un succès, le refus dit sur place. */
  private async gesture(run: () => Promise<void>, fallback: string): Promise<void> {
    this.saving.set(true);
    this.failure.set(null);
    try {
      await run();
      this.ref.close(true);
    } catch (error) {
      this.failure.set(httpErrorMessage(error, fallback));
    } finally {
      this.saving.set(false);
    }
  }
}
