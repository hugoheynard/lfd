import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
} from '@angular/core';
import { FoldButtonIconComponent } from 'fold-ng';

/** Le sens d'un déplacement au clavier : une place vers le haut, ou vers le bas. */
export type ReorderStep = -1 | 1;

const STEP_BY_KEY: Readonly<Record<string, ReorderStep>> = { ArrowUp: -1, ArrowDown: 1 };

/**
 * **La poignée d'un élément réordonnable** de la page Postes — un poste, un
 * produit de la pile. La souris et le doigt la saisissent (le parent y pose
 * `cdkDragHandle` ou rend la carte entière glissable) ; le clavier la
 * focalise et la déplace d'une place par flèche haut / bas. Le focus suit
 * l'élément : après le rendu qui l'a déplacé, la poignée se refocalise, sans
 * quoi le nœud déplacé perdrait le focus et le clavier repartirait du haut.
 * Elle n'est jamais désactivée pendant un envoi, pour la même raison : un
 * bouton désactivé perd le focus. C'est le parent qui ignore un geste de trop.
 */
@Component({
  selector: 'app-reorder-handle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonIconComponent],
  templateUrl: './reorder-handle.html',
  styleUrl: './reorder-handle.scss',
})
export class ReorderHandle {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Le nom de ce qu'on déplace, lu dans le libellé de la poignée. */
  readonly itemName = input.required<string>();
  readonly step = output<ReorderStep>();

  protected label(): string {
    return `Déplacer « ${this.itemName()} » (flèches haut et bas)`;
  }

  protected keydown(event: KeyboardEvent): void {
    const step = STEP_BY_KEY[event.key];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    this.step.emit(step);
    afterNextRender(() => this.host.nativeElement.querySelector('button')?.focus(), {
      injector: this.injector,
    });
  }
}
