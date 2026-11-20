import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { companyName } from '../../client-workspace.service';
import { screenCopy } from '../../copy/shop-copy-composer';
import { siteMenuCopy } from '../../copy/screens/site-menu.copy';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { ManageableSites } from '../manageable-sites';

/**
 * `/mes-sites` — **les sites d'un compte principal**, chacun vers sa carte
 * (`plan-carte-des-sites.md`, § 5). Au propriétaire et à l'administrateur du
 * principal seulement ; le menu n'y mène pas les autres.
 */
@Component({
  selector: 'app-sites-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClientBannerBlock,
    ClientBannerOutlet,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    RouterLink,
  ],
  templateUrl: './sites-page.html',
  styleUrl: './sites-page.scss',
})
export class SitesPage {
  protected readonly copy = screenCopy('siteMenu', siteMenuCopy);
  protected readonly manageable = inject(ManageableSites);
  protected readonly nameOf = companyName;
}
