import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type {
  ResupplyArticleView,
  UnorderedReceiptLineView,
  UnorderedReceiptView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldComboboxComponent,
  FoldDisclosureComponent,
  FoldNumberInputComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { ResupplyReceiptsService } from '../resupply-receipts.service';

/**
 * **Le réassort sans commande** (lot R2, 2026-10-21) : ce qui arrive en
 * vitrine sans avoir été commandé, saisi ligne par ligne — la saisie de la
 * réception d'avant R2, gardée en secours et repliée en bas de la page.
 * Chaque ligne compte au stock du jour dès sa saisie ; un même article deux
 * fois est refusé (on corrige sa quantité).
 */
@Component({
  selector: 'app-unordered-receipt-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldComboboxComponent,
    FoldDisclosureComponent,
    FoldNumberInputComponent,
  ],
  templateUrl: './unordered-receipt-card.html',
  styleUrl: './unordered-receipt-card.scss',
})
export class UnorderedReceiptCard {
  private readonly service = inject(ResupplyReceiptsService);

  readonly siteId = input.required<string>();
  readonly day = input.required<string>();
  readonly receipt = input.required<UnorderedReceiptView>();
  readonly articles = input.required<readonly ResupplyArticleView[]>();
  readonly canWrite = input.required<boolean>();
  /** Un geste a réussi : la page relit. */
  readonly changed = output();

  protected readonly pending = signal(false);
  protected readonly failure = signal<string | null>(null);
  /** Ce que l'on s'apprête à ajouter : un article choisi, une quantité. */
  protected readonly pickedSku = signal<string | null>(null);
  protected readonly pickedQuantity = signal<number | null>(null);
  /** Les quantités en cours de correction, par SKU. */
  private readonly drafts = signal<ReadonlyMap<string, number | null>>(new Map());

  protected readonly lines = computed(() => this.receipt().lines);
  /** Les articles du catalogue qui ne sont pas encore sur la liste. */
  protected readonly addableOptions = computed<FoldSelectOption<string>[]>(() => {
    const present = new Set(this.lines().map((line) => line.sku));
    return this.articles()
      .filter((article) => !present.has(article.sku))
      .map((article) => ({ value: article.sku, label: `${article.name} · ${article.sku}` }));
  });
  protected readonly canAdd = computed(
    () => this.pickedSku() !== null && (this.pickedQuantity() ?? -1) >= 0 && !this.pending(),
  );

  constructor() {
    // Une relecture remet les corrections en cours à ce que le serveur dit.
    effect(() => {
      this.receipt();
      untracked(() => this.drafts.set(new Map()));
    });
  }

  protected draftOf(line: UnorderedReceiptLineView): number | null {
    const draft = this.drafts().get(line.sku);
    return draft === undefined ? line.receivedQuantity : draft;
  }

  protected setDraft(sku: string, quantity: number | null): void {
    this.drafts.update((drafts) => new Map(drafts).set(sku, quantity));
  }

  protected changedLine(line: UnorderedReceiptLineView): boolean {
    const draft = this.draftOf(line);
    return draft !== null && draft !== line.receivedQuantity;
  }

  protected async add(): Promise<void> {
    const sku = this.pickedSku();
    const quantity = this.pickedQuantity();
    if (sku === null || quantity === null) {
      return;
    }
    if (await this.act(() => this.service.receive(this.siteId(), this.day(), sku, quantity))) {
      this.pickedSku.set(null);
      this.pickedQuantity.set(null);
    }
  }

  protected async correct(line: UnorderedReceiptLineView): Promise<void> {
    const quantity = this.draftOf(line);
    if (quantity === null) {
      return;
    }
    await this.act(() => this.service.correct(this.siteId(), this.day(), line.sku, quantity));
  }

  protected async withdraw(line: UnorderedReceiptLineView): Promise<void> {
    await this.act(() => this.service.withdraw(this.siteId(), this.day(), line.sku));
  }

  /** Un geste, puis la relecture par la page. Rend `false` sur un refus, affiché avec sa raison. */
  private async act(gesture: () => Promise<void>): Promise<boolean> {
    if (this.pending()) {
      return false;
    }
    this.pending.set(true);
    this.failure.set(null);
    try {
      await gesture();
      this.changed.emit();
      return true;
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "Le geste n'a pas pu être enregistré."));
      return false;
    } finally {
      this.pending.set(false);
    }
  }
}
