import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  FoldButtonComponent,
  FoldDangerZoneComponent,
  FoldElementTitleComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldOptionComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { formatPercent } from '../../data/channels';
import { ChannelMatrix } from '../channel-matrix/channel-matrix';
import { CatalogueApi, type Category, type SalesChannels, type TvaRate } from '../catalogue-api';

/** Charge passée à `open()` : la famille à régler, et les taux disponibles. */
export interface CategoryPanelData {
  readonly category: Category;
  readonly rates: readonly TvaRate[];
}

/**
 * Panneau **famille** : nom, canaux par défaut, taux de TVA — et l'archivage
 * dans sa zone dangereuse, au bas du même panneau.
 *
 * Il remplace deux choses. Une carte d'édition qui s'ouvrait EN HAUT de la page
 * et poussait le tableau vers le bas, si bien qu'on perdait de vue la ligne
 * qu'on réglait. Et un bouton « Archiver » posé à même la ligne, à un clic de
 * distance d'un bouton « Réglages » — donc une action irréversible offerte sans
 * qu'on ait regardé ce qu'on archive.
 *
 * Les trois réglages partent **en une fois**, à l'enregistrement. Ils partaient
 * à chaque frappe : trois requêtes pour une hésitation sur un taux, et aucun
 * moyen d'annuler.
 */
@Component({
  selector: 'app-category-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldPanelHeaderComponent,
    FoldPanelFooterComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldOptionComponent,
    FoldButtonComponent,
    FoldDangerZoneComponent,
    FoldElementTitleComponent,
    ChannelMatrix,
  ],
  templateUrl: './category-panel.html',
  styleUrl: './category-panel.scss',
})
export class CategoryPanel {
  private readonly api = inject(CatalogueApi);
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  readonly data = input<CategoryPanelData | undefined>(undefined);

  protected readonly busy = signal(false);

  protected readonly category = computed<Category>(() => {
    const data = this.data();
    if (data === undefined) {
      throw new Error('CategoryPanel ouvert sans famille.');
    }
    return data.category;
  });

  protected readonly rates = computed<readonly TvaRate[]>(() => this.data()?.rates ?? []);
  protected readonly activeProducts = computed(() => this.category().activeProductCount);

  /**
   * Le domaine refuse d'archiver une famille qui porte des fiches (invariant 5).
   * Sans action proposée, la zone dangereuse reste un cadre qui explique — elle
   * n'offre pas un bouton dont on sait qu'il échouera.
   */
  protected readonly canArchive = computed(() => this.activeProducts() === 0);

  /**
   * Les brouillons **dérivent** de la famille reçue.
   *
   * `linkedSignal` plutôt qu'un `signal` amorcé dans le constructeur : l'entrée
   * `data` n'est pas encore posée à la construction, et l'amorcer dans une
   * micro-tâche laisse une fenêtre où les champs sont vides — assez pour qu'un
   * « Enregistrer » précoce parte avec un nom vide, donc désarmé. La valeur est
   * ici juste dès la première lecture, et reste modifiable.
   */
  protected readonly draftName = linkedSignal(() => this.category().name.fr);
  protected readonly draftChannels = linkedSignal<SalesChannels>(
    () => this.category().channelPreset,
  );
  protected readonly draftEmporterTva = linkedSignal(() => this.category().emporterTvaId);
  protected readonly draftSurPlaceTva = linkedSignal(() => this.category().surPlaceTvaId);

  protected readonly canSubmit = computed(() => !this.busy() && this.draftName().trim() !== '');

  protected rateLabel(rate: TvaRate): string {
    return `${rate.name} · ${formatPercent(rate.percent)}`;
  }

  protected cancel(): void {
    this.ref.close();
  }

  /**
   * Trois routes, une intention. Le nom, les canaux et les taux ont chacun leur
   * commande côté backend — c'est le découpage par SECTION du référentiel, pas
   * une maladresse — mais l'écran n'en montre qu'un seul bouton.
   *
   * Séquentiel et non parallèle : un échec doit arrêter la suite plutôt que
   * laisser trois requêtes se croiser et une famille à moitié réglée.
   */
  protected async submit(): Promise<void> {
    const category = this.category();
    await this.run(async () => {
      const name = this.draftName().trim();
      if (name !== category.name.fr) {
        await this.api.renameCategory(category.id, name);
      }
      await this.api.setCategoryChannelPreset(category.id, this.draftChannels());
      await this.api.setCategoryTva(category.id, this.draftEmporterTva(), this.draftSurPlaceTva());
      this.ref.close();
    });
  }

  protected async archive(): Promise<void> {
    await this.run(async () => {
      await this.api.archiveCategory(this.category().id);
      this.ref.close();
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (caught) {
      this.notify.refused(caught, "Le référentiel a refusé l'opération.");
    } finally {
      this.busy.set(false);
    }
  }
}
