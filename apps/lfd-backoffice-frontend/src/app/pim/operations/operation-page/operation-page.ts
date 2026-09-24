import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { OperationAudience, OperationView } from '@lfd/pim-contracts';
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

import { NotifyService } from '../../../notify.service';
import {
  AUDIENCE_OPTIONS,
  badgeLabel,
  badgeOf,
  badgeVariant,
  refusalOf,
} from '../operation-format';
import { OperationsService } from '../operations.service';
import { PresentationCard } from '../presentation-card/presentation-card';
import { ScheduleCard } from '../schedule-card/schedule-card';
import { SelectionCard } from '../selection-card/selection-card';

/**
 * **La page d'une opération** — `/pim/operations/:key`.
 *
 * Une page et non un panneau : quatre sujets (présentation, calendrier,
 * clientèle, sélection) dont on va droit à un seul, et une adresse que la
 * médiathèque cible déjà depuis le panneau des porteurs d'une image.
 *
 * Chaque carte écrit SON sujet (`PUT` par sujet), puis la page relit
 * l'opération : l'état et le cycle affichés sont toujours ceux du serveur.
 */
@Component({
  selector: 'app-operation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
    PresentationCard,
    ScheduleCard,
    SelectionCard,
  ],
  templateUrl: './operation-page.html',
  styleUrl: './operation-page.scss',
})
export class OperationPage {
  private readonly api = inject(OperationsService);
  private readonly notify = inject(NotifyService);

  /** La clé de la route (`withComponentInputBinding`). */
  readonly key = input.required<string>();

  protected readonly operation = signal<OperationView | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadFailure = signal<string | null>(null);

  protected readonly audiences = AUDIENCE_OPTIONS;
  protected readonly audience = signal<OperationAudience>('both');
  protected readonly audienceBusy = signal(false);
  protected readonly audienceRefusal = signal<string | null>(null);

  protected readonly archiveBusy = signal(false);
  protected readonly archiveRefusal = signal<string | null>(null);

  protected readonly locked = computed(() => (this.operation()?.archivedAt ?? null) !== null);
  protected readonly badge = computed(() => {
    const operation = this.operation();
    return operation === null ? null : badgeOf(operation);
  });
  protected readonly badgeLabel = badgeLabel;
  protected readonly badgeVariant = badgeVariant;

  constructor() {
    effect(() => {
      void this.load(this.key());
    });
  }

  protected async load(key: string): Promise<void> {
    this.loading.set(true);
    this.loadFailure.set(null);
    try {
      this.show(await this.api.get(key));
    } catch (error) {
      this.loadFailure.set(refusalOf(error, "L'opération n'a pas pu être lue."));
    } finally {
      this.loading.set(false);
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

  protected async saveAudience(): Promise<void> {
    this.audienceBusy.set(true);
    this.audienceRefusal.set(null);
    try {
      await this.api.setAudience(this.key(), this.audience());
      await this.saved('Clientèle enregistrée.');
    } catch (error) {
      this.audienceRefusal.set(refusalOf(error, "La clientèle n'a pas pu être enregistrée."));
    } finally {
      this.audienceBusy.set(false);
    }
  }

  protected async archive(): Promise<void> {
    this.archiveBusy.set(true);
    this.archiveRefusal.set(null);
    try {
      await this.api.archive(this.key());
      await this.saved('Opération archivée.');
    } catch (error) {
      this.archiveRefusal.set(refusalOf(error, "L'opération n'a pas pu être archivée."));
    } finally {
      this.archiveBusy.set(false);
    }
  }

  private show(operation: OperationView): void {
    this.operation.set(operation);
    this.audience.set(operation.audience);
  }
}
