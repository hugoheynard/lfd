import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  model,
  signal,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';
import type {
  ProductionBatchView,
  ProductionDayResuppliesView,
  ProductionGroupingView,
} from '@lfd/contracts';

import { FicheProduction } from '../../fiche-production/fiche-production';
import { productionRecap, recapSkus, resupplyPieces, totalPieces } from '../../production-recap';
import { WorkstationsService } from '../../workstations.service';
import { ProductionService } from '../../production.service';
import { DayTranchesSection } from '../day-tranches-section/day-tranches-section';
import { DueThresholdsSection } from '../due-thresholds-section/due-thresholds-section';
import { BonReassort } from './bon-reassort/bon-reassort';
import {
  DossierPrintDialog,
  type DossierPrintDialogData,
} from './dossier-print-dialog/dossier-print-dialog';
import { resupplySheetsOf } from './resupply-sheets';

type LoadState = 'loading' | 'ready' | 'error';

/** Les deux lectures d'un même lot. On ouvre sur la fabrication. */
const VIEWS: readonly FoldViewToggleOption[] = [
  { value: 'recap', label: 'Récapitulatif', icon: 'list' },
  { value: 'bons', label: 'Bons', icon: 'receipt' },
];

const DAY_LABEL = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** `AAAA-MM-JJ` d'un instant, en heure locale — le jour tel que l'équipe le dit. */
function isoDay(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Demain, par défaut : à la clôture, on tire le service suivant. */
export function defaultDossierDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isoDay(tomorrow);
}

/**
 * **Le dossier du jour** : ce qu'il y a à fabriquer pour une journée, et pour
 * qui — récapitulatif d'abord, puis un bon par commande.
 *
 * ## Pourquoi il vit dans le prévisionnel (déménagé le 2026-09-13)
 *
 * C'est **le même geste du soir** : on arrête le plan d'une journée, et on tire
 * son dossier dans la foulée. Il ouvrait auparavant la « Fournée du jour », aux
 * côtés de la fiche d'atelier — mais celle-ci est un écran de MATIN, allumé
 * toute la fournée, tandis que le dossier est un tirage, fait une fois, la
 * veille au soir. Les deux ne se lisent jamais en même temps.
 *
 * 🔴 **Sa journée est la SIENNE**, et ne se déduit pas de la fenêtre de sept
 * jours du prévisionnel. Deux états distincts, délibérément : la fenêtre est une
 * plage qu'on fait glisser pour voir venir, le dossier est UN service qu'on
 * tire. Les fusionner ferait imprimer le lundi parce qu'on regardait la semaine
 * qui commence lundi. D'où son propre sélecteur, et son propre défaut — demain,
 * le service suivant.
 *
 * ## Le papier est le PDF du serveur (2026-10-06)
 *
 * « Imprimer le dossier » ouvre le PDF que le serveur a figé à l'arrêt du plan
 * et archivé (`GET …/batch/:date/dossier.pdf`), dans un nouvel onglet : c'est
 * le visualiseur du navigateur qui imprime le vrai papier. Jusqu'au 2026-10-06,
 * le bouton appelait `window.print()` sur cet écran, et une feuille
 * `@media print` tentait d'en effacer le menu de l'app ; elle est retirée, et
 * plus rien ici n'imprime. Les onglets récap/bons restent un **aperçu** à lire.
 *
 * Le bouton ouvre la fenêtre d'impression (`DossierPrintDialog`) : avant
 * l'arrêt, elle tire une impression provisoire numérotée ; après, des parties
 * du dossier figé. L'écran garde l'URL objet du PDF ouvert.
 *
 * La production n'a pas d'écran de suivi, et le papier ne répond pas : si
 * l'imprimante manque de feuilles, une commande cesse d'exister pour le fournil
 * sans que personne l'apprenne. D'où le lot **compté**, chaque bon **numéroté**,
 * et un tirage **reproductible à l'identique** (ordre par référence, commandes
 * déjà remises conservées).
 *
 * Le lot est **exhaustif par construction** : aucune commande ne peut être
 * passée sans jour de retrait/livraison. Rien à signaler ici sur les commandes
 * qui manqueraient — il ne peut pas y en avoir.
 */
@Component({
  selector: 'app-dossier-du-jour',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BonReassort,
    DayTranchesSection,
    DueThresholdsSection,
    FicheProduction,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './dossier-du-jour.html',
  styleUrl: './dossier-du-jour.scss',
})
export class DossierDuJour {
  private readonly production = inject(ProductionService);
  private readonly workstations = inject(WorkstationsService);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly state = signal<LoadState>('loading');
  private readonly destroyRef = inject(DestroyRef);

  /**
   * La journée du dossier. Un `model` pour que le parent la LISE (son titre la
   * nomme) sans en tenir une copie : il la lie en `[(date)]`, et c'est le même
   * signal des deux côtés.
   */
  readonly date = model<string>(defaultDossierDate());

  protected readonly view = signal<string>('recap');
  protected readonly views = VIEWS;

  private readonly batch = signal<ProductionBatchView | null>(null);
  /** Le rangement servi des SKU du lot (plan des postes, § 3.7). `null` : pas lu. */
  private readonly grouping = signal<ProductionGroupingView | null>(null);

  protected readonly sheets = computed(() => this.batch()?.sheets ?? []);
  /**
   * 🔴 Le rangement ou les rayons n'ont-ils pas pu être lus ?
   *
   * Elle ne fait pas tomber l'écran — le lot reste juste sans eux — mais elle
   * ne peut pas passer en silence : sans rayons, chaque SKU tombe dans un
   * groupe « Rayon inconnu ».
   */
  protected readonly shelvesLost = signal(false);
  /** En mode prod, les postes n'ont pas pu être lus : le lot est rangé par rayon. */
  protected readonly workstationsLost = computed(
    () => this.grouping()?.workstationsKnown === false,
  );

  /**
   * Les réassorts (R3d) : figés à l'arrêt, envoyés sinon ; dans les fiches de
   * poste et un bon chacun (R3d-bis). `null` : non lus, ou `resuppliesLost`.
   */
  private readonly resupplies = signal<ProductionDayResuppliesView | null>(null);
  protected readonly resuppliesLost = signal(false);
  protected readonly resupplySheets = computed(() =>
    resupplySheetsOf(this.resupplies()?.resupplies ?? []),
  );

  /** Les fiches de poste : commandes + réassorts, total d'abord (R3d-bis). */
  protected readonly recap = computed(() =>
    productionRecap(this.sheets(), this.grouping(), this.resupplySheets()),
  );
  protected readonly pieces = computed(() => totalPieces(this.recap()));
  protected readonly resupplyPieces = computed(() => resupplyPieces(this.recap()));
  /** Les réassorts affichés sont-ils la copie figée à l'arrêt ? */
  protected readonly resuppliesFrozen = computed(() => this.resupplies()?.frozen ?? false);
  /** Rien à montrer : ni commande, ni réassort. */
  protected readonly empty = computed(
    () => this.sheets().length === 0 && this.resupplySheets().length === 0,
  );

  /** « samedi 16 août » — l'en-tête de chaque feuille. */
  protected readonly dayLabel = computed(() =>
    DAY_LABEL.format(new Date(`${this.date()}T00:00:00`)),
  );

  /**
   * L'URL objet vivante. Révoquée au PDF suivant et à la destruction de
   * l'écran — pas après un délai, ni à la fermeture de la fenêtre
   * d'impression, qui couperaient un onglet encore en train de charger.
   */
  private objectUrl: string | null = null;

  constructor() {
    effect(() => {
      void this.load(this.date());
    });
    this.destroyRef.onDestroy(() => this.revoke());
  }

  protected onDate(value: string): void {
    if (value !== '') {
      this.date.set(value);
    }
  }

  protected async load(date: string = this.date()): Promise<void> {
    this.state.set('loading');
    try {
      const [batch, resupplies] = await Promise.all([
        this.production.batch(date),
        this.readResupplies(date),
      ]);
      // Le rangement des SKU affichés, demandé au serveur : une lecture ratée
      // ne fait pas disparaître la production, mais elle se dit (`shelvesLost`).
      const grouping = await this.readGrouping(
        recapSkus(batch.sheets, resupplySheetsOf(resupplies?.resupplies ?? [])),
      );
      this.batch.set(batch);
      this.resupplies.set(resupplies);
      this.resuppliesLost.set(resupplies === null);
      this.shelvesLost.set(grouping === undefined || grouping?.shelvesKnown === false);
      this.grouping.set(grouping ?? null);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * Le rangement de ces SKU ; `null` s'il n'y a rien à ranger, `undefined` si
   * la lecture a échoué.
   */
  private async readGrouping(
    skus: readonly string[],
  ): Promise<ProductionGroupingView | null | undefined> {
    if (skus.length === 0) {
      return null;
    }
    try {
      return await this.workstations.grouping(skus);
    } catch {
      return undefined;
    }
  }

  /**
   * Les réassorts, ou `null` si leur lecture échoue : elle ne fait pas tomber
   * le lot des commandes, mais elle se dit (`resuppliesLost`).
   */
  private async readResupplies(date: string): Promise<ProductionDayResuppliesView | null> {
    try {
      return await this.production.dayResupplies(date);
    } catch {
      return null;
    }
  }

  /** Ouvre la fenêtre d'impression de la journée affichée. */
  protected openPrintDialog(): void {
    this.panels.open<DossierPrintDialogData>(DossierPrintDialog, {
      data: {
        date: this.date(),
        dayLabel: this.dayLabel(),
        present: (pdf) => this.present(pdf),
      },
    });
  }

  /**
   * Ouvre un PDF dans un nouvel onglet. Si le navigateur bloque l'onglet
   * (`window.open` rend `null`), rend l'URL pour que la fenêtre propose de le
   * télécharger ; `null` sinon.
   */
  private present(pdf: Blob): string | null {
    this.revoke();
    const url = URL.createObjectURL(pdf);
    this.objectUrl = url;
    return window.open(url, '_blank') === null ? url : null;
  }

  private revoke(): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
