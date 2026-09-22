import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent, FoldInputComponent } from 'fold-ng';

import type { UserProfileDraft } from '../../../account/account.model';
import { AccountService } from '../../../account/account.service';
import { ClientCopyService } from '../../copy/client-copy.service';

type ProfileField = keyof UserProfileDraft;

const EMPTY: UserProfileDraft = { firstName: '', lastName: '', email: '', phone: '' };

/**
 * **Identité** — la première section de `/mon-profil` : la personne connectée,
 * pas la société. Tout membre la modifie, `PATCH /me/profile` ne lisant
 * l'identité que du jeton.
 *
 * ## C'est un BROUILLON, et la section entière le dit
 *
 * Elle vient du dialogue `ProfilePanel`, dont elle garde la mécanique et perd la
 * coquille (plan `plan-page-mon-profil.md` §1). Ce qu'on tape ne part que sur
 * « Enregistrer », et le bouton ne s'allume qu'une fois quelque chose modifié —
 * c'est ce qui la distingue, à l'œil, des méthodes de connexion juste dessous,
 * où chaque geste agit tout de suite. Sur une page, les deux comportements
 * cohabitent sans qu'un « Annuler » commun laisse croire qu'il défait un
 * rattachement (§0).
 *
 * ## L'adresse n'est PAS ici (Hugo, 2026-09-22)
 *
 * Elle est l'identifiant de connexion : le serveur la propage à Auth0 — qui
 * authentifie avec elle — avant de l'écrire chez nous, en adresse **non
 * vérifiée** avec un e-mail de vérification (vérifié le 2026-09-14,
 * `update-my-profile.handler.ts`, `auth0-identity.gateway.ts`). Un prénom se
 * corrige, cette adresse-là se **change** : la ranger entre le nom et le
 * téléphone la faisait passer pour une coordonnée. Elle vit désormais sur la
 * ligne « E-mail » des méthodes de connexion, avec l'avertissement qui
 * l'accompagne (`EmailDialog`).
 *
 * Elle reste dans le brouillon **sans être modifiable** : `PATCH /me/profile`
 * remplace les quatre champs, donc la section renvoie l'adresse relue telle
 * quelle. La montrer une seconde fois ici en ferait deux vérités à tenir
 * d'accord — c'est déjà ce qui a fait supprimer le dialogue du profil.
 *
 * Prénom et nom sont exigés par le domaine (`PersonName.create`) ; le téléphone
 * est facultatif (`PhoneNumber.create` lit le vide comme « non renseigné »).
 */
@Component({
  selector: 'app-identity-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldInputComponent],
  templateUrl: './identity-section.html',
  styleUrl: './identity-section.scss',
})
export class IdentitySection {
  /** Le profil relu du serveur — l'état auquel le brouillon se compare. */
  readonly data = input.required<UserProfileDraft>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly account = inject(AccountService);

  protected readonly draft = signal<UserProfileDraft>(EMPTY);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly changed = computed(() => {
    const draft = this.draft();
    const data = this.data();
    return (['firstName', 'lastName', 'phone'] as const).some(
      (key) => draft[key].trim() !== data[key].trim(),
    );
  });

  protected readonly canSave = computed(() => {
    const draft = this.draft();
    const filled = [draft.firstName, draft.lastName].every((v) => v.trim() !== '');
    return !this.saving() && this.changed() && filled;
  });

  constructor() {
    // Le serveur relu (succès d'écriture compris) redevient l'état de départ :
    // le brouillon s'y recale, et « Enregistrer » se rendort de lui-même.
    effect(() => {
      const data = this.data();
      untracked(() => this.draft.set({ ...data }));
    });
  }

  protected set(key: ProfileField, value: string): void {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    const draft = this.draft();
    this.saving.set(true);
    this.refusal.set(null);
    const refusal = await this.account.saveMyProfile({
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      // L'adresse relue, INCHANGÉE : elle se change sur sa méthode de connexion.
      email: this.data().email,
      phone: draft.phone.trim(),
    });
    this.saving.set(false);
    this.refusal.set(refusal);
  }
}
