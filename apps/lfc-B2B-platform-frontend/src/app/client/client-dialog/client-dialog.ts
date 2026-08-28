import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
 *
 * Il porte aussi ses ÉTAPES. Un dialogue qui pose deux temps d'une même
 * question — où, puis quand — les fait glisser l'un vers l'autre plutôt que de
 * se fermer pour rouvrir ailleurs : on ne perd pas ce qu'on vient de choisir.
 */
@Component({
  selector: 'app-client-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  host: { '[attr.data-placement]': 'placement()' },
  templateUrl: './client-dialog.html',
  styleUrl: './client-dialog.scss',
})
export class ClientDialog {
  readonly open = input.required<boolean>();

  /**
   * D'où la surface arrive.
   *
   * `centre` est la DÉCISION qui interrompt — celle qu'on prend avant de
   * continuer. `sheet` est la feuille MONTANTE : elle en dit plus sur ce qu'on
   * regarde déjà, sans prétendre changer de sujet. La réf leur donne deux
   * entrées différentes, et c'est cette différence-là qui les distingue.
   *
   * `side` est la même feuille montante sur un téléphone, et un TIROIR DROIT
   * au-delà du pli : la fiche d'une personne se lit à côté de la liste dont elle
   * sort, pas par-dessus. Un seul placement pour les deux formes, et donc un
   * seul état d'ouverture — c'est ce que le dossier de design demande
   * expressément, deux surfaces jumelles ayant chacune leur drapeau étant la
   * façon connue de les voir se désynchroniser.
   */
  readonly placement = input<'centre' | 'sheet' | 'side'>('centre');

  /** Le sur-titre : de quel chemin ce dialogue est l'étape. */
  readonly kicker = input.required<string>();

  readonly title = input.required<string>();

  /** L'étape montrée, en partant de zéro. Le reste attend sur le côté. */
  readonly step = input(0);

  /** Le retour n'existe que là où on est venu de quelque part. */
  readonly canBack = input(false);

  readonly closed = output<void>();
  readonly back = output<void>();

  protected readonly t = inject(ClientCopyService).t;

  /**
   * Le décalage du rail. Calculé ici plutôt que passé en propriété
   * personnalisée au CSS : une valeur écrite en clair se lit dans l'inspecteur
   * telle qu'elle sera interpolée, sans indirection à dérouler quand une
   * transition se comporte mal.
   */
  protected readonly shift = computed(() => `translateX(${this.step() * -100}%)`);

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
