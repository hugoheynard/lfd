import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CompanyFollowAspect, FollowedAspectView, ParentCompanyView } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { FOLLOW_ASPECT_LABELS } from '../../comptes-clients/admin-company';

/** Ce que « suivre » veut dire, aspect par aspect (`sous-comptes.md` §2.1). */
const HINTS: Readonly<Record<CompanyFollowAspect, (parent: string) => string>> = {
  billing: (parent) =>
    `Facturé et prélevé au nom de ${parent} : son RIB, son mandat et ses conditions de règlement.`,
  pricing: (parent) => `La mercuriale et les engagements de ${parent} s’appliquent à ce compte.`,
  contacts: (parent) => `Les contacts de ${parent} sont partagés avec ce compte.`,
};

/**
 * Ce qui est vrai quand l'aspect n'est PAS suivi : le compte a le sien. Dire
 * « ne suit pas _Principal_ » nommait ce qui manque, pas ce qui est (Hugo,
 * 2026-10-20).
 */
const OWN: Readonly<Record<CompanyFollowAspect, string>> = {
  billing: 'ce compte est facturé et prélevé à son propre nom.',
  pricing: 'ce compte a ses propres prix.',
  contacts: 'ce compte a ses propres contacts.',
};

/**
 * **Ce qu'un sous-compte suit de son principal**, pour un aspect — en
 * lecture, sur la fiche de l'enfant (Facturation, Tarif, Contacts).
 *
 * Jusqu'au 2026-10-20, c'était la case qui réglait le suivi. Hugo l'a
 * déplacée dans la grille de la page Sous-comptes du principal (`FollowGrid`),
 * où l'on règle plusieurs sites d'un coup ; ici, l'état, sa date et le lien
 * vers cette grille.
 */
@Component({
  selector: 'app-follow-parent-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './follow-parent-toggle.html',
})
export class FollowParentToggle {
  readonly aspect = input.required<CompanyFollowAspect>();
  readonly parent = input.required<ParentCompanyView>();
  /** Les aspects suivis EN COURS, tels que la fiche les a lus. */
  readonly follows = input.required<readonly FollowedAspectView[]>();

  /** La période en cours de cet aspect, ou `null`. */
  protected readonly current = computed(
    () => this.follows().find((follow) => follow.aspect === this.aspect()) ?? null,
  );

  protected readonly label = computed(() => FOLLOW_ASPECT_LABELS[this.aspect()]);
  protected readonly hint = computed(() => HINTS[this.aspect()](this.parent().enseigne));
  protected readonly own = computed(() => OWN[this.aspect()]);

  protected readonly since = computed(() => {
    const current = this.current();
    return current === null ? '' : new Date(current.since).toLocaleDateString('fr-FR');
  });
}
