import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { CatalogItemView, PriceTemplateKind, PriceTemplateView } from '@lfd/contracts';
import { formatEuros } from '@lfd/catalog-ui';
import {
  FoldButtonComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldSelectComponent,
} from 'fold-ng';

import { AdminCatalogService } from '../../../commandes/catalog.service';
import { NotifyService } from '../../../notify.service';
import { PriceTemplatesService } from '../templates.service';
import { draftFrom, eurosField, toPayloadLines, type DraftLine } from './gabarit-draft';

/** Charge d'ouverture : la nature, et le gabarit à réviser s'il y en a un. */
export interface GabaritPanelData {
  readonly kind: PriceTemplateKind;
  /** `null` = composer. Sinon on révise celui-là. */
  readonly template: PriceTemplateView | null;
}

/**
 * **Composer ou réviser une grille de prix.**
 *
 * Un seul panneau pour les deux gestes, et pour les deux natures : la grille est
 * la même chose dans tous les cas. Ce qui change est ce qu'on en fait ensuite,
 * et cela se décide sur la liste.
 *
 * **Le prix fixe n'a pas de mode.** Ajouter une ligne pose un palier « à partir
 * de 1 » ; c'est déjà un prix fixe. Ajouter un second palier en fait une grille.
 * Un sélecteur « fixe / paliers » aurait suggéré deux objets là où il n'y en a
 * qu'un — et aurait fallu décider ce qu'il advient des paliers quand on rebascule
 * sur « fixe ».
 *
 * La colonne **catalogue** est là dès la saisie, pas seulement à la relecture :
 * c'est au moment de taper 0,80 € qu'on a besoin de savoir qu'il est à 1,00 €.
 */
@Component({
  selector: 'app-gabarit-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, FoldInputComponent, FoldSelectComponent],
  templateUrl: './gabarit-panel.html',
  styleUrl: './gabarit-panel.scss',
})
export class GabaritPanel {
  private readonly ref = inject(FoldPanelRef<boolean>);
  private readonly templates = inject(PriceTemplatesService);
  private readonly catalogService = inject(AdminCatalogService);
  private readonly notify = inject(NotifyService);

  readonly data = input<GabaritPanelData | undefined>(undefined);

  protected readonly euros = formatEuros;

  protected readonly saving = signal(false);
  protected readonly catalog = signal<readonly CatalogItemView[]>([]);
  protected readonly label = signal('');
  protected readonly lines = signal<readonly DraftLine[]>([]);
  /** L'article qu'on s'apprête à ajouter. */
  protected readonly pick = signal('');

  protected readonly heading = computed(() =>
    (this.data()?.template ?? null) === null ? 'Composer un gabarit' : 'Réviser le gabarit',
  );

  /** Ce que le catalogue propose encore : on n'ajoute pas deux fois le même article. */
  protected readonly addable = computed(() => {
    const taken = new Set(this.lines().map((line) => line.sku));
    return this.catalog().filter((item) => !taken.has(item.sku));
  });

  protected readonly canSave = computed(
    () => this.label().trim() !== '' && this.lines().length > 0 && !this.saving(),
  );

  constructor() {
    void this.loadCatalog();
    // La charge arrive par un `input()`, donc APRÈS la construction : le
    // brouillon se sème dans un effet plutôt que dans un initialiseur, qui
    // lirait `undefined` et ouvrirait un panneau de révision vide.
    effect(() => {
      const template = this.data()?.template ?? null;
      if (template !== null) {
        this.label.set(template.label);
        this.lines.set(draftFrom(template));
      }
    });
  }

  private async loadCatalog(): Promise<void> {
    try {
      const catalog = await this.catalogService.list();
      this.catalog.set(catalog);
      this.pick.set(catalog[0]?.sku ?? '');
    } catch (error) {
      this.notify.error(error, "Le catalogue n'a pas pu être chargé.");
    }
  }

  /**
   * Ajouter un article, avec **un palier à partir de 1** déjà posé — donc un
   * prix fixe, préparé au tarif catalogue. Partir du catalogue plutôt que du
   * vide : une grille se négocie en descendant depuis un prix connu.
   */
  protected addLine(): void {
    const item = this.catalog().find((candidate) => candidate.sku === this.pick());
    if (item === undefined) {
      return;
    }
    this.lines.update((lines) => [
      ...lines,
      {
        sku: item.sku,
        productName: item.name,
        catalogPriceCents: item.unitPriceCents,
        tiers: [{ minQuantity: '1', unitPrice: eurosField(item.unitPriceCents) }],
      },
    ]);
    this.pick.set(this.addable()[0]?.sku ?? '');
  }

  protected removeLine(sku: string): void {
    this.lines.update((lines) => lines.filter((line) => line.sku !== sku));
  }

  /** Un palier de plus : c'est ce geste, et lui seul, qui fait passer de fixe à grille. */
  protected addTier(sku: string): void {
    this.lines.update((lines) =>
      lines.map((line) =>
        line.sku === sku
          ? { ...line, tiers: [...line.tiers, { minQuantity: '', unitPrice: '' }] }
          : line,
      ),
    );
  }

  protected removeTier(sku: string, index: number): void {
    this.lines.update((lines) =>
      lines.map((line) =>
        line.sku === sku
          ? { ...line, tiers: line.tiers.filter((_, position) => position !== index) }
          : line,
      ),
    );
  }

  protected setTier(
    sku: string,
    index: number,
    field: 'minQuantity' | 'unitPrice',
    value: string,
  ): void {
    this.lines.update((lines) =>
      lines.map((line) =>
        line.sku === sku
          ? {
              ...line,
              tiers: line.tiers.map((tier, position) =>
                position === index ? { ...tier, [field]: value } : tier,
              ),
            }
          : line,
      ),
    );
  }

  /**
   * Enregistrer.
   *
   * Le serveur refuse une grille qui monte, deux paliers au même seuil, deux
   * lignes sur un article — et c'est **volontairement** lui qui les refuse : ces
   * invariants valent aussi pour un import et un rattrapage, pas seulement pour
   * cet écran. Ici on ne bloque que sur ce que l'écran est seul à savoir : une
   * saisie qui ne se lit pas.
   */
  protected async save(): Promise<void> {
    const data = this.data();
    const lines = toPayloadLines(this.lines());
    if (lines === null || data === undefined) {
      this.notify.error(
        new Error('Saisie incomplète'),
        'Un palier est à moitié rempli : complétez la quantité et le prix, ou videz les deux.',
      );
      return;
    }
    this.saving.set(true);
    try {
      const payload = { kind: data.kind, label: this.label().trim(), lines };
      if ((data.template ?? null) === null) {
        await this.templates.compose(payload);
      } else {
        await this.templates.revise(data.template?.id ?? '', payload);
      }
      this.notify.success('Gabarit enregistré.');
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error, "Le gabarit n'a pas pu être enregistré.");
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
