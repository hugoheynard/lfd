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
import type { CommerceOperationAudience, CommerceOperationView } from '@lfd/contracts';
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
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import {
  AUDIENCE_OPTIONS,
  badgeLabel,
  badgeOf,
  badgeVariant,
  refusalOf,
} from '../commerce-operation-format';
import { CommerceOperationsService } from '../commerce-operations.service';
import { CommercePresentationCard } from '../commerce-presentation-card/commerce-presentation-card';
import { CommerceScheduleCard } from '../commerce-schedule-card/commerce-schedule-card';
import { CommerceSelectionCard } from '../commerce-selection-card/commerce-selection-card';
import { formatInstant } from '../operation-schedule';

type LoadState = 'loading' | 'error' | 'ready';

/** Un geste de section qui n'a pas sa carte : clientèle, visibilité, archivage. */
type Gesture = 'audience' | 'visibility' | 'archive';

/**
 * **Une opération, écrite au commerce** — `/operations/:key`
 * (`plan-l-operation-passe-au-commerce.md`, lot 3 bis).
 *
 * Une carte par sujet, un `PUT` par carte, puis la page relit : l'état, ce
 * que verra le client et les avertissements sont toujours ceux du serveur.
 *
 * Les cartes se lisent sans s'écrire quand l'opération est archivée, quand
 * c'est une copie de l'ancien référentiel jamais reprise (409
 * `operations.awaiting_migration`), ou sans `lfc_operations:write`. Les
 * refus du serveur s'affichent tels quels : ils nomment le cas.
 */
@Component({
  selector: 'app-commerce-operation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommercePresentationCard,
    CommerceScheduleCard,
    CommerceSelectionCard,
    FoldBackLinkComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDangerZoneComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './commerce-operation-page.html',
  styleUrl: './commerce-operation-page.scss',
})
export class CommerceOperationPage {
  private readonly api = inject(CommerceOperationsService);
  private readonly permissions = inject(PermissionsStore);
  private readonly notify = inject(NotifyService);

  readonly key = input.required<string>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly operation = signal<CommerceOperationView | null>(null);
  protected readonly failure = signal('');

  protected readonly audiences = AUDIENCE_OPTIONS;
  protected readonly audience = signal<CommerceOperationAudience>('both');
  protected readonly busy = signal<Gesture | null>(null);
  protected readonly refusals = signal<Readonly<Record<Gesture, string | null>>>({
    audience: null,
    visibility: null,
    archive: null,
  });

  protected readonly canWrite = computed(() => this.permissions.can('lfc_operations:write'));
  protected readonly archived = computed(() => (this.operation()?.archivedAt ?? null) !== null);
  protected readonly locked = computed(() => {
    const operation = this.operation();
    return (
      operation === null ||
      operation.archivedAt !== null ||
      !operation.heldAtCommerce ||
      !this.canWrite()
    );
  });

  protected readonly badge = computed(() => {
    const operation = this.operation();
    return operation === null ? null : badgeOf(operation);
  });
  protected readonly badgeLabel = badgeLabel;
  protected readonly badgeVariant = badgeVariant;
  protected readonly instant = formatInstant;

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
      this.failure.set(refusalOf(error, "L'opération n'a pas pu être lue."));
      this.state.set('error');
    }
  }

  /** Après une écriture : on annonce, puis on relit — sans repasser par le chargement. */
  protected async saved(message: string): Promise<void> {
    this.notify.success(message);
    try {
      this.show(await this.api.get(this.key()));
    } catch (error) {
      this.notify.error(error, "L'opération n'a pas pu être relue. Rechargez la page.");
    }
  }

  protected refusal(gesture: Gesture): string | null {
    return this.refusals()[gesture];
  }

  protected saveAudience(): Promise<void> {
    return this.run(
      'audience',
      'Clientèle enregistrée.',
      "La clientèle n'a pas pu être enregistrée.",
      (key) => this.api.setAudience(key, this.audience()),
    );
  }

  /** Masquer ou afficher : réversible, et distinct de l'archivage. */
  protected toggleVisibility(hidden: boolean): Promise<void> {
    return this.run(
      'visibility',
      hidden ? 'Opération masquée.' : 'Opération affichée.',
      "La visibilité n'a pas pu être changée.",
      (key) => this.api.setVisibility(key, hidden),
    );
  }

  protected archive(): Promise<void> {
    return this.run(
      'archive',
      'Opération archivée.',
      "L'opération n'a pas pu être archivée.",
      (key) => this.api.archive(key),
    );
  }

  private async run(
    gesture: Gesture,
    success: string,
    fallback: string,
    write: (key: string) => Promise<unknown>,
  ): Promise<void> {
    if (this.locked()) {
      return;
    }
    this.busy.set(gesture);
    this.refusals.update((all) => ({ ...all, [gesture]: null }));
    try {
      await write(this.key());
      await this.saved(success);
    } catch (error) {
      this.refusals.update((all) => ({ ...all, [gesture]: refusalOf(error, fallback) }));
    } finally {
      this.busy.set(null);
    }
  }

  private show(operation: CommerceOperationView): void {
    this.operation.set(operation);
    this.audience.set(operation.audience);
  }
}
