import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { AdminOrderShortfall } from '@lfd/contracts';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';
import { FoldButtonComponent, FoldCalloutComponent, FoldTextareaComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminOrdersService } from '../orders.service';

/** La borne du texte — celle que le domaine refuse au-delà (`ShortfallLetter`). */
export const SHORTFALL_LETTER_MAX_LENGTH = 4000;

/**
 * Le refus dont le message serveur ne dit rien : `AppErrorFilter` masque celui
 * d'une `TechnicalError` — l'écran dit donc la phrase d'après le code.
 */
const NOT_SENT = 'orders.shortfall_letter.not_sent';
const NOT_SENT_SENTENCE =
  "Le courriel n'est pas parti, et rien n'a été tracé. Réessayez dans un instant.";

/**
 * **« Écrire au client »** après un départ incomplet (lot E6d,
 * plan E6d (`documentation/commandes/bon-de-livraison.md`)), sous la décision.
 *
 * Jamais automatique : le décideur ouvre la proposition, la relit, la corrige,
 * puis envoie — ou ferme sans rien envoyer. C'est le texte relu qui part. Une
 * fois par décision : ensuite, la fiche dit « Client prévenu le … par … ».
 * Le geste est absent sans `b2b_orders_shortfall:write` ; la trace, elle, se
 * lit par tous.
 */
@Component({
  selector: 'app-order-shortfall-letter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FoldButtonComponent, FoldCalloutComponent, FoldTextareaComponent],
  templateUrl: './order-shortfall-letter.html',
  styleUrl: './order-shortfall-letter.scss',
})
export class OrderShortfallLetter {
  readonly orderId = input.required<string>();
  readonly shortfall = input.required<AdminOrderShortfall | null>();

  /** Le courriel est parti : au parent de relire le détail. */
  readonly sent = output<void>();

  private readonly api = inject(AdminOrdersService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly allowed = computed(() => this.permissions.can('b2b_orders_shortfall:write'));
  protected readonly decision = computed(() => this.shortfall()?.decision ?? null);
  protected readonly maxLength = SHORTFALL_LETTER_MAX_LENGTH;
  /** `null` : fermé ; une chaîne : le texte en cours de relecture. */
  protected readonly draft = signal<string | null>(null);
  protected readonly opening = signal(false);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly blank = computed(() => (this.draft() ?? '').trim() === '');
  protected readonly tooLong = computed(
    () => (this.draft() ?? '').trim().length > SHORTFALL_LETTER_MAX_LENGTH,
  );

  protected async open(): Promise<void> {
    this.opening.set(true);
    this.error.set(null);
    try {
      this.draft.set((await this.api.shortfallLetterDraft(this.orderId())).message);
    } catch (caught) {
      this.error.set(
        httpErrorMessage(caught, "La proposition n'a pas pu être rédigée. Réessayez."),
      );
    } finally {
      this.opening.set(false);
    }
  }

  protected close(): void {
    this.draft.set(null);
    this.error.set(null);
  }

  protected async send(): Promise<void> {
    const message = this.draft();
    if (message === null || this.blank() || this.tooLong()) {
      return;
    }
    this.sending.set(true);
    this.error.set(null);
    try {
      await this.api.writeShortfallLetter(this.orderId(), { message });
      this.draft.set(null);
      this.sent.emit();
    } catch (caught) {
      this.error.set(
        httpErrorCode(caught) === NOT_SENT
          ? NOT_SENT_SENTENCE
          : httpErrorMessage(caught, "Le courriel n'est pas parti. Réessayez."),
      );
    } finally {
      this.sending.set(false);
    }
  }
}
