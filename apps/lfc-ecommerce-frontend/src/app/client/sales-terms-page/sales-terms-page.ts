import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { ClientAudience } from '../client-audience.service';
import { ClientChrome } from '../client-chrome.service';
import { ClientLegalDocuments } from '../client-legal-documents.service';
import { ClientCopyService } from '../copy/client-copy.service';
import { ClientBannerOutlet } from '../nav/client-banner';
import { ClientBannerBlock } from '../nav/client-banner-block/client-banner-block';
import { SalesTermsReader } from '../sales-terms-reader/sales-terms-reader';
import {
  defaultSalesTermsSide,
  parseSalesTermsSide,
  SALES_TERMS_SIDE_PARAM,
  salesTermsDocumentOf,
  type SalesTermsSide,
} from '../sales-terms-side';

/**
 * **`/cgv`** — l'adresse partageable des CGV (plan
 * `legal/plan-cgv-par-audience.md`, bandeau du 2026-10-15 : une seule page,
 * un switch, le côté gardé dans l'adresse).
 *
 * `/cgv?pour=pro` ouvre le texte professionnel — c'est le lien qu'une landing
 * pro donnera, sans connexion : les deux textes sont publics. Sans paramètre,
 * le côté suit la clientèle (`ClientAudience`). Basculer réécrit l'adresse
 * (`replaceUrl` : changer de côté n'est pas une page de plus dans
 * l'historique), pour que le lien copié ouvre ce qu'on lit.
 *
 * Le pied de page, lui, ouvre le même contenu en dialogue (`SalesTermsPanel`).
 */
@Component({
  selector: 'app-sales-terms-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientBannerBlock, ClientBannerOutlet, SalesTermsReader],
  templateUrl: './sales-terms-page.html',
  styleUrl: './sales-terms-page.scss',
})
export class SalesTermsPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly audience = inject(ClientAudience);
  private readonly documents = inject(ClientLegalDocuments);
  private readonly chrome = inject(ClientChrome);
  private readonly t = inject(ClientCopyService).t;

  private readonly param = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get(SALES_TERMS_SIDE_PARAM))),
    { initialValue: this.route.snapshot.queryParamMap.get(SALES_TERMS_SIDE_PARAM) },
  );

  /** L'adresse d'abord ; à défaut, la clientèle. */
  protected readonly side = computed<SalesTermsSide>(
    () => parseSalesTermsSide(this.param()) ?? defaultSalesTermsSide(this.audience.current()),
  );

  /** Le titre du texte affiché, tel que le back-office l'a écrit. */
  protected readonly title = computed(() =>
    this.documents.titleOf(salesTermsDocumentOf(this.side())),
  );

  constructor() {
    effect(() => this.chrome.kicker.set(this.t().legalDocument.salesTerms.pageTitle));
    this.chrome.back.set(null);
    this.chrome.menu.set(true);
    this.chrome.barOnDesktop.set(true);
  }

  protected choose(side: SalesTermsSide): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [SALES_TERMS_SIDE_PARAM]: side },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
