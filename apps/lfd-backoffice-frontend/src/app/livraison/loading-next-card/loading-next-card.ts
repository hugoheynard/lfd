import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldInputComponent,
} from 'fold-ng';

import { BinScanner } from '../bin-scanner/bin-scanner';
import { stopHue } from '../delivery-loading-floor';
import type { PlacementLine } from '../delivery-loading-placement';
import type { NextBin } from '../delivery-loading-rows';
import { nextBinBadge } from '../delivery-loading-tiles';

/**
 * **« À poser maintenant »** — la seule question du livreur : quel bac, où il
 * va, et le geste pour le charger. Le bac en grand (l'arrêt écrit dans sa
 * pastille, le code), la consigne en clair, puis le scan et, en repli, le
 * code tapé.
 *
 * Le composant ne charge rien : il rend ce qu'on a lu (`scanned`) ou tapé
 * (`submitted`) à l'écran qui le tient. Au dépôt, le champ est la douchette :
 * il garde le focus.
 */
@Component({
  selector: 'app-loading-next-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BinScanner,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldInputComponent,
  ],
  templateUrl: './loading-next-card.html',
  styleUrl: './loading-next-card.scss',
})
export class LoadingNextCard {
  /** Le bac à poser maintenant ; `null` : le plan n'est pas lisible, il ne reste que le scan. */
  readonly next = input<NextBin | null>(null);
  readonly placement = input<PlacementLine | null>(null);
  /** Le droit d'écrire, sur une tournée pas encore partie. */
  readonly canLoad = input(false);
  readonly busy = input(false);
  readonly size = input<'phone' | 'depot'>('phone');
  /** Le code tapé, tenu par l'écran : il le vide quand le chargement est accepté. */
  readonly code = model('');

  /** Le contenu brut d'un QR lu par la caméra. */
  readonly scanned = output<string>();
  /** Le code tapé, à charger. */
  readonly submitted = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly badge = computed(() => {
    const next = this.next();
    return next === null ? '' : nextBinBadge(next.bin);
  });

  protected readonly hue = computed(
    () => `hue-a-${String(stopHue(this.next()?.stopPosition ?? 1))}`,
  );

  constructor() {
    // Au dépôt, le champ EST la douchette : il reprend le focus après chaque geste.
    afterRenderEffect(() => {
      if (this.size() !== 'depot' || this.busy() || !this.canLoad()) {
        return;
      }
      this.next();
      this.host.nativeElement.querySelector<HTMLInputElement>('[data-typed-code] input')?.focus();
    });
  }

  /** Les majuscules d'un code court ; une adresse lue par la douchette reste telle quelle. */
  protected type(value: string): void {
    this.code.set(value.includes('/') ? value : value.toUpperCase());
  }

  protected submit(): void {
    if (this.code().trim() !== '') {
      this.submitted.emit(this.code());
    }
  }
}
