import { computed, Injectable, signal } from '@angular/core';

import type { UserProfile } from '../account/account.model';

/**
 * Qui est le client, pour les écrans qui le NOMMENT.
 *
 * Le profil vient de chez nous (`GET /me`) : Auth0 authentifie, le backend
 * provisionne l'utilisateur au vol, et c'est notre base qui porte prénom, nom et
 * téléphone. Cette classe ne va PAS le chercher elle-même — c'est
 * {@link ClientOnboarding} qui l'y verse, depuis le shell.
 *
 * Ce détour n'est pas une politesse d'architecture : lire le compte demande
 * `HttpClient` et Auth0, et un écran qui dit « Bonjour Pierre » n'a aucune
 * raison de les traîner. Ici il lit trois signaux, et rien d'autre.
 *
 * 🔴 **Il n'y a plus de repli de maquette.** « Pierre », son téléphone et son
 * e-mail répondaient tant que personne n'était reconnu — pour que la démo reste
 * jouable déconnecté.
 *
 * La règle qui les condamnait était déjà écrite ici, elle ne s'appliquait qu'à
 * moitié : afficher le nom de quelqu'un d'autre n'est pas un repli. Ça l'est
 * autant pour un visiteur anonyme que pour une personne connectée dont le profil
 * n'est pas arrivé — dans les deux cas, l'écran salue **sans nommer**, et c'est
 * la seule chose vraie qu'il puisse faire.
 *
 * **`null` partout** dès que le champ n'est pas connu — prénom, téléphone,
 * e-mail. Un seul mot pour « on ne sait pas », et les gabarits qui portaient
 * déjà un repli continuent de le porter. Le nom de famille fait exception : il
 * complète le prénom plutôt qu'il ne se lit seul, d'où la chaîne vide.
 */
@Injectable({ providedIn: 'root' })
export class ClientIdentity {
  private readonly known = signal<UserProfile | null>(null);

  /** `null` tant que le prénom n'est pas connu : l'écran salue sans nommer. */
  readonly firstName = computed(() => blank(this.known()?.firstName));

  readonly lastName = computed(() => blank(this.known()?.lastName) ?? '');

  /** Le nom complet, sans espace en trop quand le nom de famille manque. */
  readonly fullName = computed(() => `${this.firstName() ?? ''} ${this.lastName()}`.trim());

  readonly phone = computed(() => blank(this.known()?.phone));

  readonly email = computed(() => blank(this.known()?.email));

  /** Le compte relu : le shell l'y verse dès que `GET /me` a répondu. */
  apply(profile: UserProfile | null): void {
    this.known.set(profile);
  }
}

/**
 * Un champ vide n'est pas une réponse.
 *
 * Le compte naît avec un nom et un téléphone VIDES — le backend provisionne
 * avant que `/bienvenue` n'ait reposé quoi que ce soit. Sans cette garde,
 * l'écran dirait « Bonjour  » pendant ce battement.
 */
function blank(value: string | undefined): string | null {
  const text = value?.trim() ?? '';
  return text === '' ? null : text;
}
