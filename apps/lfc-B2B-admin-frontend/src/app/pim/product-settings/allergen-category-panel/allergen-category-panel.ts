import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { AllergenCategoryAdminView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldNumberInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { LangSwitch } from '../../../shared/lang-switch/lang-switch';
import { localizedField } from '../../../shared/lang-switch/localized-field';
import { AllergenStore } from '../allergen-store';
import {
  ARCHIVE_MEANING,
  NON_EU_REASON,
  OFFICIAL_CATEGORY_REASON,
  offeredCount,
  sameLocalizedText,
} from '../allergen-support';

/** Charge passée à `open()` : la catégorie à régler. Absente = ouverture. */
export interface AllergenCategoryPanelData {
  readonly category: AllergenCategoryAdminView;
}

/** Le rang qu'attribue le serveur quand on n'en propose aucun. */
const DEFAULT_POSITION = 100;

/**
 * Panneau **catégorie d'allergènes** — ouverture, réglage, archivage.
 *
 * Il porte l'asymétrie du référentiel, et il l'écrit plutôt que de la subir :
 * sur une catégorie officielle, le libellé et la clé sont lus sous cadenas avec
 * la raison en toutes lettres, et **seul le rang** reste ouvert. Un champ grisé
 * sans phrase se lit comme une panne ; un champ ouvert qui déclencherait un 409
 * est pire.
 *
 * La **clé** est une identité que les entrées citent : saisissable à
 * l'ouverture, lue ensuite. Le renommer serait le chemin en deux temps vers une
 * autre ligne.
 */
@Component({
  selector: 'app-allergen-category-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    LangSwitch,
  ],
  templateUrl: './allergen-category-panel.html',
  styleUrl: './allergen-category-panel.scss',
})
export class AllergenCategoryPanel {
  private readonly store = inject(AllergenStore);
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  readonly data = input<AllergenCategoryPanelData | undefined>(undefined);

  protected readonly officialReason = OFFICIAL_CATEGORY_REASON;
  protected readonly nonEuReason = NON_EU_REASON;
  protected readonly archiveMeaning = ARCHIVE_MEANING;

  protected readonly category = computed(() => this.data()?.category);
  protected readonly isEdit = computed(() => this.category() !== undefined);
  protected readonly isOfficial = computed(() => this.category()?.official === true);
  protected readonly isArchived = computed(() => (this.category()?.archivedAt ?? null) !== null);
  /** Officielle et sans mention INCO : la seule que le catalogue légal écarte. */
  protected readonly isNonEu = computed(
    () => this.isOfficial() && this.category()?.incoCategory === null,
  );

  protected readonly draftKey = signal('');
  protected readonly draftPosition = signal<number | null>(DEFAULT_POSITION);
  protected readonly busy = signal(false);

  protected readonly name = localizedField({
    source: () => this.category()?.name ?? { fr: '' },
    label: 'Libellé',
    subject: 'Le libellé',
  });

  protected readonly heading = computed(() =>
    this.isEdit() ? 'Régler la catégorie' : 'Nouvelle catégorie',
  );

  /** Ce qui la retient à l'archivage : les allergènes encore proposés dessous. */
  protected readonly offered = computed(() => {
    const target = this.category();
    return target === undefined ? 0 : offeredCount(target);
  });

  /** Y a-t-il quelque chose à enregistrer ? Sinon le bouton ment. */
  protected readonly dirty = computed(() => {
    const target = this.category();
    if (target === undefined) {
      return this.draftKey().trim() !== '' && this.name.filled();
    }
    const renamed = !this.isOfficial() && !sameLocalizedText(this.name.text(), target.name);
    return renamed || this.draftPosition() !== target.position;
  });

  protected readonly canSubmit = computed(() => this.dirty() && this.name.filled() && !this.busy());

  constructor() {
    effect(() => {
      const target = this.category();
      if (target !== undefined) {
        this.draftKey.set(target.key);
        this.draftPosition.set(target.position);
      }
    });
  }

  protected async submit(): Promise<void> {
    await this.run(() => this.persist());
  }

  protected async archive(): Promise<void> {
    const target = this.category();
    if (target === undefined) {
      return;
    }
    await this.run(() => this.store.archiveCategory(target.id));
  }

  protected async restore(): Promise<void> {
    const target = this.category();
    if (target === undefined) {
      return;
    }
    await this.run(() => this.store.restoreCategory(target.id));
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
    const target = this.category();
    const position = this.draftPosition();
    if (target === undefined) {
      await this.store.createCategory({
        key: this.draftKey().trim(),
        name: this.name.text(),
        ...(position === null ? {} : { position }),
      });
      return;
    }
    // Deux routes parce que ce sont deux gestes : renommer touche une mention,
    // ranger ne touche que l'écran — et l'officiel n'accepte que le second.
    if (!this.isOfficial() && !sameLocalizedText(this.name.text(), target.name)) {
      await this.store.renameCategory(target.id, this.name.text());
    }
    if (position !== null && position !== target.position) {
      await this.store.moveCategory(target.id, position);
    }
  }
}
