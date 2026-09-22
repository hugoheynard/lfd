import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
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

import type { UserProfileDraft } from '../../../account/account.model';
import { AccountService } from '../../../account/account.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { dialogSide } from '../../panel-side';

/**
 * **Changer son adresse de connexion** — ouvert depuis la ligne « E-mail » des
 * méthodes de connexion de `/mon-profil` (Hugo, 2026-09-22).
 *
 * ## Pourquoi un dialogue, et pas un champ armé dans la section
 *
 * La section des méthodes de connexion AGIT tout de suite : on y ajoute et on y
 * retire, et chaque geste part au clic. Poser au milieu un champ qu'il faudrait
 * ensuite valider y aurait introduit un second temps que rien n'annonce — et
 * l'avertissement à côté du champ aurait été lu comme un état de la ligne, pas
 * comme la conséquence d'un geste qu'on n'a pas encore fait.
 *
 * Le dialogue, lui, est ce que le `CLAUDE.md` de l'app prescrit pour **toute
 * saisie ou édition** (règle « Saisir »), et il donne à ce changement ce qu'il
 * demande : l'avertissement AVANT, un « Enregistrer » qui ne s'arme que sur une
 * adresse réellement différente, et un refus du serveur qui reste sous les yeux
 * sans rien fermer. Centré au bureau, feuille du bas en pile ({@link dialogSide}).
 *
 * ## Une adresse de connexion n'est pas une coordonnée
 *
 * Elle vivait dans la section « Identité », entre le nom et le téléphone. Un
 * prénom se corrige ; cette adresse-là se **change**, et le geste part chez
 * Auth0 — qui authentifie avec elle — **avant** d'être écrit chez nous, en
 * adresse non vérifiée avec un e-mail de vérification (vérifié le 2026-09-14,
 * `update-my-profile.handler.ts`, `auth0-identity.gateway.ts`). C'est ce que
 * l'avertissement dit, et il se comprend enfin ici.
 *
 * ## Deux champs, et le second n'est pas une politesse
 *
 * « Nouvelle adresse » **et** « confirmer » (Hugo, 2026-09-22). Une adresse de
 * connexion mal tapée ne se rattrape pas : elle part chez Auth0, devient
 * l'identifiant, et le courriel de vérification s'en va chez personne. La
 * personne se retrouve dehors, sans moyen de revenir par elle-même — c'est le
 * seul champ de cet écran dont une faute de frappe ferme le compte.
 *
 * ⚠️ Les deux champs partent **vides**, et l'adresse actuelle est rappelée
 * au-dessus. Les pré-remplir obligerait à effacer avant d'écrire, et rendrait
 * la confirmation absurde — il suffirait de ne toucher à rien.
 *
 * La comparaison ignore la casse et les blancs, comme celle qui décide du
 * changement : « Hugo@LFD.fr » et « hugo@lfd.fr » sont la même boîte, et
 * refuser sur une majuscule ferait chercher une faute qui n'existe pas.
 *
 * ## L'écriture est la même, et elle porte tout le profil
 *
 * `PATCH /me/profile` remplace les quatre champs : le dialogue renvoie donc le
 * nom et le téléphone **inchangés**, tels que `/me` les a rendus à l'ouverture.
 */
@Component({
  selector: 'app-email-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './email-dialog.html',
  styleUrl: './email-dialog.scss',
})
export class EmailDialog {
  /** `sm` : deux champs et leur phrase — un dialogue plus large serait vide. */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'sm', surface: 'solid' };

  /** Ouvre le dialogue sur le profil relu — `stack` : rien dessous ici, mais la ligne reste. */
  static open(panels: FoldPanelHostService, profile: UserProfileDraft): FoldPanelRef<boolean> {
    return panels.open<UserProfileDraft, boolean>(EmailDialog, {
      side: dialogSide(),
      data: profile,
    });
  }

  /** Le profil tel que `/me` le rend : l'adresse à changer, et ce qui l'accompagne. */
  readonly data = input.required<UserProfileDraft>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly account = inject(AccountService);
  private readonly ref = inject(FoldPanelRef);

  protected readonly next = signal('');
  protected readonly confirmation = signal('');
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** L'adresse saisie deux fois se dit-elle pareil ? Vide, on ne juge pas encore. */
  private readonly mismatch = computed(
    () =>
      this.confirmation().trim() !== '' &&
      normalized(this.next()) !== normalized(this.confirmation()),
  );

  /** Retaper son adresse actuelle n'est pas un changement — on le DIT. */
  private readonly unchanged = computed(
    () => this.next().trim() !== '' && normalized(this.next()) === normalized(this.data().email),
  );

  /** Ce que `fold-input` affiche sous le premier champ. */
  protected readonly nextErrors = computed(() =>
    this.unchanged() ? [fieldError(this.t().account.loginMethodEmailSame)] : NO_ERRORS,
  );

  /** …et sous le second. */
  protected readonly confirmErrors = computed(() =>
    this.mismatch() ? [fieldError(this.t().account.loginMethodEmailMismatch)] : NO_ERRORS,
  );

  protected readonly canSave = computed(
    () =>
      !this.saving() &&
      this.next().trim() !== '' &&
      this.confirmation().trim() !== '' &&
      !this.mismatch() &&
      !this.unchanged(),
  );

  protected setNext(value: string): void {
    this.next.set(value);
  }

  protected setConfirmation(value: string): void {
    this.confirmation.set(value);
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const refusal = await this.account.saveMyProfile({
      ...this.data(),
      email: this.next().trim(),
    });
    this.saving.set(false);
    // Un refus — l'adresse est déjà prise — reste là où la saisie a lieu.
    if (refusal === null) {
      this.ref.close(true);
    } else {
      this.refusal.set(refusal);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}

function normalized(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Aucune erreur — une constante, pour que `fold-input` reçoive la MÊME
 * référence tant que rien ne cloche et ne se redessine pas à chaque frappe.
 */
const NO_ERRORS: readonly FieldError[] = [];

/** La forme qu'attend `[errors]` de `fold-input`, réduite à ce qu'on lui donne. */
interface FieldError {
  readonly kind: string;
  readonly message: string;
}

/** Une erreur de SAISIE, dite sous le champ plutôt que par un bouton grisé. */
function fieldError(message: string): FieldError {
  return { kind: 'client', message };
}
