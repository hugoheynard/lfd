import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CatalogOverviewView } from '@lfd/pim-contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { CatalogueOverviewHttpApi } from '../catalogue-overview-http-api';
import { ReemissionPanel } from '../reemission/reemission-panel/reemission-panel';

/**
 * **Où en est le catalogue** — l'accueil du référentiel.
 *
 * La réponse existait, éclatée sur trois écrans : la liste des produits disait
 * les statuts, la publication disait les canaux, les révisions disaient
 * l'histoire. Personne ne tenait « où on en est », qui est pourtant la première
 * question qu'on se pose en ouvrant le PIM.
 *
 * Ce qu'elle NE dit pas, délibérément : ce qui manque à une fiche pour être
 * publiable. Cette règle vit sur la fiche, et l'agréger ici en ferait une
 * seconde déclaration — la dérive qui a déjà coûté trois fois dans ce dépôt.
 */
@Component({
  selector: 'app-catalogue-overview-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    ReemissionPanel,
    RouterLink,
  ],
  templateUrl: './overview-page.html',
  styleUrl: './overview-page.scss',
})
export class CatalogueOverviewPage {
  private readonly api = inject(CatalogueOverviewHttpApi);

  protected readonly overview = signal<CatalogOverviewView | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(true);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.overview.set(await this.api.read());
    } catch (caught) {
      this.error.set(httpErrorMessage(caught));
    } finally {
      this.loading.set(false);
    }
  }
}
