import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatSiret } from '@lfd/b2b-ui/company';
import {
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
} from 'fold-ng';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';

/**
 * **L'identité légale d'un site** : celle de son principal, en lecture. Un
 * site n'a ni SIRET, ni KBIS, ni TVA à lui (`plan-sous-comptes.md` §2.1 bis) ;
 * lui montrer la carte d'identité éditable d'un client faisait réclamer des
 * pièces que le serveur a levées.
 */
@Component({
  selector: 'app-site-identity-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
  ],
  templateUrl: './site-identity-card.html',
})
export class SiteIdentityCard {
  readonly principal = input.required<AdminCompanyDetail>();

  protected readonly name = computed(() => {
    const p = this.principal();
    return p.enseigne.trim() === '' ? p.raisonSociale : p.enseigne;
  });

  protected readonly siret = computed(() => {
    const siret = this.principal().siret;
    return siret === '' ? '—' : formatSiret(siret);
  });
}
