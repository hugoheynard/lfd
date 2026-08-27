import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldIdService,
  FoldInputComponent,
} from 'fold-ng';

import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import { EventCard } from '../../../client/event-card/event-card';
import { DoorCard } from '../door-card/door-card';
import { RuleOu } from '../rule-ou/rule-ou';

/**
 * L'accueil visiteur : trois champs, aucun document, et deux portes — la
 * connexion pour qui a déjà un compte, le rappel pour qui vient de la part
 * d'une entreprise.
 *
 * Chaque champ a une raison énonçable à voix haute, et le téléphone la dit
 * sous lui. Pas de mot de passe, pas de KBIS : le compte s'ouvre **incomplet**,
 * ce qui n'est pas la même chose qu'inactif.
 *
 * En pile, les champs sont **repliés** : on voit d'abord la promesse et deux
 * portes — s'inscrire, ou se connecter — sans rien faire défiler. Trois champs
 * dépliés d'entrée auraient poussé « Déjà client ? » sous la ligne de flottaison,
 * et un client qui a déjà un compte n'a rien à faire dans un formulaire.
 *
 * Le pli n'existe qu'en pile : au-delà, la colonne a la place, et la réf montre
 * le formulaire ouvert. C'est donc le CSS qui décide, pas un `matchMedia` —
 * l'état plié vit dans le DOM des deux côtés, seule sa mise en page change, et
 * le rendu serveur ne peut pas se tromper de largeur.
 */
@Component({
  selector: 'app-welcome-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldInputComponent,
    DoorCard,
    EventCard,
    RuleOu,
  ],
  templateUrl: './welcome-step.html',
  styleUrl: './welcome-step.scss',
})
export class WelcomeStep {
  /** Le créneau de rappel déjà obtenu, s'il y en a un. */
  readonly bookedSlot = input<string | null>(null);

  /** La demande de devis traiteur a été faite, mais son écran n'existe pas. */
  readonly quotePending = input(false);

  /** Le numéro sur lequel le fournil rappellera. */
  readonly phone = input.required<string>();

  readonly signedUp = output<void>();
  readonly wantsLogin = output<void>();
  readonly wantsCallback = output<void>();
  readonly wantsQuote = output<void>();
  readonly cancelledCallback = output<void>();

  /** Le formulaire est ouvert — vrai dès qu'on a demandé à s'inscrire. */
  protected readonly t = inject(ClientCopyService).t;

  protected readonly expanded = signal(false);

  /** `aria-controls` a besoin d'un identifiant, et le rendu serveur d'un stable. */
  protected readonly fieldsId = inject(FoldIdService).next('signup-fields');

  private readonly fields = viewChild<ElementRef<HTMLElement>>('fields');

  protected readonly firstName = signal('');
  protected readonly email = signal('');
  protected readonly tel = signal('');

  protected readonly complete = computed(
    () =>
      this.firstName().trim() !== '' &&
      /.+@.+\..+/.test(this.email().trim()) &&
      this.tel().trim() !== '',
  );

  protected readonly proTitle = computed(() =>
    this.bookedSlot() ? this.t().pro.bookedTitle : this.t().pro.title,
  );

  protected readonly bookedLine = computed(() =>
    fill(this.t().pro.booked, { slot: this.bookedSlot() ?? '' }),
  );

  /** Déplie, et pose le curseur dans le premier champ — sinon il faut viser. */
  protected expand(): void {
    this.expanded.set(true);
    queueMicrotask(() => this.fields()?.nativeElement.querySelector('input')?.focus());
  }

  protected submit(): void {
    if (this.complete()) {
      this.signedUp.emit();
    }
  }
}
