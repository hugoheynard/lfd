import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';

import { LOCALES, SOURCE_LOCALE, type Locale } from '@lfd/pim-contracts';

import {
  FoldBadgeComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldChecklistComponent,
  FoldDangerZoneComponent,
  FoldElementTitleComponent,
  FoldMeterComponent,
  type FoldChecklistItem,
  type FoldChecklistState,
  type FoldMeterTone,
} from 'fold-ng';

import { LOCALE_NAMES } from '../../../../shared/lang-switch/locale-names';
import { PointOfSaleStore } from '../../../points-of-sale/point-of-sale-store';
import { CategoryFormStore } from '../category-form-store';

/** Les langues à traduire — toutes sauf la source, qui n'est pas une traduction. */
const TRANSLATED: readonly Locale[] = LOCALES.filter((locale) => locale !== SOURCE_LOCALE);

/** Ce qu'un lecteur d'écran entend avant le libellé. La librairie livre l'anglais. */
const STATE_LABELS: Readonly<Record<FoldChecklistState, string>> = {
  done: 'Fait',
  todo: 'À faire',
  optional: 'Facultatif',
};

/**
 * Le rail droit d'une famille — ce qu'elle PÈSE, ce qui lui manque, et le seul
 * geste irréversible.
 *
 * Pas de rail « Publication » : une famille n'a pas de statut brouillon/publié,
 * seulement un archivage. Reproduire celui du produit aurait posé un cycle de
 * vie qui n'existe pas.
 *
 * ## Ce qui pèse, et ce qui ne pèse pas
 *
 * Deux natures dans la même liste, et le `fold-meter` ne mesure que la première.
 * Les lignes **requises** — un nom, au moins un canal, un taux par contexte
 * vendu — décrivent une famille utilisable : sans elles, ses fiches héritent de
 * rien. Les lignes **facultatives** — traductions, textes, visuels — se voient
 * sans peser : les compter ferait d'une famille parfaitement fonctionnelle une
 * famille à moitié pleine, et la barre annoncerait un manque là où il n'y en a
 * pas.
 */
@Component({
  selector: 'app-category-summary-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldChecklistComponent,
    FoldDangerZoneComponent,
    FoldElementTitleComponent,
    FoldMeterComponent,
  ],
  templateUrl: './summary-rail.html',
  styleUrl: './summary-rail.scss',
})
export class CategorySummaryRail {
  protected readonly store = inject(CategoryFormStore);
  private readonly points = inject(PointOfSaleStore);
  protected readonly stateLabels = STATE_LABELS;

  /** L'archivage demandé — la page navigue, le rail ne connaît pas la route. */
  readonly archived = output<void>();

  protected readonly ficheCount = computed(() => this.store.activeProducts());

  /** Le mot qui accompagne le chiffre, ACCORDÉ. « 1 fiche(s) » n'est pas une
   *  phrase, et ce chiffre est le premier que l'œil attrape. */
  protected readonly ficheWord = computed(() =>
    this.ficheCount() === 1 ? 'fiche active' : 'fiches actives',
  );

  /** Les points de vente qui vendent cette famille — NOMMÉS. « 2 points de
   *  vente » oblige à ouvrir la section pour savoir lesquels. */
  protected readonly sellingPoints = computed(() => {
    const ids = new Set(this.store.channels().map((channel) => channel.pointOfSaleId));
    return this.points.items().filter((point) => ids.has(point.id));
  });

  // ── Complétude ────────────────────────────────────────────────────────────

  /** Ce qui rend une famille UTILISABLE. Rien d'autre ne pèse dans la barre. */
  private readonly required = computed<readonly FoldChecklistItem[]>(() => {
    const contexts = this.store.settableContexts();
    const vat = this.store.vat();
    return [
      { label: 'Nom', state: this.store.name.filled() ? 'done' : 'todo' },
      { label: 'Au moins un canal', state: this.store.channels().length > 0 ? 'done' : 'todo' },
      {
        // Un taux PAR contexte vendu : un seul manquant et la famille facture
        // au hasard sur ce canal-là.
        label: contexts.length === 0 ? 'Taux de TVA' : `Taux de TVA (${String(contexts.length)})`,
        state:
          contexts.length > 0 && contexts.every((context) => (vat[context.key] ?? '') !== '')
            ? 'done'
            : 'todo',
      },
    ];
  });

  /** Ce qui enrichit sans bloquer — traductions, textes, visuels. */
  private readonly optional = computed<readonly FoldChecklistItem[]>(() => {
    const missingName = this.store.name.missing();
    // Rien tant que le français est vide : un nom qu'on n'a pas écrit ne
    // « manque » dans aucune langue, et remplirait la liste de gris avant la
    // première frappe.
    const nameLines = this.store.name.filled()
      ? TRANSLATED.map<FoldChecklistItem>((locale) => ({
          label: `Nom · ${LOCALE_NAMES[locale]}`,
          state: missingName.includes(locale) ? 'optional' : 'done',
        }))
      : [];
    return [
      ...nameLines,
      {
        label: 'Textes de présentation',
        state: this.hasTexts() && this.store.editorial.missing().length === 0 ? 'done' : 'optional',
      },
      { label: 'Visuels', state: this.store.media.items().length > 0 ? 'done' : 'optional' },
    ];
  });

  private hasTexts(): boolean {
    return Object.values(this.store.editorial.texts()).some((text) => text !== null);
  }

  protected readonly items = computed(() => [...this.required(), ...this.optional()]);
  protected readonly done = computed(
    () => this.required().filter((item) => item.state === 'done').length,
  );
  protected readonly total = computed(() => this.required().length);

  protected readonly tone = computed<FoldMeterTone>(() => {
    if (this.done() === this.total()) {
      return 'success';
    }
    return this.done() === 0 ? 'alert' : 'warning';
  });

  /**
   * Le référentiel refuse d'archiver une famille qui porte des fiches. Sans
   * action proposée, la zone dangereuse reste un cadre qui EXPLIQUE — elle
   * n'offre pas un bouton dont on sait qu'il échouera.
   */
  protected readonly canArchive = computed(() => this.ficheCount() === 0);
}
