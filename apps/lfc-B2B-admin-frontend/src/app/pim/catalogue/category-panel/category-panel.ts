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
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { NO_CHANNELS, formatPercent, sellsMode } from '../../data/channels';
import { ChannelMatrix } from '../channel-matrix/channel-matrix';
import { CatalogueApi, type Category, type SalesChannels, type TvaRate } from '../catalogue-api';
import type { CategoryTvaDraft } from '../category-http-api';
import { CategoryStore } from '../category-store';
import { EmplacementStore } from '../../emplacements/emplacement-store';

/**
 * Charge passée à `open()` : les taux disponibles, et la famille à régler —
 * **absente en création**. Même panneau, deux intentions : la page n'a plus de
 * second formulaire à tenir à jour quand un réglage bouge.
 */
export interface CategoryPanelData {
  readonly rates: readonly TvaRate[];
  readonly category?: Category;
}

/**
 * Panneau **famille** : nom, canaux par défaut, taux de TVA — et l'archivage
 * dans sa zone dangereuse, au bas du même panneau. Sans `category` dans sa
 * charge, le même panneau **crée** : la page portait pour ça un formulaire à
 * deux champs, qui ne proposait ni canaux ni taux et laissait donc toute
 * famille naître incomplète, à régler dans un second écran.
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
    FoldPanelBodyComponent,
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
  private readonly emplacementStore = inject(EmplacementStore);
  private readonly categoryStore = inject(CategoryStore);

  readonly data = input<CategoryPanelData | undefined>(undefined);

  protected readonly busy = signal(false);

  /** La famille visée — `undefined` en création. */
  protected readonly existing = computed<Category | undefined>(() => this.data()?.category);
  protected readonly isCreate = computed(() => this.existing() === undefined);

  protected readonly heading = computed(() => this.existing()?.name.fr ?? 'Nouvelle famille');
  protected readonly subtitle = computed(() =>
    this.isCreate() ? 'Ajouter au référentiel' : 'Réglage de la famille',
  );
  protected readonly submitLabel = computed(() =>
    this.isCreate() ? 'Créer la famille' : 'Enregistrer',
  );

  protected readonly rates = computed<readonly TvaRate[]>(() => this.data()?.rates ?? []);
  /**
   * Les parents proposables. Le référentiel n'expose pas de déplacement, donc
   * le parent ne se choisit qu'à la création — le montrer en édition offrirait
   * un réglage que rien n'enregistrerait.
   */
  protected readonly parents = computed(() =>
    this.categoryStore.items().filter((item) => !item.isArchived),
  );
  /** Les points de vente à proposer — la liste du référentiel, jamais une constante. */
  protected readonly emplacements = computed(() => this.emplacementStore.items());
  protected readonly emplacementsError = computed(() => this.emplacementStore.loadError());
  protected readonly activeProducts = computed(() => this.existing()?.activeProductCount ?? 0);

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
  protected readonly draftName = linkedSignal(() => this.existing()?.name.fr ?? '');
  protected readonly draftChannels = linkedSignal<SalesChannels>(
    () => this.existing()?.channelPreset ?? NO_CHANNELS,
  );
  protected readonly draftEmporterTva = linkedSignal(() => this.existing()?.emporterTvaId ?? '');
  protected readonly draftSurPlaceTva = linkedSignal(() => this.existing()?.surPlaceTvaId ?? '');
  protected readonly draftB2bTva = linkedSignal(() => this.existing()?.b2bTvaId ?? '');
  /** Création seulement : `''` = racine. */
  protected readonly draftParent = signal('');

  /**
   * Un taux ne se règle que pour un canal qu'on vend.
   *
   * « À emporter » et « sur place » se déclinent par boutique : le taux
   * concerne le MODE, donc il suffit qu'une boutique le propose. Le B2B est
   * une case unique.
   */
  protected readonly sellsEmporter = computed(() => sellsMode(this.draftChannels(), 'emporter'));
  protected readonly sellsSurPlace = computed(() => sellsMode(this.draftChannels(), 'surPlace'));
  protected readonly sellsB2b = computed(() => this.draftChannels().b2b);

  /** Aucun canal coché ⇒ la section des taux n'a rien à montrer. */
  protected readonly hasAnyChannel = computed(
    () => this.sellsEmporter() || this.sellsSurPlace() || this.sellsB2b(),
  );

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
    await this.run(async () => {
      const existing = this.existing();
      const id = existing === undefined ? await this.createFamily() : await this.rename(existing);
      await this.api.setCategoryChannelPreset(id, this.draftChannels());
      await this.api.setCategoryTva(id, this.tvaToSave());
      this.ref.close();
    });
  }

  /**
   * La création rend l'identifiant, et le reste du panneau s'enregistre dessus
   * comme pour une famille existante : canaux et taux partent dans la foulée,
   * au lieu de naître vides et d'attendre un second passage.
   */
  private async createFamily(): Promise<string> {
    const nameFr = this.draftName().trim();
    const parentId = this.draftParent();
    const created = await this.api.createCategory(
      parentId === '' ? { nameFr } : { nameFr, parentId },
    );
    return created.id;
  }

  private async rename(category: Category): Promise<string> {
    const name = this.draftName().trim();
    if (name !== category.name.fr) {
      await this.api.renameCategory(category.id, name);
    }
    return category.id;
  }

  /**
   * Les taux à enregistrer — **effacés** pour tout canal décoché.
   *
   * Masquer un champ sans effacer sa valeur laisserait la famille pointer un
   * taux qu'elle n'utilise plus : ça gonflerait le compte d'usages affiché sur
   * l'écran des taux, et la base refuserait de supprimer un taux que plus rien
   * ne facture. Ce qui n'est pas vendu ne référence rien.
   */
  private tvaToSave(): CategoryTvaDraft {
    return {
      emporter: this.sellsEmporter() ? this.draftEmporterTva() : '',
      surPlace: this.sellsSurPlace() ? this.draftSurPlaceTva() : '',
      b2b: this.sellsB2b() ? this.draftB2bTva() : '',
    };
  }

  protected async archive(category: Category): Promise<void> {
    await this.run(async () => {
      await this.api.archiveCategory(category.id);
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
