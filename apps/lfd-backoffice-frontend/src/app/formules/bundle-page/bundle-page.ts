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
import type { BundleView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBackLinkComponent,
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDangerZoneComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { BundleCompositionEditor } from '../bundle-composition-editor/bundle-composition-editor';
import {
  compositionPayload,
  compositionProblem,
  type GroupDraft,
  groupsOf,
  inadmissibleCount,
  sameComposition,
} from '../bundle-draft';
import { BundlesService } from '../bundles.service';

type LoadState = 'loading' | 'error' | 'ready';

/** Un geste de la page : chacun garde son attente et son refus. */
type Gesture = 'presentation' | 'composition' | 'withdraw' | 'draft';

/**
 * **Une formule** — `/formules/:key` : sa présentation, puis sa composition,
 * chacune enregistrée par son `PUT` ; la composition part ENTIÈRE, l'agrégat
 * juge l'état complet. Après une écriture, la page relit. Un refus reste à
 * côté de la saisie, qui n'est pas perdue.
 *
 * Retirée, elle se lit et se remet en brouillon ; sans `shop_bundles:write`,
 * elle se lit seulement.
 */
@Component({
  selector: 'app-bundle-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BundleCompositionEditor,
    FoldBackLinkComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDangerZoneComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './bundle-page.html',
  styleUrl: './bundle-page.scss',
})
export class BundlePage {
  private readonly api = inject(BundlesService);
  private readonly permissions = inject(PermissionsStore);
  private readonly notify = inject(NotifyService);

  readonly key = input.required<string>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly bundle = signal<BundleView | null>(null);
  protected readonly failure = signal('');

  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly groups = signal<readonly GroupDraft[]>([]);
  private readonly savedGroups = signal<readonly GroupDraft[]>([]);

  protected readonly busy = signal<Gesture | null>(null);
  protected readonly refusals = signal<Readonly<Partial<Record<Gesture, string>>>>({});

  protected readonly canWrite = computed(() => this.permissions.can('shop_bundles:write'));
  protected readonly withdrawn = computed(() => this.bundle()?.status === 'withdrawn');
  protected readonly locked = computed(() => !this.canWrite() || this.withdrawn());

  protected readonly presentationChanged = computed(() => {
    const bundle = this.bundle();
    return (
      bundle !== null &&
      (this.name() !== bundle.name || this.description() !== (bundle.description ?? ''))
    );
  });
  protected readonly nameMissing = computed(() => this.name().trim() === '');

  protected readonly compositionChanged = computed(
    () => !sameComposition(this.groups(), this.savedGroups()),
  );
  protected readonly compositionProblem = computed(() => compositionProblem(this.groups()));

  protected readonly inadmissible = computed(() => {
    const bundle = this.bundle();
    return bundle === null ? 0 : inadmissibleCount(bundle);
  });

  constructor() {
    effect(() => {
      const key = this.key();
      untracked(() => void this.load(key));
    });
  }

  protected async load(key: string): Promise<void> {
    this.state.set('loading');
    try {
      this.show(await this.api.get(key));
      this.state.set('ready');
    } catch (error: unknown) {
      this.failure.set(httpErrorMessage(error, "La formule n'a pas pu être lue."));
      this.state.set('error');
    }
  }

  protected refusal(gesture: Gesture): string | null {
    return this.refusals()[gesture] ?? null;
  }

  protected savePresentation(): Promise<void> {
    const description = this.description().trim();
    return this.run(
      'presentation',
      'Présentation enregistrée.',
      "La présentation n'a pas pu être enregistrée.",
      (key) =>
        this.api.editPresentation(key, {
          name: this.name().trim(),
          description: description === '' ? null : description,
        }),
    );
  }

  protected saveComposition(): Promise<void> {
    if (this.compositionProblem() !== null) {
      return Promise.resolve();
    }
    return this.run(
      'composition',
      'Composition enregistrée.',
      "La composition n'a pas pu être enregistrée.",
      (key) => this.api.saveComposition(key, compositionPayload(this.groups())),
    );
  }

  protected withdraw(): Promise<void> {
    return this.run('withdraw', 'Formule retirée.', "La formule n'a pas pu être retirée.", (key) =>
      this.api.withdraw(key),
    );
  }

  protected backToDraft(): Promise<void> {
    return this.run(
      'draft',
      'Formule remise en brouillon.',
      "La formule n'a pas pu être remise en brouillon.",
      (key) => this.api.backToDraft(key),
    );
  }

  private async run(
    gesture: Gesture,
    success: string,
    fallback: string,
    write: (key: string) => Promise<unknown>,
  ): Promise<void> {
    if (!this.canWrite()) {
      return;
    }
    this.busy.set(gesture);
    this.refusals.update((all) => ({ ...all, [gesture]: undefined }));
    try {
      await write(this.key());
    } catch (error) {
      this.refusals.update((all) => ({ ...all, [gesture]: httpErrorMessage(error, fallback) }));
      this.busy.set(null);
      return;
    }
    this.notify.success(success);
    try {
      this.show(await this.api.get(this.key()), gesture);
    } catch (error) {
      this.notify.error(error, "La formule n'a pas pu être relue. Rechargez la page.");
    } finally {
      this.busy.set(null);
    }
  }

  /**
   * Pose la formule lue. Après une écriture, seule la section écrite reprend
   * ce que dit le serveur : l'autre garde sa saisie en cours.
   */
  private show(bundle: BundleView, written?: Gesture): void {
    const keepPresentation = written === 'composition' && this.presentationChanged();
    const keepComposition = written === 'presentation' && this.compositionChanged();
    this.bundle.set(bundle);
    if (!keepPresentation) {
      this.name.set(bundle.name);
      this.description.set(bundle.description ?? '');
    }
    const groups = groupsOf(bundle);
    this.savedGroups.set(groups);
    if (!keepComposition) {
      this.groups.set(groups);
    }
  }
}
