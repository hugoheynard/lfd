import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { OperationAudience, OptionGroupPayload, OptionGroupView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldDangerZoneComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { OPTION_AUDIENCE_OPTIONS, optionAudienceLabel } from '../option-audience';
import { OptionGroupStore } from '../option-group.store';

/** Charge passée à `open()` : le groupe à modifier. Absente = création. */
export interface OptionGroupPanelData {
  readonly group: OptionGroupView;
}

/** Un choix en cours de saisie. `saved` : sa clé est posée, elle ne change plus. */
export interface ChoiceDraft {
  readonly key: string;
  readonly label: string;
  readonly audience: OperationAudience;
  readonly saved: boolean;
}

/** La forme d'une clé de choix, celle que le référentiel accepte. */
const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Panneau **groupe d'options** : création ou modification. Le groupe
 * s'enregistre d'un bloc — son nom et ses choix en service, dans l'ordre.
 * Retirer un choix enregistré l'archive à l'enregistrement : les commandes
 * passées gardent leur instantané. Un choix archivé revient d'ici.
 *
 * La clé d'un choix se saisit à la création, puis ne change plus : c'est
 * l'identité que la commande garde.
 */
@Component({
  selector: 'app-option-group-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldDangerZoneComponent,
  ],
  templateUrl: './option-group-panel.html',
  styleUrl: './option-group-panel.scss',
})
export class OptionGroupPanel {
  private readonly store = inject(OptionGroupStore);
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  readonly data = input<OptionGroupPanelData | undefined>(undefined);

  protected readonly audienceOptions = OPTION_AUDIENCE_OPTIONS;
  protected readonly audienceLabel = optionAudienceLabel;

  protected readonly draftName = signal('');
  protected readonly choices = signal<readonly ChoiceDraft[]>([
    { key: '', label: '', audience: 'both', saved: false },
  ]);
  protected readonly busy = signal(false);

  protected readonly group = computed(() => this.data()?.group);
  protected readonly isEdit = computed(() => this.group() !== undefined);
  protected readonly heading = computed(() =>
    this.isEdit() ? 'Modifier le groupe' : "Nouveau groupe d'options",
  );

  /** Les choix archivés du groupe qui ne sont pas revenus dans la liste. */
  protected readonly archivedChoices = computed(() => {
    const keys = new Set(this.choices().map((choice) => choice.key));
    return (this.group()?.choices ?? []).filter(
      (choice) => choice.archived && !keys.has(choice.key),
    );
  });

  /** Les choix enregistrés qu'on a retirés : ils s'archiveront. */
  protected readonly removedChoices = computed(() => {
    const keys = new Set(this.choices().map((choice) => choice.key));
    return (this.group()?.choices ?? []).filter(
      (choice) => !choice.archived && !keys.has(choice.key),
    );
  });

  /** Ce que l'archive dira : combien de fiches proposent encore ce groupe. */
  protected readonly archiveMessage = computed(() => {
    const products = this.group()?.products ?? 0;
    return products === 0
      ? "Aucune fiche ne l'active. Archivé, il ne se proposera plus ; il se restaure depuis la liste."
      : `${String(products)} fiche(s) l'activent : archivé, il ne s'y proposera plus. Les commandes passées gardent leur choix.`;
  });

  /** Le motif du blocage, dit sous les choix — `null` = enregistrable. */
  protected readonly problem = computed<string | null>(() => {
    const choices = this.choices();
    if (choices.length === 0) {
      return 'Un groupe porte au moins un choix.';
    }
    if (choices.some((choice) => choice.label.trim() === '' || choice.key === '')) {
      return 'Chaque choix porte une clé et un libellé.';
    }
    if (choices.some((choice) => !KEY_PATTERN.test(choice.key))) {
      return 'Une clé s’écrit en minuscules, chiffres et tirets (ex. « tranche »).';
    }
    if (new Set(choices.map((choice) => choice.key)).size !== choices.length) {
      return 'Deux choix ne peuvent pas porter la même clé.';
    }
    return null;
  });

  protected readonly canSubmit = computed(
    () => this.draftName().trim() !== '' && this.problem() === null && !this.busy(),
  );

  constructor() {
    effect(() => {
      const target = this.group();
      if (target !== undefined) {
        this.draftName.set(target.name);
        this.choices.set(
          target.choices
            .filter((choice) => !choice.archived)
            .map((choice) => ({ ...choice, saved: true })),
        );
      }
    });
  }

  protected setKey(index: number, key: string): void {
    this.patch(index, { key: key.trim() });
  }

  protected setLabel(index: number, label: string): void {
    this.patch(index, { label });
  }

  protected setAudience(index: number, audience: OperationAudience): void {
    this.patch(index, { audience });
  }

  protected addChoice(): void {
    this.choices.update((list) => [
      ...list,
      { key: '', label: '', audience: 'both', saved: false },
    ]);
  }

  protected removeChoice(index: number): void {
    this.choices.update((list) => list.filter((_, at) => at !== index));
  }

  /** Déplace un choix d'un cran — l'ordre est celui que la boutique proposera. */
  protected move(index: number, delta: -1 | 1): void {
    this.choices.update((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) {
        return list;
      }
      const next = [...list];
      const moved = next[index];
      const other = next[target];
      if (moved === undefined || other === undefined) {
        return list;
      }
      next[index] = other;
      next[target] = moved;
      return next;
    });
  }

  /** Remet un choix archivé dans la liste ; il sera restauré à l'enregistrement. */
  protected bringBack(key: string): void {
    const choice = this.group()?.choices.find((candidate) => candidate.key === key);
    if (choice !== undefined) {
      this.choices.update((list) => [...list, { ...choice, saved: true }]);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }
    const payload: OptionGroupPayload = {
      name: this.draftName().trim(),
      choices: this.choices().map(({ key, label, audience }) => ({
        key,
        label: label.trim(),
        audience,
      })),
    };
    const target = this.group();
    await this.run(async () => {
      if (target === undefined) {
        await this.store.create(payload);
      } else {
        await this.store.update(target.id, payload);
      }
    });
  }

  protected async archive(): Promise<void> {
    const target = this.group();
    if (target !== undefined) {
      await this.run(() => this.store.archive(target.id));
    }
  }

  /** Le refus laisse le panneau ouvert : le message dit pourquoi, le champ est là. */
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

  private patch(index: number, change: Partial<Omit<ChoiceDraft, 'saved'>>): void {
    this.choices.update((list) =>
      list.map((choice, at) => (at === index ? { ...choice, ...change } : choice)),
    );
  }
}
