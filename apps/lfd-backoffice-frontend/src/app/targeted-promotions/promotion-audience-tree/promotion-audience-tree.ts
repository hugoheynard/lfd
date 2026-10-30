import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { PromotionAudienceTargetView } from '@lfd/contracts';
import { FoldCalloutComponent, FoldCheckboxComponent, FoldInputComponent } from 'fold-ng';

import {
  boxStateOf,
  namedCompanyOf,
  toggledAudiences,
  touchesBranch,
  withCompany,
  type AudienceBox,
  type BoxState,
} from './audience-selection';

/** Une case, et son libellé. */
interface Box {
  readonly box: AudienceBox;
  readonly label: string;
}

const INDIVIDUALS: readonly Box[] = [
  { box: 'individuals_guest', label: 'Invités (sans compte)' },
  { box: 'individuals_registered', label: 'Inscrits' },
];
const PROS: readonly Box[] = [
  { box: 'pros_active', label: 'Actifs' },
  { box: 'pros_pending', label: "En cours d'inscription" },
];

/**
 * **Le public d'une promotion, en cases à cocher en étages** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 15.9, lot L8b) : Tout le monde · Particuliers (Invités, Inscrits) · Pros
 * (Actifs, En cours d'inscription, une société ± ses sites).
 *
 * Un parent coché coche et grise ses enfants ; certains enfants cochés le
 * rendent partiel. La valeur émise est l'ensemble minimal
 * (`audience-selection.ts`). Sous chaque branche touchée, l'appelant projette
 * ses libellés (`[individualsLabels]`, `[prosLabels]`).
 */
@Component({
  selector: 'app-promotion-audience-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldCheckboxComponent, FoldInputComponent],
  templateUrl: './promotion-audience-tree.html',
  styleUrl: './promotion-audience-tree.scss',
})
export class PromotionAudienceTree {
  readonly audiences = input.required<readonly PromotionAudienceTargetView[]>();
  readonly audiencesChange = output<PromotionAudienceTargetView[]>();

  protected readonly individuals = INDIVIDUALS;
  protected readonly pros = PROS;
  protected readonly company = computed(() => namedCompanyOf(this.audiences()));
  protected readonly touchesIndividuals = computed(() =>
    touchesBranch(this.audiences(), 'individuals'),
  );
  protected readonly touchesPros = computed(() => touchesBranch(this.audiences(), 'pros'));
  /** Le public de la reprise, que l'arbre ne propose pas : montré, remplacé au premier clic. */
  protected readonly legacy = computed(() =>
    this.audiences().some((target) => target.kind === 'everyone_but_active_pros'),
  );
  protected readonly everyoneChecked = computed(() => this.state('everyone').checked);

  protected state(box: AudienceBox): BoxState {
    return boxStateOf(box, this.audiences());
  }

  protected toggle(box: AudienceBox, checked: boolean): void {
    this.audiencesChange.emit(toggledAudiences(this.audiences(), box, checked));
  }

  protected toggleCompany(checked: boolean): void {
    this.audiencesChange.emit(
      withCompany(this.audiences(), checked ? { companyId: '', withSites: false } : null),
    );
  }

  protected setCompany(companyId: string): void {
    const withSites = this.company()?.kind === 'company_and_sites';
    this.audiencesChange.emit(withCompany(this.audiences(), { companyId, withSites }));
  }

  protected setSites(withSites: boolean): void {
    const companyId = this.company()?.companyId ?? '';
    this.audiencesChange.emit(withCompany(this.audiences(), { companyId, withSites }));
  }
}
