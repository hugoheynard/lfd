import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { AllergenEntryAdminView, ReviseAllergenEntryPayload } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { LangSwitch } from '../../../shared/lang-switch/lang-switch';
import { localizedField } from '../../../shared/lang-switch/localized-field';
import { AllergenStore } from '../allergen-store';
import { ARCHIVE_MEANING, OFFICIAL_ENTRY_REASON, sameLocalizedText } from '../allergen-support';

/** Charge passée à `open()`. Sans `entry`, on déclare un allergène neuf. */
export interface AllergenEntryPanelData {
  /** L'allergène à réviser. Absent = déclaration. */
  readonly entry?: AllergenEntryAdminView;
  /** La catégorie d'accueil — la sienne, ou celle depuis laquelle on ouvre. */
  readonly categoryId: string;
}

/**
 * Panneau **allergène** — déclaration, révision, archivage.
 *
 * Un code GS1 officiel s'y lit sous cadenas, avec la raison : ce n'est pas une
 * ligne de configuration mais une identité de stockage réglementée, et la
 * corriger se fait à la source, contre GS1. Le panneau reste ouvrable sur lui —
 * il montre ses libellés dans toutes leurs langues, et dit pourquoi rien ne
 * s'édite. Un panneau qu'on ne pourrait pas ouvrir laisserait la même question
 * sans réponse.
 *
 * Le **code** est une identité de stockage : saisi une fois, lu ensuite. Le
 * rattachement, lui, se révise — c'est ce qui distingue le maison du droit.
 */
@Component({
  selector: 'app-allergen-entry-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    LangSwitch,
  ],
  templateUrl: './allergen-entry-panel.html',
  styleUrl: './allergen-entry-panel.scss',
})
export class AllergenEntryPanel {
  private readonly store = inject(AllergenStore);
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  readonly data = input<AllergenEntryPanelData | undefined>(undefined);

  protected readonly officialReason = OFFICIAL_ENTRY_REASON;
  protected readonly archiveMeaning = ARCHIVE_MEANING;

  protected readonly entry = computed(() => this.data()?.entry);
  protected readonly isEdit = computed(() => this.entry() !== undefined);
  protected readonly isOfficial = computed(() => this.entry()?.official === true);
  protected readonly isArchived = computed(() => (this.entry()?.archivedAt ?? null) !== null);

  protected readonly draftCode = signal('');
  protected readonly draftCategoryId = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly name = localizedField({
    source: () => this.entry()?.name ?? { fr: '' },
    label: 'Libellé',
    subject: 'Le libellé',
  });

  protected readonly heading = computed(() => {
    if (!this.isEdit()) {
      return 'Nouvel allergène';
    }
    return this.isOfficial() ? "L'allergène, en lecture" : "Réviser l'allergène";
  });

  /**
   * Où l'on peut ranger : les catégories encore au référentiel, plus la sienne
   * si elle a été archivée entre-temps — sinon la liste n'afficherait rien là
   * où l'entrée est pourtant rangée.
   */
  protected readonly categoryOptions = computed(() => {
    const living = this.store.livingCategories();
    const held = this.draftCategoryId();
    const options = living.map((category) => ({
      value: category.id,
      label: category.name.fr,
    }));
    if (held === null || options.some((option) => option.value === held)) {
      return options;
    }
    const orphan = this.store.categories().find((category) => category.id === held);
    return orphan === undefined
      ? options
      : [{ value: orphan.id, label: `${orphan.name.fr} (archivée)` }, ...options];
  });

  /** Y a-t-il quelque chose à enregistrer ? Sinon le bouton ment. */
  protected readonly dirty = computed(() => {
    const target = this.entry();
    if (target === undefined) {
      return (
        this.draftCode().trim() !== '' && this.name.filled() && this.draftCategoryId() !== null
      );
    }
    if (this.isOfficial()) {
      return false;
    }
    const renamed = !sameLocalizedText(this.name.text(), target.name);
    return renamed || this.draftCategoryId() !== this.data()?.categoryId;
  });

  protected readonly canSubmit = computed(() => this.dirty() && this.name.filled() && !this.busy());

  constructor() {
    effect(() => {
      const held = this.data();
      if (held !== undefined) {
        this.draftCategoryId.set(held.categoryId);
        this.draftCode.set(held.entry?.code ?? '');
      }
    });
  }

  protected async submit(): Promise<void> {
    await this.run(() => this.persist());
  }

  protected async archive(): Promise<void> {
    const target = this.entry();
    if (target === undefined) {
      return;
    }
    await this.run(() => this.store.archiveEntry(target.id));
  }

  protected async restore(): Promise<void> {
    const target = this.entry();
    if (target === undefined) {
      return;
    }
    await this.run(() => this.store.restoreEntry(target.id));
  }

  protected cancel(): void {
    this.ref.close();
  }

  /** Le panneau **reste ouvert** sur un refus : les champs sont là pour corriger. */
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
    const target = this.entry();
    const categoryId = this.draftCategoryId();
    if (categoryId === null) {
      return;
    }
    if (target === undefined) {
      await this.store.createEntry({
        code: this.draftCode().trim(),
        name: this.name.text(),
        categoryId,
      });
      return;
    }
    // Un champ ABSENT vaut « ne touche pas à ça » : on n'envoie que ce qui a
    // bougé, pour que le journal ne consigne pas un geste que personne n'a fait.
    const payload: ReviseAllergenEntryPayload = {
      ...(sameLocalizedText(this.name.text(), target.name) ? {} : { name: this.name.text() }),
      ...(categoryId === this.data()?.categoryId ? {} : { categoryId }),
    };
    await this.store.reviseEntry(target.id, payload);
  }
}
