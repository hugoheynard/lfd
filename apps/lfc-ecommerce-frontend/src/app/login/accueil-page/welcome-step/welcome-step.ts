import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { FoldButtonComponent, FoldCardComponent, FoldInputComponent } from 'fold-ng';

import type { PendingProfile } from '../../../auth/auth.facade';
import { ClientCopyService } from '../../../client/copy/client-copy.service';
import { DoorCard } from '../door-card/door-card';
import { RuleOu } from '../rule-ou/rule-ou';

/**
 * **La porte PARTICULIER** : trois champs, aucun document, et une carte qui
 * porte tout (handoff `handoff-inscription`, captures 03 et 04).
 *
 * Chaque champ a une raison énonçable à voix haute, et le téléphone la dit
 * sous lui. Pas de mot de passe, pas de KBIS : le compte s'ouvre **incomplet**,
 * ce qui n'est pas la même chose qu'inactif.
 *
 * ## Le pli des champs a disparu, et sa raison avec
 *
 * 🔴 Les trois champs étaient **repliés** en pile derrière un bouton
 * « S'inscrire ». La raison était écrite : dépliés d'entrée, ils poussaient
 * « Déjà client ? » sous la ligne de flottaison, et un client qui a déjà un
 * compte n'a rien à faire dans un formulaire.
 *
 * Cette raison n'existe plus. « Déjà client ? » a quitté le formulaire le
 * 2026-09-21 : il est en bas de la colonne d'encre au bureau, et en carte
 * bleue sous la carte en pile. Plus rien ne se trouve derrière les champs qu'il
 * faudrait atteindre sans les traverser — le pli ne protégeait donc plus que
 * lui-même, au prix d'un clic pour tout le monde. La réf, elle, montre le
 * formulaire ouvert.
 *
 * ⚠️ Le libellé du bouton qui dépliait n'est pas perdu : il est devenu
 * l'ACTION ({@link ClientCopy.signup.open}), et celui de l'action est devenu le
 * TITRE de la carte. Les deux disaient déjà ce qu'ils disent maintenant.
 */
@Component({
  selector: 'app-welcome-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCardComponent, FoldInputComponent, DoorCard, RuleOu],
  templateUrl: './welcome-step.html',
  styleUrl: './welcome-step.scss',
})
export class WelcomeStep {
  /** Les trois champs. Le composant les COLLECTE ; il ne les envoie nulle part. */
  readonly signedUp = output<PendingProfile>();

  /** L'e-mail déjà tapé, s'il y en a un : il préremplira l'écran d'Auth0. */
  readonly wantsLogin = output<string>();
  /** Entrer par un fournisseur — qu'on ait un compte ou non : le premier passage le crée. */
  readonly wantsGoogle = output<void>();
  readonly wantsFacebook = output<void>();
  /** L'autre porte, proposée au pied de la carte (handoff §1). */
  readonly wantsPro = output<void>();

  protected readonly t = inject(ClientCopyService).t;

  protected readonly firstName = signal('');
  protected readonly email = signal('');
  protected readonly tel = signal('');

  protected readonly complete = computed(
    () =>
      this.firstName().trim() !== '' &&
      /.+@.+\..+/.test(this.email().trim()) &&
      this.tel().trim() !== '',
  );

  protected submit(): void {
    if (this.complete()) {
      this.signedUp.emit({
        firstName: this.firstName().trim(),
        email: this.email().trim(),
        phone: this.tel().trim(),
      });
    }
  }
}
