import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import type { StaffScope, StaffUserPayload, StaffUserView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldInputComponent,
  FoldMultiselectComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { SCOPE_OPTIONS } from '../staff-scopes';
import { StaffUsersService } from '../staff-users.service';

/** Charge d'ouverture du panneau : le user à éditer, ou `null` pour en créer un. */
export interface StaffUserPanelData {
  readonly user: StaffUserView | null;
}

/** Contient un `@` entouré de caractères — garde-fou de forme (le backend tranche). */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+$/u;

/**
 * Panneau **Utilisateur staff** — crée ou édite une personne du back-office :
 * identité (prénom, nom, e-mail) + **périmètre** (multiselect). Container mince :
 * il seede des signaux depuis `data`, valide de forme, puis enchaîne la
 * sauvegarde et ferme avec un résultat vrai (la page recharge la liste).
 */
@Component({
  selector: 'app-staff-user-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldButtonComponent,
    FoldInputComponent,
    FoldMultiselectComponent,
  ],
  templateUrl: './staff-user-panel.html',
  styleUrl: './staff-user-panel.scss',
})
export class StaffUserPanel {
  private readonly staff = inject(StaffUsersService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<StaffUserPanelData | undefined>(undefined);

  protected readonly scopeOptions = SCOPE_OPTIONS;

  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly email = signal('');
  protected readonly scopes = signal<StaffScope[]>([]);
  protected readonly saving = signal(false);

  protected readonly isCreate = computed(() => (this.data()?.user ?? null) === null);
  protected readonly heading = computed(() =>
    this.isCreate() ? 'Nouvel utilisateur staff' : "Modifier l'utilisateur staff",
  );
  protected readonly canSubmit = computed(
    () =>
      this.firstName().trim() !== '' &&
      this.lastName().trim() !== '' &&
      LOOKS_LIKE_EMAIL.test(this.email().trim()),
  );

  constructor() {
    // Préremplit à l'ouverture. `data` est fixé et ne change plus.
    effect(() => {
      const user = this.data()?.user ?? null;
      if (user === null) {
        return;
      }
      this.firstName.set(user.firstName);
      this.lastName.set(user.lastName);
      this.email.set(user.email);
      this.scopes.set([...user.scopes]);
    });
  }

  protected async submit(): Promise<void> {
    const user = this.data()?.user ?? null;
    if (!this.canSubmit() || this.saving()) {
      return;
    }
    this.saving.set(true);
    const payload: StaffUserPayload = {
      firstName: this.firstName().trim(),
      lastName: this.lastName().trim(),
      email: this.email().trim(),
      scopes: this.scopes(),
    };
    try {
      if (user === null) {
        await this.staff.create(payload);
        this.notify.success('Utilisateur ajouté.');
      } else {
        await this.staff.update(user.id, payload);
        this.notify.success('Utilisateur mis à jour.');
      }
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
