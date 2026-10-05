import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import type { CompanyHierarchyView } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import { FollowParentToggle } from '../follow-parent-toggle/follow-parent-toggle';

/**
 * **« Suivre le compte principal »**, dans l'onglet Tarifs d'un sous-compte
 * (`plan-sous-comptes.md` §4, Q9).
 *
 * L'onglet lit les prix, pas la fiche : la hiérarchie se lit donc ici, et rien
 * ne s'affiche pour un compte sans principal — la plupart. Pendant la lecture,
 * rien non plus : l'onglet a déjà son propre chargement juste en dessous, et
 * deux indicateurs l'un sur l'autre diraient deux attentes pour une.
 *
 * ⚠️ Avant le lot S3, suivre le tarif est ENREGISTRÉ mais pas encore LU par
 * le calcul des prix : la mercuriale affichée en dessous reste celle du
 * sous-compte (plan §6).
 */
@Component({
  selector: 'app-pricing-follow',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FollowParentToggle],
  templateUrl: './pricing-follow.html',
})
export class PricingFollow {
  private readonly service = inject(AdminCompanyHierarchyService);

  readonly companyId = input.required<string>();

  protected readonly hierarchy = signal<CompanyHierarchyView | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    effect(() => {
      void this.load(this.companyId());
    });
  }

  protected async load(companyId = this.companyId()): Promise<void> {
    this.failed.set(false);
    try {
      this.hierarchy.set((await this.service.hierarchyOf(companyId)) ?? null);
    } catch {
      this.failed.set(true);
    }
  }
}
