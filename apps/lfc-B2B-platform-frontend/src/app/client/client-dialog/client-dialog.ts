import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { ClientCopyService } from '../copy/client-copy.service';

/**
 * Un dialogue CENTRÉ — la décision qui interrompt, posée au milieu de l'écran.
 *
 * C'est un `<dialog>` natif et pas un panneau fold : fold ouvre par les bords
 * (`left`/`right`/`bottom`), et la réf demande le centre. Le natif donne au
 * passage ce qu'un `div` obligerait à réécrire — piège de focus, `Escape`,
 * inertie de la page derrière, et un `::backdrop` qui n'a pas besoin d'exister
 * dans le DOM.
 *
 * Le voile et l'entrée sont ceux de la réf : `scale(.96) → 1` en 260 ms, et
 * rien du tout pour qui a demandé moins d'animation.
 */
@Component({
  selector: 'app-client-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './client-dialog.html',
  styleUrl: './client-dialog.scss',
})
export class ClientDialog {
  readonly open = input.required<boolean>();

  /** Le sur-titre : de quel chemin ce dialogue est l'étape. */
  readonly kicker = input.required<string>();

  readonly title = input.required<string>();

  readonly closed = output<void>();

  protected readonly t = inject(ClientCopyService).t;

  private readonly host = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const el = this.host().nativeElement;
      // Le rendu serveur n'a pas de `showModal` : l'élément s'y écrit fermé, et
      // c'est le navigateur qui l'ouvrira.
      if (typeof el.showModal !== 'function') {
        return;
      }
      if (this.open()) {
        if (!el.open) {
          el.showModal();
        }
      } else if (el.open) {
        el.close();
      }
    });
  }

  /** Un clic SUR le dialogue mais hors du panneau, c'est un clic sur le voile. */
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.host().nativeElement) {
      this.closed.emit();
    }
  }
}
