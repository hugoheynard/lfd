import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { ClientCopyService } from '../../copy/client-copy.service';
import { dialogSide } from '../../panel-side';

/** Ce que le visiteur déclare — exactement les trois champs de `guestBuyerSchema`. */
export interface GuestIdentity {
  readonly firstName: string;
  readonly email: string;
  readonly phone: string;
}

/**
 * Une adresse *plausible*, et rien de plus.
 *
 * 🔴 **Ce n'est pas une validation, c'est un garde-fou de frappe.** L'autorité
 * est `guestBuyerSchema` au contrat, puis `EmailAddress` au domaine ; refuser
 * ici sur une règle plus stricte ferait diverger l'écran du serveur, et c'est
 * l'écran qui aurait tort. On n'attrape donc que ce qu'un humain voit
 * immédiatement : pas d'arobase, ou rien après le point.
 */
const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * **« Qui passe cette commande ? »** — la saisie d'un visiteur sans compte,
 * plan `documentation/order/plan-commande-sans-compte.md` (D9, point 1).
 *
 * Saisie ⇒ dialogue centré au bureau, feuille du bas en pile ({@link dialogSide},
 * règle « Saisir » du `CLAUDE.md` de l'app). `md` : trois champs l'un sous
 * l'autre.
 *
 * ## Pourquoi la confirmation de l'adresse est DANS ce dialogue
 *
 * C'est le seul geste qui **empêche** la faute de frappe au lieu d'essayer de
 * la rattraper — et le plan a établi qu'il n'y a quasiment pas de rattrapage :
 * pas de compte, donc pas de « mes commandes » ; le QR part dans le courriel,
 * qui part à l'adresse tapée. Une lettre de travers et la commande existe, elle
 * est payée, et personne ne peut plus la présenter au comptoir.
 *
 * Le second champ n'est donc pas de la cérémonie : c'est la seule barrière
 * avant un envoi irréversible. Il se compare **insensible à la casse et aux
 * espaces**, comme le serveur retrouve un invité (`normalizeEmail`) — sans quoi
 * l'écran refuserait une paire que le serveur tient pour identique.
 *
 * ## Ce que ce dialogue n'est pas
 *
 * ⚠️ **Aucune identité n'est établie ici.** Rien n'atteste que l'adresse
 * appartient à qui la tape (contrat `shop-order.ts`, D2), et rien de ce qui est
 * saisi n'ouvre quoi que ce soit : cette personne n'aura pas d'identité de
 * connexion. Le dialogue ne regarde pas non plus si l'adresse est déjà connue —
 * une surface publique ne répond jamais « ce compte existe » (D7).
 */
@Component({
  selector: 'app-guest-identity-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './guest-identity-dialog.html',
})
export class GuestIdentityDialog {
  /** Opaque : un formulaire doit rester lisible, pas laisser transparaître la page. */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  /**
   * Ouvre la saisie. Rend l'identité déclarée, ou `undefined` si l'on ferme sans
   * la donner — repartir n'est pas commander, et l'appelant doit pouvoir faire
   * la différence.
   */
  static open(panels: FoldPanelHostService): FoldPanelRef<GuestIdentity | undefined> {
    // UN SEUL paramètre de type, et c'est le résultat : fold a deux surcharges
    // d'`open`, et celle à deux paramètres exige un composant portant une entrée
    // `data`. Ce dialogue n'en a pas — il ne reçoit rien, il ne fait que rendre.
    return panels.open<GuestIdentity | undefined>(GuestIdentityDialog, {
      side: dialogSide(),
    });
  }

  protected readonly t = inject(ClientCopyService).t;
  private readonly ref = inject(FoldPanelRef);

  protected readonly firstName = signal('');
  protected readonly email = signal('');
  protected readonly emailAgain = signal('');
  protected readonly phone = signal('');

  /** Vrai dès que le second champ porte quelque chose : on ne gronde pas un champ vide. */
  private readonly confirmTouched = computed(() => this.emailAgain().trim() !== '');

  /** Les deux adresses disent-elles la même chose, au sens du serveur ? */
  private readonly emailsMatch = computed(
    () => normalize(this.email()) === normalize(this.emailAgain()),
  );

  /**
   * L'écart s'annonce **pendant** la frappe, jamais au clic : découvrir au
   * moment de valider que la ligne du dessus était fausse oblige à relire deux
   * champs pour trouver lequel.
   */
  protected readonly mismatch = computed(() => this.confirmTouched() && !this.emailsMatch());

  /**
   * Ce qui manque pour commander. Les trois champs sont **requis** — le
   * téléphone aussi, depuis D9 : c'est le seul second canal quand l'adresse est
   * fausse, et au comptoir une commande publique s'affiche par son prénom seul.
   */
  protected readonly canConfirm = computed(
    () =>
      this.firstName().trim() !== '' &&
      PLAUSIBLE_EMAIL.test(this.email().trim()) &&
      this.phone().trim() !== '' &&
      this.emailsMatch(),
  );

  protected confirm(): void {
    if (!this.canConfirm()) {
      return;
    }
    this.ref.close({
      firstName: this.firstName().trim(),
      email: this.email().trim(),
      phone: this.phone().trim(),
    });
  }

  protected cancel(): void {
    this.ref.close(undefined);
  }
}

/** La même normalisation que le serveur applique pour retrouver un invité. */
function normalize(email: string): string {
  return email.trim().toLowerCase();
}
