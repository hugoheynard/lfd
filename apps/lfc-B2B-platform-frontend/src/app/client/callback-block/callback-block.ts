import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';

import { ClientCopyService, fill } from '../copy/client-copy.service';

/**
 * L'encart « on vous rappelle » — l'argument, le bouton, puis le rappel obtenu.
 *
 * Deux écrans le posent pour deux raisons différentes : l'accueil vend l'espace
 * pro, la commande rattrape un oubli. L'ARGUMENT change donc, et il arrive en
 * entrée ; ce qui ne change pas — la forme du rappel obtenu, l'annulation, le
 * numéro rappelé — vit ici, une seule fois.
 */
@Component({
  selector: 'app-callback-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './callback-block.html',
  styleUrl: './callback-block.scss',
})
export class CallbackBlock {
  /** Le titre tant qu'aucun rappel n'est demandé. */
  readonly title = input.required<string>();

  /** Pourquoi décrocher : la phrase qui précède le bouton. */
  readonly pitch = input.required<string>();

  /** Le libellé du bouton. */
  readonly cta = input.required<string>();

  /** Le numéro connu — celui qu'on rappellera. */
  /** Le numéro du compte. Vide quand on ne le connaît pas — le lien disparaît. */
  readonly phone = input.required<string>();

  /** Le créneau retenu, ou `null` tant que rien n'est demandé. */
  readonly bookedSlot = input<string | null>(null);

  /** Proposer AUSSI d'appeler soi-même, en action secondaire. */
  readonly showPhone = input(false);

  readonly wantsCallback = output<void>();
  readonly cancelled = output<void>();

  protected readonly t = inject(ClientCopyService).t;

  /** Une fois le rappel obtenu, le titre dit l'état plutôt que l'argument. */
  protected readonly heading = computed(() =>
    this.bookedSlot() ? this.t().pro.bookedTitle : this.title(),
  );

  protected readonly bookedLine = computed(() => {
    const slot = this.bookedSlot();
    return slot ? fill(this.t().pro.booked, { slot }) : '';
  });

  /** Le lien d'appel veut le numéro sans ses espaces de lecture. */
  protected readonly telHref = computed(() => `tel:${this.phone().replaceAll(' ', '')}`);
}
