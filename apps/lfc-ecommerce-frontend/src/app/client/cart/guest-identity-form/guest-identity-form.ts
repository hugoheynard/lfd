import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { FoldCalloutComponent, FoldInputComponent } from 'fold-ng';

import { ClientCopyService } from '../../copy/client-copy.service';
import { isRecord, readLocal, readString, writeLocal } from '../../local-store';

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
/**
 * Où la saisie se garde ENTRE deux visites (Hugo, 2026-10-11 : « j'ai quitté la
 * fenêtre et suis revenu et je dois tout retaper »). Dans le navigateur de
 * qui l'a tapée, et nulle part ailleurs : rien ne part au serveur avant la
 * commande.
 */
const DRAFT_KEY = 'guest.identity';

interface GuestDraft {
  readonly firstName: string;
  readonly email: string;
  readonly emailAgain: string;
  readonly phone: string;
}

/** Relu du navigateur : du texte, donc validé champ par champ. */
function parseDraft(raw: unknown): GuestDraft | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    firstName: readString(raw['firstName']) ?? '',
    email: readString(raw['email']) ?? '',
    emailAgain: readString(raw['emailAgain']) ?? '',
    phone: readString(raw['phone']) ?? '',
  };
}

/**
 * La fiche invité gardée, si elle est complète — ce que la confirmation
 * reprend pour proposer de créer un compte sans rien faire retaper.
 */
export function storedGuestIdentity(): GuestIdentity | null {
  const draft = readLocal(DRAFT_KEY, parseDraft);
  if (draft === null) {
    return null;
  }
  const identity = {
    firstName: draft.firstName.trim(),
    email: draft.email.trim(),
    phone: draft.phone.trim(),
  };
  return identity.firstName === '' || identity.email === '' || identity.phone === ''
    ? null
    : identity;
}

const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * **« Qui passe cette commande ? »** — la saisie d'un visiteur sans compte,
 * plan `documentation/commandes/passation/architecture-commande-sans-compte.md` (D9, point 1).
 *
 * 🔴 **DANS la carte du panier, ouverte d'office** (Hugo, 2026-10-11). Elle a
 * été un dialogue empilé sur le panier, derrière un bouton « Commander en tant
 * qu'invité » : deux gestes et un second panneau pour trois champs que tout
 * visiteur doit remplir de toute façon. Le panier la montre désormais à qui
 * n'est pas connecté, et son bouton de règlement envoie la commande.
 *
 * Elle ne commande rien elle-même : elle rend l'identité dès qu'elle est
 * complète, `null` sinon, et le panier décide.
 *
 * ## Pourquoi la confirmation de l'adresse est ICI
 *
 * C'est le seul geste qui **empêche** la faute de frappe au lieu d'essayer de
 * la rattraper — et le plan a établi qu'il n'y a quasiment pas de rattrapage :
 * pas de compte, donc pas de « mes commandes » ; le QR part dans le courriel,
 * qui part à l'adresse tapée. Une lettre de travers et la commande existe, elle
 * est payée, et personne ne peut plus la présenter au comptoir.
 *
 * Le second champ se compare **insensible à la casse et aux espaces**, comme
 * le serveur retrouve un invité (`normalizeEmail`) — sans quoi l'écran
 * refuserait une paire que le serveur tient pour identique.
 *
 * ⚠️ **Aucune identité n'est établie ici.** Rien n'atteste que l'adresse
 * appartient à qui la tape (contrat `shop-order.ts`, D2), et rien de ce qui est
 * saisi n'ouvre quoi que ce soit. Le formulaire ne regarde pas non plus si
 * l'adresse est déjà connue — une surface publique ne répond jamais « ce
 * compte existe » (D7).
 */
@Component({
  selector: 'app-guest-identity-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldInputComponent],
  templateUrl: './guest-identity-form.html',
  styleUrl: './guest-identity-form.scss',
})
export class GuestIdentityForm {
  protected readonly t = inject(ClientCopyService).t;

  /** L'identité complète à chaque frappe, ou `null` tant qu'elle ne l'est pas. */
  readonly identityChange = output<GuestIdentity | null>();

  private readonly draft = readLocal(DRAFT_KEY, parseDraft);

  protected readonly firstName = signal(this.draft?.firstName ?? '');
  protected readonly email = signal(this.draft?.email ?? '');
  protected readonly emailAgain = signal(this.draft?.emailAgain ?? '');
  protected readonly phone = signal(this.draft?.phone ?? '');

  /**
   * La confirmation a-t-elle été QUITTÉE depuis la dernière frappe ?
   *
   * 🔴 L'écart ne se dit qu'à ce moment-là (Hugo, 2026-10-11 : « ne devrait pas
   * apparaître tant qu'on est encore en train de taper dans le champ de
   * confirmation ») : pendant la frappe, les deux adresses diffèrent forcément
   * — on n'a pas fini. Retaper dans le champ le fait taire jusqu'à la sortie
   * suivante.
   */
  private readonly confirmLeft = signal(false);

  private readonly emailsMatch = computed(
    () => normalize(this.email()) === normalize(this.emailAgain()),
  );

  protected readonly mismatch = computed(
    () => this.confirmLeft() && this.emailAgain().trim() !== '' && !this.emailsMatch(),
  );

  protected typeConfirmation(value: string): void {
    this.emailAgain.set(value);
    this.confirmLeft.set(false);
  }

  protected leaveConfirmation(touched: boolean): void {
    if (touched) {
      this.confirmLeft.set(true);
    }
  }

  private readonly identity = computed<GuestIdentity | null>(() =>
    this.firstName().trim() !== '' &&
    PLAUSIBLE_EMAIL.test(this.email().trim()) &&
    this.phone().trim() !== '' &&
    this.emailsMatch()
      ? {
          firstName: this.firstName().trim(),
          email: this.email().trim(),
          phone: this.phone().trim(),
        }
      : null,
  );

  constructor() {
    effect(() => {
      writeLocal(DRAFT_KEY, {
        firstName: this.firstName(),
        email: this.email(),
        emailAgain: this.emailAgain(),
        phone: this.phone(),
      } satisfies GuestDraft);
    });
    effect(() => {
      this.identityChange.emit(this.identity());
    });
  }
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}
