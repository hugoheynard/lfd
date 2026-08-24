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
  FoldCalloutComponent,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { NO_CHANNELS, formatPercent, sellsMode } from '../../data/channels';
import { ChannelMatrix } from '../channel-matrix/channel-matrix';
import type { Category, SalesChannels, VatRate } from '../catalogue-api';
import type { CategoryVatDraft } from '../category-http-api';
import { CategoryStore } from '../category-store';
import { SalesContextStore } from '../sales-contexts/sales-context-store';
import { LocationStore } from '../../locations/location-store';

/**
 * Charge passée à `open()` : les taux disponibles, et la famille à régler —
 * **absente en création**. Même panneau, deux intentions : la page n'a plus de
 * second formulaire à tenir à jour quand un réglage bouge.
 */
export interface CategoryPanelData {
  readonly rates: readonly VatRate[];
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
    FoldCalloutComponent,
    FoldDangerZoneComponent,
    FoldElementTitleComponent,
    ChannelMatrix,
  ],
  templateUrl: './category-panel.html',
  styleUrl: './category-panel.scss',
})
export class CategoryPanel {
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);
  private readonly locationStore = inject(LocationStore);
  private readonly categoryStore = inject(CategoryStore);

  readonly data = input<CategoryPanelData | undefined>(undefined);

  protected readonly busy = signal(false);

  /** La famille visée — `undefined` en création. */
  protected readonly existing = computed<Category | undefined>(() => this.data()?.category);
  protected readonly isCreate = computed(() => this.existing() === undefined);
  /**
   * Une famille archivée est **gelée** : le référentiel refuse ses canaux, ses
   * taux et son déplacement, et n'accepte que le renommage. Le panneau offrait
   * pourtant le formulaire entier avec un bouton armé — enregistrer écrivait le
   * nom, PUIS échouait sur les canaux. Une moitié appliquée et un message
   * d'erreur : le contraire de ce que sa zone dangereuse fait trois blocs plus
   * bas, où elle refuse d'offrir un bouton dont elle sait qu'il échouera.
   */
  protected readonly isFrozen = computed(() => this.existing()?.isArchived ?? false);

  protected readonly heading = computed(() => this.existing()?.name.fr ?? 'Nouvelle famille');
  protected readonly subtitle = computed(() => {
    if (this.isCreate()) {
      return 'Ajouter au référentiel';
    }
    return this.isFrozen() ? 'Famille archivée — nom seulement' : 'Réglage de la famille';
  });
  protected readonly submitLabel = computed(() =>
    this.isCreate() ? 'Créer la famille' : 'Enregistrer',
  );

  protected readonly rates = computed<readonly VatRate[]>(() => this.data()?.rates ?? []);
  /**
   * Les parents proposables — dans les DEUX modes désormais.
   *
   * Le champ était réservé à la création faute d'appelant : `PUT :id/parent`
   * existait côté référentiel, testé, refus de cycle et de parent archivé
   * compris, et le front ne l'avait jamais câblé. Une surface qui vit sans
   * consommateur dérive de ce qu'elle sert.
   *
   * La famille elle-même est retirée de la liste : le référentiel refuserait
   * (`CategorySelfParentError`), autant ne pas l'offrir. Ses descendantes, en
   * revanche, restent proposées — le refus de cycle est du ressort du
   * référentiel, qui voit l'arbre entier ; le panneau ne voit qu'une liste.
   */
  protected readonly parents = computed(() =>
    this.categoryStore
      .items()
      .filter((item) => !item.isArchived && item.id !== this.existing()?.id),
  );
  /** Les points de vente à proposer — la liste du référentiel, jamais une constante. */
  protected readonly locations = computed(() => this.locationStore.items());
  protected readonly locationsError = computed(() => this.locationStore.loadError());
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
  /**
   * Les taux en cours de saisie, par clé de contexte. UNE carte plutôt qu'un
   * signal par contexte : le nombre de contextes est une donnée, et un signal
   * par contexte le figerait dans le code de l'écran.
   */
  protected readonly draftTva = linkedSignal<Record<string, string>>(() => ({
    ...(this.existing()?.tvaByContext ?? {}),
  }));
  /** `''` = la racine. */
  protected readonly draftParent = linkedSignal(() => this.existing()?.parentId ?? '');

  /** Le registre : l'écran ne connaît plus la liste, il l'itère. */
  private readonly contextStore = inject(SalesContextStore);

  /**
   * Les contextes **réglables ici** : ceux dont le canal est vendu.
   *
   * Un taux ne se règle que pour un canal qu'on vend — l'afficher demanderait de
   * trancher pour une vente qui n'a pas lieu, et laisserait la famille pointer
   * un taux dont personne ne se sert. « À emporter » et « sur place » se
   * déclinent par boutique : le taux concerne le MODE, donc il suffit qu'une
   * boutique le propose. Le B2B est une case unique.
   */
  protected readonly settableContexts = computed(() =>
    this.contextStore.items().filter((context) => this.sells(context.channelKey)),
  );

  /** Aucun canal coché ⇒ la section des taux n'a rien à montrer. */
  protected readonly hasAnyChannel = computed(() => this.settableContexts().length > 0);

  private sells(channelKey: string): boolean {
    const channels = this.draftChannels();
    return channelKey === 'b2b'
      ? channels.b2b
      : sellsMode(channels, channelKey === 'surPlace' ? 'surPlace' : 'emporter');
  }

  /** Le taux saisi pour un contexte — `''` tant qu'il n'est pas réglé. */
  protected vatOf(contextKey: string): string {
    return this.draftTva()[contextKey] ?? '';
  }

  protected setTvaOf(contextKey: string, rateId: string): void {
    this.draftTva.update((current) => ({ ...current, [contextKey]: rateId }));
  }

  protected readonly canSubmit = computed(() => !this.busy() && this.draftName().trim() !== '');

  protected rateLabel(rate: VatRate): string {
    return `${rate.name} · ${formatPercent(rate.percent)}`;
  }

  protected cancel(): void {
    this.ref.close();
  }

  /**
   * Une intention, un bouton. Le référentiel découpe par section — un verbe
   * pour le nom, un pour le parent, un pour les canaux, un pour les taux —
   * mais l'ORDRE de ces écritures et leur relecture unique sont une affaire de
   * persistance, pas d'écran : le store les tient.
   */
  protected async submit(): Promise<void> {
    await this.run(async () => {
      await this.categoryStore.saveSettings({
        id: this.existing()?.id ?? null,
        nameFr: this.draftName().trim(),
        settings: this.isFrozen()
          ? null
          : {
              parentId: this.draftParent() === '' ? null : this.draftParent(),
              channels: this.draftChannels(),
              vat: this.vatToSave(),
            },
      });
      this.ref.close();
    });
  }

  /**
   * Les taux à enregistrer — **seulement ceux qu'on montre**.
   *
   * Ce n'est plus l'écran qui tient la règle : l'agrégat efface le taux d'un
   * canal qu'on ferme, et refuse un taux pour un canal fermé. Ce filtrage reste
   * néanmoins nécessaire — sans lui, le panneau enverrait le taux d'un champ
   * qu'il vient de masquer, et le référentiel refuserait l'enregistrement
   * entier. On envoie ce qu'on montre.
   */
  private vatToSave(): CategoryVatDraft {
    const draft = this.draftTva();
    return Object.fromEntries(
      this.settableContexts()
        .map((context) => [context.key, draft[context.key] ?? ''] as const)
        .filter(([, rateId]) => rateId !== ''),
    );
  }

  protected async archive(category: Category): Promise<void> {
    await this.run(async () => {
      await this.categoryStore.archive(category.id);
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
