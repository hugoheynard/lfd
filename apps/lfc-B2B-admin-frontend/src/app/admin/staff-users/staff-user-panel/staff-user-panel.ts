import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { StaffOverride, StaffRole, StaffUserPayload, StaffUserView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldSelectComponent,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { ROLE_OPTIONS, toStaffRole } from '../staff-roles';
import { OverridesGrid } from './overrides-grid/overrides-grid';
import { StaffUsersService } from '../staff-users.service';

/** Charge d'ouverture du panneau : le user à éditer, ou `null` pour en créer un. */
export interface StaffUserPanelData {
  readonly user: StaffUserView | null;
}

/** Contient un `@` entouré de caractères — garde-fou de forme (le backend tranche). */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+$/u;

/**
 * Panneau **Utilisateur staff** — crée ou édite une personne du back-office :
 * identité (prénom, nom, e-mail, téléphone, fonction) + **rôle**. Container
 * mince : il seede des signaux depuis `data`, valide de forme, puis enchaîne la
 * sauvegarde et ferme avec un résultat vrai (la page recharge la liste).
 *
 * Les **dérogations** au rôle s'éditent dans une grille dédiée
 * ({@link OverridesGrid}) : c'est le geste rare, il ne doit pas encombrer le
 * geste courant.
 */
@Component({
  selector: 'app-staff-user-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldButtonComponent,
    FoldInputComponent,
    FoldSelectComponent,
    OverridesGrid,
  ],
  templateUrl: './staff-user-panel.html',
  styleUrl: './staff-user-panel.scss',
})
export class StaffUserPanel {
  private readonly staff = inject(StaffUsersService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<StaffUserPanelData | undefined>(undefined);

  protected readonly roleOptions = ROLE_OPTIONS;

  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly email = signal('');
  protected readonly phone = signal('');
  protected readonly jobTitle = signal('');
  protected readonly role = signal<StaffRole>('commercial');
  protected readonly saving = signal(false);

  /** Les écarts au rôle — édités par la grille, enregistrés avec le reste. */
  protected readonly overrides = signal<readonly StaffOverride[]>([]);

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
      this.phone.set(user.phone);
      this.jobTitle.set(user.jobTitle);
      this.role.set(user.role);
      this.overrides.set(user.overrides);
    });
  }

  /** Le `<select>` natif ne rend qu'une chaîne : on ne garde que ce qui est un rôle. */
  protected setRole(value: string): void {
    const role = toStaffRole(value);
    if (role !== null) {
      this.role.set(role);
    }
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
      phone: this.phone().trim(),
      jobTitle: this.jobTitle().trim(),
      role: this.role(),
      overrides: [...this.overrides()],
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
