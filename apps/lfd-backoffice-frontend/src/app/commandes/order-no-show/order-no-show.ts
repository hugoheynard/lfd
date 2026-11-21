import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { AdminOrderView, OrderStatus } from '@lfd/contracts';
import { formatOrderInstant, SectionTitle } from '@lfd/b2b-ui/order';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldInlineConfirmComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { CounterParticularsService } from '../../comptoir/counter-particulars.service';
import { GestureIntents } from '../../shared/gesture-intents';

/** Les statuts où la commande n'attend plus son client : remise, annulée, déjà non retirée. */
const CLOSED: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'fulfilled',
  'cancelled',
  'no_show',
]);

/** La part de la fiche que lisent les deux gestes. */
export type NoShowSubject = Pick<AdminOrderView, 'id' | 'status' | 'settlement' | 'noShow'>;

const DECLARE_INTENT = 'no-show';
const NOTICE_INTENT = 'no-show-notice';

/**
 * **Le client n'est pas venu** (`commande-particulier-reglee-en-boutique.md`, § 5 bis)
 * — sur la fiche d'une commande à régler en boutique, et sur elle seule.
 *
 * Deux gestes, deux droits : déclarer la commande non retirée relève de la
 * passation (`b2b_place_order:write`) ; « Prévenir le client » relève de la
 * supervision (`b2b_supervision:write`). Le serveur juge l'heure : un refus
 * « trop tôt » s'affiche tel qu'il le dit. L'e-mail se dit DEMANDÉ, jamais
 * envoyé ni reçu.
 */
@Component({
  selector: 'app-order-no-show',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SectionTitle,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldInlineConfirmComponent,
  ],
  templateUrl: './order-no-show.html',
  styleUrl: './order-no-show.scss',
})
export class OrderNoShow {
  /** Ce que le geste lit de la fiche — rien de plus. */
  readonly order = input.required<NoShowSubject>();
  /** Un geste a abouti : au parent de relire la fiche. */
  readonly changed = output<void>();

  private readonly api = inject(CounterParticularsService);
  private readonly permissions = inject(PermissionsStore);
  private readonly intents = new GestureIntents();

  protected readonly shopTill = computed(() => this.order().settlement === 'shop_till');
  protected readonly noShow = computed(() => this.order().noShow ?? null);
  /** « Le client n'est pas venu » : à régler en boutique, ni remise, ni annulée, sous le droit. */
  protected readonly canDeclare = computed(
    () =>
      this.shopTill() &&
      this.noShow() === null &&
      !CLOSED.has(this.order().status) &&
      this.permissions.can('b2b_place_order:write'),
  );
  protected readonly canNotify = computed(
    () =>
      this.noShow() !== null &&
      this.noShow()?.noticeRequest === null &&
      this.permissions.can('b2b_supervision:write'),
  );

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly declaredLine = computed(() => {
    const noShow = this.noShow();
    return noShow === null
      ? null
      : `Déclarée non retirée le ${formatOrderInstant(noShow.declaredAt)}${byName(noShow.declaredByName)}.`;
  });
  protected readonly noticeLine = computed(() => {
    const request = this.noShow()?.noticeRequest ?? null;
    return request === null
      ? null
      : `E-mail demandé le ${formatOrderInstant(request.requestedAt)}${byName(request.requestedByName)}.`;
  });

  protected declare(): Promise<void> {
    return this.run(DECLARE_INTENT, (key) => this.api.declareNoShow(this.order().id, key));
  }

  protected notify(): Promise<void> {
    return this.run(NOTICE_INTENT, (key) => this.api.requestNoShowNotice(this.order().id, key));
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

function byName(name: string | null): string {
  return name === null ? '' : ` par ${name}`;
}
