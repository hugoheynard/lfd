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
import type { ProfileView } from '@lfd/contracts';
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

import type { UserProfileDraft } from '../../../../account/account.model';
import { AccountService } from '../../../../account/account.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { panelSide } from '../../../panel-side';

/** Charge d'ouverture : le profil tel que la carte le montrait. */
export type ProfilePanelData = UserProfileDraft;

type ProfileField = keyof UserProfileDraft;

const EMPTY: UserProfileDraft = { firstName: '', lastName: '', email: '', phone: '' };

/**
 * Le panneau **Mes informations** de `/mon-compte` — la personne connectée, pas
 * la société. Tout membre l'ouvre : c'est son propre profil, et
 * `PATCH /me/profile` ne lit l'identité que du jeton.
 *
 * ## Ce qu'un changement d'adresse emporte, dit AVANT d'enregistrer
 *
 * L'adresse est aussi l'identifiant de connexion. Le serveur la propage à Auth0
 * avant de l'écrire chez nous, en adresse **non vérifiée** avec un e-mail de
 * vérification, et remet à zéro la preuve d'adresse de notre côté (vérifié le
 * 2026-09-14, `update-my-profile.handler.ts`, `auth0-identity.gateway.ts`,
 * `user-profile.ts`). Le panneau le dit dès que l'adresse tapée diffère.
 *
 * Prénom et nom sont exigés par le domaine (`PersonName.create`) ; le téléphone
 * est facultatif (`PhoneNumber.create` lit le vide comme « non renseigné »).
 */
@Component({
  selector: 'app-profile-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './profile-panel.html',
  styleUrl: './profile-panel.scss',
})
export class ProfilePanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md', surface: 'solid' };

  /** Ouvre le panneau depuis l'une ou l'autre carte, sur les valeurs du moment du clic. */
  static open(panels: FoldPanelHostService, profile: ProfileView): void {
    panels.open(ProfilePanel, {
      side: panelSide(),
      data: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        phone: profile.phone,
      },
    });
  }

  readonly data = input.required<ProfilePanelData>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly account = inject(AccountService);
  private readonly ref = inject(FoldPanelRef);

  protected readonly draft = signal<UserProfileDraft>(EMPTY);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /**
   * L'adresse tapée en remplace-t-elle une autre ? Comparée sans casse ni
   * blancs : « Hugo@LFD.fr » n'est pas un changement qui mérite l'avertissement.
   */
  protected readonly emailChanged = computed(
    () => normalized(this.draft().email) !== normalized(this.data().email),
  );

  protected readonly changed = computed(() => {
    const draft = this.draft();
    const data = this.data();
    return (['firstName', 'lastName', 'email', 'phone'] as const).some(
      (key) => draft[key].trim() !== data[key].trim(),
    );
  });

  protected readonly canSave = computed(() => {
    const draft = this.draft();
    const filled = [draft.firstName, draft.lastName, draft.email].every((v) => v.trim() !== '');
    return !this.saving() && this.changed() && filled;
  });

  constructor() {
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
      email: draft.email.trim(),
      phone: draft.phone.trim(),
    });
    this.saving.set(false);
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
