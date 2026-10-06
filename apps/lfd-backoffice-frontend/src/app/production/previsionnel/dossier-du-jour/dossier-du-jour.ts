import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';
import type { CatalogItemView, ProductionBatchView } from '@lfd/contracts';

import { AdminCatalogService } from '../../../commandes/catalog.service';
import { FicheProduction } from '../../fiche-production/fiche-production';
import { productionRecap, totalPieces } from '../../production-recap';
import { ProductionService } from '../../production.service';
import { DueThresholdsSection } from '../due-thresholds-section/due-thresholds-section';

type LoadState = 'loading' | 'ready' | 'error';

/** Le refus du serveur quand le plan de la journée n'est pas arrêté. */
const HTTP_CONFLICT = 409;

/** Les deux lectures d'un même lot. On ouvre sur la fabrication. */
const VIEWS: readonly FoldViewToggleOption[] = [
  { value: 'recap', label: 'Récapitulatif', icon: 'list' },
  { value: 'bons', label: 'Bons de commande', icon: 'receipt' },
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
 * Tant que le plan n'est pas arrêté, le PDF n'existe pas : le bouton est
 * désactivé et dit pourquoi. On le sait par `closed` (la matrice du parent) ;
 * hors de sa fenêtre, on ne le sait qu'au refus 409 du serveur.
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
  private readonly catalog = inject(AdminCatalogService);

  protected readonly state = signal<LoadState>('loading');
  private readonly destroyRef = inject(DestroyRef);

  /**
   * La journée du dossier. Un `model` pour que le parent la LISE (son titre la
   * nomme) sans en tenir une copie : il la lie en `[(date)]`, et c'est le même
   * signal des deux côtés.
   */
  readonly date = model<string>(defaultDossierDate());

  /**
   * Le plan de cette journée est-il arrêté ? `null` = on ne le sait pas (hors
   * de la fenêtre lue par le parent) — le bouton reste alors actif, et c'est le
   * 409 du serveur qui tranche.
   */
  readonly closed = input<boolean | null>(null);
  protected readonly view = signal<string>('recap');
  protected readonly views = VIEWS;

  private readonly batch = signal<ProductionBatchView | null>(null);
  private readonly catalogue = signal<readonly CatalogItemView[]>([]);

  protected readonly sheets = computed(() => this.batch()?.sheets ?? []);
  /**
   * 🔴 La lecture du catalogue a-t-elle échoué ?
   *
   * Elle ne fait pas tomber l'écran — le lot reste juste sans elle — mais elle
   * ne peut pas passer en silence : sans catalogue, chaque SKU tombe dans le
   * groupe des produits absents, et la feuille affirmerait que le fournil
   * fabrique des articles retirés de la vente.
   */
  protected readonly shelvesLost = signal(false);

  protected readonly recap = computed(() =>
    productionRecap(this.sheets(), this.catalogue(), !this.shelvesLost()),
  );
  protected readonly pieces = computed(() => totalPieces(this.recap()));

  /** « samedi 16 août » — l'en-tête de chaque feuille. */
  protected readonly dayLabel = computed(() =>
    DAY_LABEL.format(new Date(`${this.date()}T00:00:00`)),
  );

  /** Le téléchargement du PDF est en cours. */
  protected readonly fetching = signal(false);
  /** La dernière lecture du PDF a échoué pour une autre raison qu'un plan non arrêté. */
  protected readonly pdfFailed = signal(false);
  /** La journée que le serveur a refusée en 409 — pour la journée affichée seulement. */
  private readonly refusedDate = signal<string | null>(null);
  /**
   * L'URL objet du dernier PDF, quand le navigateur a bloqué l'onglet : on
   * propose alors de le télécharger. `null` sinon.
   */
  protected readonly blockedPdfUrl = signal<string | null>(null);

  /**
   * L'URL objet vivante. Révoquée au PDF suivant et à la destruction de
   * l'écran — pas après un délai, qui couperait un onglet encore en train de
   * charger ou garderait le fichier pour rien.
   */
  private objectUrl: string | null = null;

  /** Le plan n'est pas arrêté : il n'y a pas de dossier à tirer. */
  protected readonly notArrested = computed(
    () => this.closed() === false || (this.closed() === null && this.refusedDate() === this.date()),
  );

  /** Le nom du fichier proposé au téléchargement. */
  protected readonly fileName = computed(() => `dossier-${this.date()}.pdf`);

  constructor() {
    effect(() => {
      void this.load(this.date());
    });
    this.destroyRef.onDestroy(() => this.revoke());
  }

  protected onDate(value: string): void {
    if (value !== '') {
      this.date.set(value);
      this.pdfFailed.set(false);
      this.blockedPdfUrl.set(null);
    }
  }

  protected async load(date: string = this.date()): Promise<void> {
    this.state.set('loading');
    try {
      // Le catalogue part avec le lot : sans lui, le récapitulatif n'a pas de
      // rayons. Une lecture ratée ne doit pas faire disparaître la production —
      // mais elle ne doit pas se taire non plus, d'où le `null` plutôt qu'un
      // tableau vide : les deux se lisent pareil à l'affichage, et un seul des
      // deux est une panne.
      const [batch, catalogue] = await Promise.all([
        this.production.batch(date),
        this.catalog.list().catch(() => null),
      ]);
      this.batch.set(batch);
      this.shelvesLost.set(catalogue === null);
      this.catalogue.set(catalogue ?? []);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * Télécharge le PDF figé du serveur et l'ouvre dans un nouvel onglet. Si le
   * navigateur bloque l'onglet (`window.open` rend `null`), on garde l'URL et
   * on propose un lien de téléchargement à la place.
   */
  protected async openPdf(): Promise<void> {
    const date = this.date();
    this.fetching.set(true);
    this.pdfFailed.set(false);
    this.blockedPdfUrl.set(null);
    try {
      const blob = await this.production.dossierPdf(date);
      this.revoke();
      const url = URL.createObjectURL(blob);
      this.objectUrl = url;
      if (window.open(url, '_blank') === null) {
        this.blockedPdfUrl.set(url);
      }
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === HTTP_CONFLICT) {
        this.refusedDate.set(date);
      } else {
        this.pdfFailed.set(true);
      }
    } finally {
      this.fetching.set(false);
    }
  }

  private revoke(): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
