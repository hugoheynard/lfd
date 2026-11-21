import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ORDER_REVIEW_NOTE_MAX_LENGTH, type AdminOrderView } from '@lfd/contracts';
import { formatOrderInstant } from '@lfd/b2b-ui/order';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { GestureIntents } from '../../shared/gesture-intents';
import { AdminOrdersService } from '../orders.service';

/** La part de la fiche que lit la carte. */
export type ReviewSubject = Pick<AdminOrderView, 'id' | 'review'>;

const REVIEW_INTENT = 'review';
const WITHDRAW_INTENT = 'review-withdraw';

/**
 * **La vérification d'une commande** (plan du visa des commandes, V3) — un
 * commercial relit une commande qu'un client pro a passée seul, et la vise.
 *
 * Une trace, rien de plus : la carte ne bloque rien. Elle n'existe que si le
 * détail porte `review` ; ses gestes demandent `b2b_order_review:write`. Une
 * commande révisée depuis son visa le dit, et se vérifie à nouveau — le
 * serveur remplace alors l'ancien visa.
 */
@Component({
  selector: 'app-order-review-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './order-review-card.html',
  styleUrl: './order-review-card.scss',
})
export class OrderReviewCard {
  readonly order = input.required<ReviewSubject>();
  /** Un geste a abouti : au parent de relire la fiche. */
  readonly changed = output<void>();

  private readonly api = inject(AdminOrdersService);
  private readonly permissions = inject(PermissionsStore);
  private readonly intents = new GestureIntents();

  protected readonly noteMax = ORDER_REVIEW_NOTE_MAX_LENGTH;
  protected readonly review = computed(() => this.order().review ?? null);
  protected readonly current = computed(() => this.review()?.current ?? null);
  protected readonly canWrite = this.permissions.can('b2b_order_review:write');
  /** « Vérifier » : la commande s'y prête, et l'on en a le droit. */
  protected readonly canReview = computed(
    () => this.canWrite && (this.review()?.reviewable ?? false),
  );

  protected readonly note = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** « Vérifié par Prénom Nom le 21/11/2026 à 14:32 » ; sans nom si l'annuaire ne le connaît plus. */
  protected readonly stampLine = computed(() => {
    const current = this.current();
    if (current === null) {
      return null;
    }
    const by = current.reviewedByName === null ? '' : ` par ${current.reviewedByName}`;
    return `Vérifié${by} le ${formatOrderInstant(current.reviewedAt)}.`;
  });

  protected verify(): Promise<void> {
    const note = this.note().trim();
    return this.run(REVIEW_INTENT, async (key) => {
      await this.api.review(this.order().id, note === '' ? null : note, key);
      this.note.set('');
    });
  }

  protected withdraw(): Promise<void> {
    return this.run(WITHDRAW_INTENT, (key) => this.api.withdrawReview(this.order().id, key));
  }

  private async run(subject: string, send: (key: string) => Promise<void>): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await send(this.intents.keyFor(subject));
      this.intents.done(subject);
      this.changed.emit();
    } catch (error: unknown) {
      this.error.set(httpErrorMessage(error, 'Le geste n’a pas abouti. Réessayez.'));
    } finally {
      this.saving.set(false);
    }
  }
}
