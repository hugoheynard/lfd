import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FollowedAspectView, ParentCompanyView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { FoldButtonComponent, FoldCalloutComponent, FoldInlineConfirmComponent } from 'fold-ng';

import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import { FOLLOW_ASPECT_LABELS } from '../../comptes-clients/admin-company';
import { NotifyService } from '../../notify.service';

/**
 * **« Site de _Principal_ » / « Entité rattachée à _Principal_ »** — le bandeau d'une fiche de sous-compte,
 * avec le lien vers son principal et le geste « Détacher »
 * (`plan-sous-comptes.md` §4).
 *
 * Détacher ferme TOUTES les périodes de suivi : la confirmation le dit, en
 * nommant celles qui sont ouvertes, parce qu'un clic qui fait changer un
 * compte de payeur ou de tarif ne doit pas se donner par réflexe.
 */
@Component({
  selector: 'app-parent-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoldButtonComponent, FoldCalloutComponent, FoldInlineConfirmComponent],
  templateUrl: './parent-banner.html',
  styleUrl: './parent-banner.scss',
})
export class ParentBanner {
  private readonly service = inject(AdminCompanyHierarchyService);
  private readonly notify = inject(NotifyService);

  readonly companyId = input.required<string>();
  readonly parent = input.required<ParentCompanyView>();
  readonly follows = input.required<readonly FollowedAspectView[]>();

  /** Le compte vient d'être détaché : la fiche relit. */
  readonly detached = output<void>();

  /**
   * « Site de » quand il suit la facturation (même entité légale, §2.1 bis),
   * « Entité rattachée à » sinon : les deux sous-comptes ne se lisent pas pareil.
   */
  protected readonly kindLabel = computed(() =>
    this.follows().some((follow) => follow.aspect === 'billing') ? 'Site de' : 'Entité rattachée à',
  );

  protected readonly confirming = signal(false);
  protected readonly detaching = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** La phrase de confirmation — elle nomme ce qui se ferme. */
  protected readonly confirmMessage = computed(() => {
    const open = this.follows().map((follow) => FOLLOW_ASPECT_LABELS[follow.aspect].toLowerCase());
    const closing =
      open.length === 0
        ? 'Aucun aspect n’est suivi en ce moment.'
        : `Toutes les périodes de suivi se ferment (${open.join(', ')}) : ce compte reprend ses propres valeurs.`;
    return `Détacher ce compte de ${this.parent().enseigne} ? ${closing}`;
  });

  protected async detach(): Promise<void> {
    if (this.detaching()) {
      return;
    }
    this.detaching.set(true);
    this.refusal.set(null);
    try {
      await this.service.detach(this.companyId());
      this.notify.success(`Compte détaché de ${this.parent().enseigne}.`);
      this.confirming.set(false);
      this.detached.emit();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le compte n’a pas été détaché.'));
    } finally {
      this.detaching.set(false);
    }
  }
}
