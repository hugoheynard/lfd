import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CompanyFollowAspect, FollowedAspectView, ParentCompanyView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { FoldCalloutComponent, FoldCheckboxComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';

/** Ce que « suivre » veut dire, aspect par aspect (`plan-sous-comptes.md` §2.1). */
const HINTS: Readonly<Record<CompanyFollowAspect, (parent: string) => string>> = {
  billing: (parent) =>
    `Facturé et prélevé au nom de ${parent} : son RIB, son mandat et ses conditions de règlement.`,
  pricing: (parent) => `La mercuriale et les engagements de ${parent} s’appliquent à ce compte.`,
  contacts: (parent) => `Les contacts de ${parent} sont partagés avec ce compte.`,
};

/**
 * **« Suivre le compte principal »** — la case d'un aspect, dans le panneau
 * qui le règle (Facturation, Tarif, Contacts — `plan-sous-comptes.md` §4).
 * C'est le geste « Aligner sur la déclinaison par défaut » de la fiche produit.
 *
 * Écrite dès qu'on la coche ; le serveur relit et refuse (principal inactif,
 * aspect déjà suivi…) avec un message qui nomme le cas, affiché tel quel, et
 * la case revient à ce qui est enregistré.
 *
 * Le **tarif** est une décision du commercial (Q9) : sans
 * `b2b_pricing:write`, la case se lit sans se régler. Les deux autres suivent
 * la règle de la fiche, où l'écran ne double pas le mur du serveur.
 */
@Component({
  selector: 'app-follow-parent-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoldCalloutComponent, FoldCheckboxComponent],
  templateUrl: './follow-parent-toggle.html',
  styleUrl: './follow-parent-toggle.scss',
})
export class FollowParentToggle {
  private readonly service = inject(AdminCompanyHierarchyService);
  private readonly permissions = inject(PermissionsStore);

  readonly companyId = input.required<string>();
  readonly aspect = input.required<CompanyFollowAspect>();
  readonly parent = input.required<ParentCompanyView>();
  /** Les aspects suivis EN COURS, tels que la fiche les a lus. */
  readonly follows = input.required<readonly FollowedAspectView[]>();

  /** Le suivi a changé : la fiche relit. */
  readonly changed = output<boolean>();

  /** Ce que la case montre — remis à l'enregistré après un refus. */
  protected readonly checked = signal(false);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** La période en cours de cet aspect, ou `null`. */
  protected readonly current = computed(
    () => this.follows().find((follow) => follow.aspect === this.aspect()) ?? null,
  );

  protected readonly canEdit = computed(
    () => this.aspect() !== 'pricing' || this.permissions.can('b2b_pricing:write'),
  );

  protected readonly hint = computed(() => HINTS[this.aspect()](this.parent().enseigne));

  protected readonly since = computed(() => {
    const current = this.current();
    return current === null ? '' : new Date(current.since).toLocaleDateString('fr-FR');
  });

  constructor() {
    effect(() => {
      const following = this.current() !== null;
      untracked(() => this.checked.set(following));
    });
  }

  protected async toggle(following: boolean): Promise<void> {
    if (this.saving() || !this.canEdit()) {
      return;
    }
    const previous = this.checked();
    this.checked.set(following);
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.service.setFollowing(this.companyId(), this.aspect(), following);
      this.changed.emit(following);
    } catch (error) {
      this.checked.set(previous);
      this.refusal.set(httpErrorMessage(error, 'Le suivi du compte principal n’a pas changé.'));
    } finally {
      this.saving.set(false);
    }
  }
}
