import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { isSuperAdminRoleKey, type StaffRoleView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { CanDirective } from '../../shared/can/can.directive';
import { grantGroups, RESOURCE_COUNT, type GrantGroup } from './grant-chips';
import { StaffRolesService } from './staff-roles.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Un rôle, prêt à être posé sur une carte. */
interface RoleCard {
  readonly role: StaffRoleView;
  readonly locked: boolean;
  readonly groups: readonly GrantGroup[];
  /** `null` pour le sommet : « 12 sur 12 » dirait faux le jour d'une ressource de plus. */
  readonly openedLabel: string | null;
}

/**
 * **Admin › Rôles** — ce que chaque rôle ouvre, d'un coup d'œil.
 *
 * Des cartes compactes, et **seulement les domaines ouverts**, groupés par
 * niveau. Le premier jet posait ici la grille d'édition complète : douze lignes
 * par rôle dont sept disaient « Aucun », cinq fois de suite. La carte sert à
 * balayer et à comparer, l'éditeur sert à décider — leur donner la même densité
 * les rendait mauvais tous les deux.
 *
 * `superadmin` est en tête, verrouillé, sans liste de domaines : il accorde
 * tout, **y compris ce qui n'existe pas encore**. Le montrer est le point — un
 * sommet qu'on ne voit pas est un sommet qu'on oublie.
 */
@Component({
  selector: 'app-roles-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldCardComponent,
    FoldButtonComponent,
    FoldBadgeComponent,
    FoldIconComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    CanDirective,
  ],
  templateUrl: './roles-page.html',
  styleUrl: './roles-page.scss',
})
export class RolesPage {
  private readonly service = inject(StaffRolesService);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly roles = signal<readonly StaffRoleView[]>([]);
  /** Rôle dont la confirmation d'archivage est ouverte (état d'écran, pas de donnée). */
  protected readonly confirmingKey = signal<string | null>(null);

  protected readonly cards = computed<readonly RoleCard[]>(() =>
    this.roles().map((role) => {
      const locked = role.locked || isSuperAdminRoleKey(role.key);
      return {
        role,
        locked,
        groups: locked ? [] : grantGroups(role.grants),
        openedLabel: locked ? null : `${role.grants.length} sur ${RESOURCE_COUNT}`,
      };
    }),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.roles.set(await this.service.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected async confirmArchive(role: StaffRoleView): Promise<void> {
    this.confirmingKey.set(null);
    try {
      await this.service.archive(role.key);
      this.notify.success(`Le rôle « ${role.label} » est archivé.`);
      await this.load();
    } catch {
      // Le refus du serveur nomme le cas — « 3 personnes portent encore ce
      // rôle » — et il est déjà affiché. Le doubler le rendrait plus vague.
      this.notify.error("Le rôle n'a pas pu être archivé.");
    }
  }

  protected async restore(role: StaffRoleView): Promise<void> {
    try {
      await this.service.restore(role.key);
      await this.load();
    } catch {
      this.notify.error("Le rôle n'a pas pu être remis en circulation.");
    }
  }
}
