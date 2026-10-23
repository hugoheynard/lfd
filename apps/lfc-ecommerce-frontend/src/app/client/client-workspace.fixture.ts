import { computed, signal, type WritableSignal } from '@angular/core';
import { PERSONAL_WORKSPACE, type CompanyView, type ReachableSiteView } from '@lfd/contracts';

import { ClientWorkspace, type WorkspaceOption } from './client-workspace.service';

/** Ce que les suites lisent de l'espace — les signaux publics, et le choix. */
type WorkspaceSurface = Pick<
  ClientWorkspace,
  | 'current'
  | 'company'
  | 'isPersonal'
  | 'hasChoice'
  | 'options'
  | 'choose'
  | 'reachableSite'
  | 'siteBillingReadable'
>;

/** Une doublure pilotable : `current` s'écrit, le reste en dérive comme dans le vrai service. */
export interface WorkspaceDouble extends WorkspaceSurface {
  readonly current: WritableSignal<string | null>;
  readonly companies: WritableSignal<readonly CompanyView[]>;
  /** Les sites atteints par héritage (S6), proposés après les sociétés. */
  readonly sites: WritableSignal<readonly ReachableSiteView[]>;
  readonly chosen: string[];
}

/**
 * **Un espace de travail doublé**, pour les suites dont le sujet n'est pas la
 * résolution de l'espace — le panier, les commandes, les menus.
 *
 * La résolution elle-même est éprouvée contre le vrai service
 * (`client-workspace.service.spec.ts`) ; ici, on veut BASCULER à la main, au
 * milieu d'une accalmie ou d'une lecture, ce que le vrai service ne permet
 * qu'à travers un `PATCH`.
 */
export function workspaceDouble(
  current: string | null = PERSONAL_WORKSPACE,
  companies: readonly CompanyView[] = [],
): WorkspaceDouble {
  const current$ = signal<string | null>(current);
  const companies$ = signal<readonly CompanyView[]>(companies);
  const sites$ = signal<readonly ReachableSiteView[]>([]);
  const chosen: string[] = [];
  return {
    current: current$,
    companies: companies$,
    sites: sites$,
    chosen,
    company: computed(() => companies$().find((c) => c.id === current$()) ?? null),
    isPersonal: computed(() => current$() === PERSONAL_WORKSPACE),
    hasChoice: computed(() => companies$().length > 0),
    options: computed<readonly WorkspaceOption[]>(() => [
      { value: PERSONAL_WORKSPACE, company: null, via: null },
      ...companies$().map((company) => ({ value: company.id, company, via: null })),
      ...sites$().map((site) => ({
        value: site.company.id,
        company: site.company,
        via: site.via.name,
      })),
    ]),
    // La résolution des sites (S6) est éprouvée contre le vrai service ; la
    // doublure ne fait que les proposer.
    reachableSite: computed(() => null),
    siteBillingReadable: computed(() => null),
    choose: (workspace: string): void => {
      chosen.push(workspace);
      current$.set(workspace);
    },
  };
}

/** Le fournisseur à poser dans un `TestBed`. */
export const provideWorkspace = (double: WorkspaceDouble) => ({
  provide: ClientWorkspace,
  useValue: double,
});
