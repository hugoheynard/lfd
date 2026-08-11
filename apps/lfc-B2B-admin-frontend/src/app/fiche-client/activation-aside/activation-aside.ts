import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FoldButtonComponent, FoldCardComponent, FoldIconComponent } from 'fold-ng';

/**
 * Carte **activation du compte** du rail droit de la fiche staff.
 *
 * Pendant du rail « assistance commerciale » côté client : chaque camp a, au
 * même endroit, le geste qui fait avancer le dossier. Le client demande de
 * l'aide ; le commercial, lui, active.
 *
 * Ce bouton vivait au fil de la fiche, entre deux sections, et se perdait dès
 * que le dossier s'allongeait — or c'est **le** geste qui clôt l'affaire. Épinglé
 * à droite, il reste visible pendant qu'on complète les pièces, et il dit
 * pourquoi il refuse : un bouton grisé muet est une impasse.
 *
 * Composant de présentation — il ne décide rien. La fiche calcule ce qui bloque
 * (le même verdict que le serveur) ; ici on ne fait que le dire.
 */
@Component({
  selector: 'app-activation-aside',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldButtonComponent, FoldIconComponent],
  templateUrl: './activation-aside.html',
  styleUrl: './activation-aside.scss',
})
export class ActivationAside {
  /** Le compte attend-il son activation ? Sinon, il est déjà client. */
  readonly pending = input.required<boolean>();
  /** Le serveur accepterait-il d'activer maintenant ? */
  readonly canActivate = input.required<boolean>();
  /** Ce qui bloque, en une phrase ; vide quand rien ne bloque. */
  readonly blockedReason = input('');
  /** Combien de pièces restent à réunir — 0 quand le dossier est complet. */
  readonly remaining = input(0);

  readonly activate = output<void>();

  /** « 3 pièces manquantes » — le décompte fait plus pression qu'une liste. */
  protected readonly remainingLabel = computed(() => {
    const count = this.remaining();
    return count === 1 ? '1 pièce manquante' : `${count} pièces manquantes`;
  });
}
