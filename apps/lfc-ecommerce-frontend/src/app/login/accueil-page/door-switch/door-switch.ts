import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  viewChildren,
} from '@angular/core';

import { ClientCopyService } from '../../../client/copy/client-copy.service';

/** Les deux portes de l'inscription. */
export type SignupDoor = 'perso' | 'pro';

/** Dans l'ordre où le segmenté les rend — et où les flèches les parcourent. */
const DOORS: readonly SignupDoor[] = ['perso', 'pro'];

/**
 * **Le segmenté des deux portes** — particulier / professionnel, en tête de
 * l'inscription (handoff `handoff-inscription`, §1 : « un segmenté, pas deux
 * URLs »).
 *
 * 🔴 Deux portes et UNE page, parce que la personne qui arrive ne sait pas
 * toujours laquelle est la sienne. À deux adresses, celle qui se trompe doit
 * revenir en arrière et retrouver l'autre lien ; ici elle bascule d'un geste,
 * et ce qu'elle a déjà tapé dans les champs communs ne se perd pas.
 *
 * ⚠️ **Écrit à la main, et pas sur un contrôle fold — c'est une exception, donc
 * elle se justifie.** `fold-view-toggle` et `fold-choice-row` sont les deux
 * segmentés du catalogue, et ni `FoldViewToggleOption` ni l'option de
 * `fold-choice-row` ne porte de SECONDE LIGNE (vérifié le 2026-09-21). Or
 * c'est elle qui fait tout le travail : « Professionnel » tout seul se lit
 * aussi bien « je travaille » que « je commande pour un établissement ». Le
 * sous-titre tranche sur l'usage plutôt que sur le statut, et le perdre
 * reviendrait à garder le composant en perdant la raison du composant.
 *
 * Ce qui est repris de fold, en revanche, c'est le CLAVIER : `radiogroup`,
 * tabindex mobile, flèches et Début/Fin. Un segmenté qui ne se parcourt pas aux
 * flèches n'est pas un segmenté, c'est deux boutons.
 */
@Component({
  selector: 'app-door-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './door-switch.html',
  styleUrl: './door-switch.scss',
})
export class DoorSwitch {
  readonly door = input.required<SignupDoor>();

  readonly picked = output<SignupDoor>();

  protected readonly t = inject(ClientCopyService).t;

  protected readonly doors = DOORS;

  private readonly segments = viewChildren<ElementRef<HTMLButtonElement>>('segment');

  protected pick(door: SignupDoor): void {
    this.picked.emit(door);
  }

  /**
   * Les flèches DÉPLACENT le choix, elles ne font pas que promener le focus :
   * c'est ce que `radiogroup` promet, et un lecteur d'écran l'annonce ainsi.
   *
   * Le parcours boucle — la dernière ramène à la première. Avec deux portes, la
   * boucle rend les quatre flèches équivalentes, ce qui est exactement ce qu'on
   * veut : on bascule, on ne navigue pas.
   */
  protected onKey(event: KeyboardEvent): void {
    const index = DOORS.indexOf(this.door());
    const next = moveOf(event.key, index, DOORS.length);
    if (next === null) {
      return;
    }
    event.preventDefault();
    const door = DOORS[next];
    if (door !== undefined) {
      this.picked.emit(door);
      // Le focus suit le choix : sans cela il reste sur le segment quitté, et
      // la flèche suivante repartirait d'ailleurs que de ce qu'on voit coché.
      this.segments()[next]?.nativeElement.focus();
    }
  }
}

/** L'index visé par une touche, ou `null` si la touche ne nous regarde pas. */
function moveOf(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
