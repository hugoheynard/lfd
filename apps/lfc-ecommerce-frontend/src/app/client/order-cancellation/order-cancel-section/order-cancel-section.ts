import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  output,
  signal,
} from '@angular/core';
import type { OrderCancellability } from '@lfd/contracts/shop-values';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { fill } from '../../copy/client-copy.service';
import { orderCancelCopy } from '../../copy/screens/order-cancel.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { ContactDialog } from '../../shop/contact-dialog/contact-dialog';
import { CancelOrderDialog } from '../cancel-order-dialog/cancel-order-dialog';
import { refusalSentence, untilLabel } from '../cancellation-wording';
import { OrderCancellationGateway } from '../order-cancellation.gateway';

type SectionState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly cancellability: OrderCancellability }
  | { readonly kind: 'done' };

/**
 * Les refus qui se TAISENT dans le tiroir : l'état de la commande les dit déjà
 * (annulée, retirée), ou le bouton disparaît sans phrase (`not_allowed`,
 * contrat). Les autres disent pourquoi, et proposent la boutique.
 */
const SILENT = new Set<string>(['already_cancelled', 'fulfilled', 'not_allowed']);

/**
 * **L'annulation dans le tiroir d'une commande** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C6.8).
 *
 * Il relit `GET /orders/:id` à l'ouverture du tiroir : la liste ne porte pas
 * `cancellability`, et ce n'est qu'une indication — le `POST` relit tout sous
 * verrou. Annulable : le bouton, et l'échéance. Refusée : la phrase du code et
 * « Contacter la boutique ». Après succès : le bandeau, et l'hôte relit
 * l'historique (ce qui retire le QR du suivi).
 */
@Component({
  selector: 'app-order-cancel-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldLoadingStateComponent],
  templateUrl: './order-cancel-section.html',
  styleUrl: './order-cancel-section.scss',
})
export class OrderCancelSection implements OnInit {
  readonly orderId = input.required<string>();
  readonly reference = input.required<string>();

  /**
   * La commande vient d'être annulée. L'hôte relit la liste — le tiroir ne la
   * possède pas, et c'est elle qui retire le QR du suivi.
   */
  readonly cancelled = output<void>();

  private readonly gateway = inject(OrderCancellationGateway);
  private readonly panels = inject(FoldPanelHostService);
  private readonly locale = inject(ClientLocale).current;

  protected readonly c = screenCopy('orderCancel', orderCancelCopy);
  protected readonly state = signal<SectionState>({ kind: 'loading' });

  /** L'échéance d'une commande annulable, dite ; `null` sans délai (pro). */
  protected readonly until = computed(() => {
    const state = this.state();
    if (state.kind !== 'ready' || !state.cancellability.cancellable) {
      return null;
    }
    const until = state.cancellability.until;
    return until === null
      ? null
      : fill(this.c().until, { when: untilLabel(until, this.locale(), this.c()) });
  });

  /**
   * Pourquoi elle ne s'annule pas — `null` quand il n'y a rien à dire. Pour
   * « trop tard », la ligne discrète « c'était possible jusqu'au… ».
   */
  protected readonly refusal = computed(() => {
    const state = this.state();
    if (state.kind !== 'ready' || state.cancellability.cancellable) {
      return null;
    }
    const { code, until } = state.cancellability;
    if (SILENT.has(code)) {
      return null;
    }
    if (code === 'too_late' && until !== null) {
      return fill(this.c().untilPassed, { when: untilLabel(until, this.locale(), this.c()) });
    }
    return refusalSentence(code, until, this.locale(), this.c());
  });

  protected readonly cancellable = computed(() => {
    const state = this.state();
    return state.kind === 'ready' && state.cancellability.cancellable;
  });

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set({ kind: 'loading' });
    const cancellability = await this.gateway.cancellability(this.orderId());
    this.state.set(
      cancellability === null ? { kind: 'failed' } : { kind: 'ready', cancellability },
    );
  }

  protected open(): void {
    const state = this.state();
    if (state.kind !== 'ready' || !state.cancellability.cancellable) {
      return;
    }
    CancelOrderDialog.open(this.panels, {
      orderId: this.orderId(),
      reference: this.reference(),
      state: state.cancellability,
    }).closed.then((cancelled) => {
      if (cancelled === true) {
        this.state.set({ kind: 'done' });
        this.cancelled.emit();
      }
    });
  }

  protected contact(): void {
    ContactDialog.open(this.panels);
  }
}
