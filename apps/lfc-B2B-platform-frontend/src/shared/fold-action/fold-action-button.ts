import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FoldButtonComponent,
  type FoldButtonEmphasis,
  type FoldButtonIntent,
  type FoldButtonSize,
} from 'fold-ng';

import type { FoldAction } from './fold-action.model';

/**
 * Renders one {@link FoldAction} as the right fold button: a `routerLink`
 * anchor, an `href` anchor, or a plain button that emits `activate`. The single
 * place the link-vs-button branch lives, so every fold-* component that shows
 * actions (banner carousel, product card, …) stays consistent.
 */
@Component({
  selector: 'fold-action-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoldButtonComponent],
  templateUrl: './fold-action-button.html',
  styleUrl: './fold-action-button.scss',
})
export class FoldActionButtonComponent {
  /** The action to render. */
  readonly action = input.required<FoldAction>();

  /** Button emphasis (fold). */
  readonly emphasis = input<FoldButtonEmphasis>('solid');
  /** Button intent (fold). */
  readonly intent = input<FoldButtonIntent>('primary');
  /** Button size (fold). */
  readonly size = input<FoldButtonSize>('md');
  /** Tab order — set to -1 to keep the control out of the tab ring (e.g. a hidden slide). */
  readonly buttonTabIndex = input(0);

  /** Fired when the action is activated (click / enter). */
  readonly activate = output<FoldAction>();

  protected onClick(): void {
    this.activate.emit(this.action());
  }
}
