import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { STAFF_ROLE_KEY_MAX_LENGTH, type RoleGrant, type StaffRoleView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { GrantsGrid } from '../grants-grid/grants-grid';
import { StaffRolesService } from '../staff-roles.service';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

/** La forme qu'une clé doit avoir — le serveur retranche, ceci prévient. */
const KEY_SHAPE = /^[a-z][a-z0-9-]*$/u;

/**
 * **Définir un rôle** — une page, pas un panneau latéral.
 *
 * Le choix est fait pour ce qui vient : un rôle ne restera pas « un libellé et
 * douze niveaux ». Portées (les commandes de QUEL point de vente), conditions,
 * qui a le droit de l'attribuer — chacune de ces additions étouffe un panneau
 * de 24 rem, alors qu'une page les absorbe en gagnant une section.
 *
 * Elle sert la **création** et la **modification** : les deux posent exactement
 * les mêmes questions, à une près — la clé, qui ne se saisit qu'une fois parce
 * qu'elle ne se renomme jamais. Deux écrans jumeaux auraient divergé au premier
 * champ ajouté.
 */
@Component({
  selector: 'app-role-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldButtonComponent,
    FoldInputComponent,
    FoldEmptyStateComponent,
    GrantsGrid,
  ],
  templateUrl: './role-editor-page.html',
  styleUrl: './role-editor-page.scss',
})
export class RoleEditorPage {
  private readonly service = inject(StaffRolesService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** La clé de la route : `null` sur `/admin/roles/nouveau`. */
  private readonly editedKey = this.route.snapshot.paramMap.get('key');

  protected readonly state = signal<LoadState>('loading');
  protected readonly label = signal('');
  protected readonly key = signal('');
  protected readonly grants = signal<readonly RoleGrant[]>([]);
  protected readonly saving = signal(false);
  /** Vrai dès que la clé a été touchée : on cesse alors de la dériver du libellé. */
  private readonly keyTouched = signal(false);

  protected readonly isCreate = this.editedKey === null;
  protected readonly heading = this.isCreate ? 'Nouveau rôle' : 'Modifier le rôle';

  /**
   * Un rôle sans droit est refusé par le serveur, et pour une bonne raison :
   * quelqu'un à qui on l'attribuerait verrait 403 partout sans comprendre.
   * L'écran le dit avant d'envoyer plutôt que de faire revenir une erreur.
   */
  protected readonly canSubmit = computed(
    () =>
      this.label().trim() !== '' &&
      KEY_SHAPE.test(this.key().trim()) &&
      this.grants().length > 0 &&
      !this.saving(),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    const key = this.editedKey;
    if (key === null) {
      this.state.set('ready');
      return;
    }
    this.state.set('loading');
    try {
      // La liste plutôt qu'une route dédiée : la collection est bornée à une
      // poignée de rôles, et un second chemin de lecture serait une seconde
      // vérité à tenir d'accord avec la première.
      const found = (await this.service.list()).find((role) => role.key === key);
      if (found === undefined || found.locked) {
        this.state.set('missing');
        return;
      }
      this.seed(found);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected setLabel(value: string): void {
    this.label.set(value);
    if (!this.keyTouched()) {
      this.key.set(slugify(value));
    }
  }

  protected setKey(value: string): void {
    this.keyTouched.set(true);
    this.key.set(value.trim().toLowerCase());
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    try {
      const payload = { label: this.label().trim(), grants: [...this.grants()] };
      if (this.editedKey === null) {
        await this.service.create({ key: this.key().trim(), ...payload });
      } else {
        await this.service.update(this.editedKey, payload);
      }
      await this.router.navigate(['/admin/roles']);
    } catch {
      // Le refus du serveur nomme le cas réel — clé déjà prise, rôle encore
      // porté — et il est déjà affiché. Le doubler le rendrait plus vague.
      this.notify.error("Le rôle n'a pas pu être enregistré.");
    } finally {
      this.saving.set(false);
    }
  }

  protected async cancel(): Promise<void> {
    await this.router.navigate(['/admin/roles']);
  }

  private seed(role: StaffRoleView): void {
    this.label.set(role.label);
    this.key.set(role.key);
    this.keyTouched.set(true);
    this.grants.set(role.grants);
  }
}

/**
 * « Fournil de nuit » → `fournil-de-nuit`. Les accents tombent : la clé voyage
 * dans une URL et dans un fichier de journal, où un `é` ne se dicte pas.
 */
function slugify(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, STAFF_ROLE_KEY_MAX_LENGTH);
}
