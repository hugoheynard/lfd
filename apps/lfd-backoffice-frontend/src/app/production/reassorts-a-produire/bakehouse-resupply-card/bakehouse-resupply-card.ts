import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import type { ResupplyArticleView, ResupplyTarget, SiteResupplyLineView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldComboboxComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { PickupAddressesService } from '../../../b2b/reglages/pickup-addresses.service';
import { BakehouseResuppliesService } from '../bakehouse-resupplies.service';

/** Un point proposé. */
interface SiteChoice {
  readonly id: string;
  readonly label: string;
}

/**
 * **« Envoyer un réassort »** — le fournil dit « je t'envoie ça » à un point
 * (lot R1d, `reassort-boutiques/plan-reapprovisionnement.md`, Hugo
 * 2026-10-21 : « si le comptoir demande au téléphone, le fournil peut entrer
 * la demande »). Choisir le point, la visée (aujourd'hui au plus tôt, ou
 * pour demain — sous l'heure limite du comptoir si le réassort y est
 * soumis), composer les articles au catalogue, puis « Envoyer ».
 *
 * La liste se compose À L'ÉCRAN, sans brouillon partagé : le réassort ne
 * naît qu'à l'envoi, à part de la demande en cours du comptoir, qu'il ne
 * touche jamais. Montée par la page sous `production_resupply:write`.
 */
@Component({
  selector: 'app-bakehouse-resupply-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldComboboxComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
    FoldNumberInputComponent,
  ],
  templateUrl: './bakehouse-resupply-card.html',
  styleUrl: './bakehouse-resupply-card.scss',
})
export class BakehouseResupplyCard {
  private readonly service = inject(BakehouseResuppliesService);
  private readonly pickups = inject(PickupAddressesService);

  /** Un réassort vient de partir : la page relit. */
  readonly sent = output();

  protected readonly loadFailed = signal(false);
  protected readonly sites = signal<readonly SiteChoice[]>([]);
  protected readonly articles = signal<readonly ResupplyArticleView[]>([]);
  protected readonly siteId = signal<string | null>(null);
  protected readonly target = signal<ResupplyTarget>('asap');
  protected readonly pickedSku = signal<string | null>(null);
  protected readonly pickedQuantity = signal<number | null>(null);
  protected readonly lines = signal<readonly SiteResupplyLineView[]>([]);
  protected readonly pending = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly done = signal<string | null>(null);

  protected readonly siteOptions = computed<FoldSelectOption<string>[]>(() =>
    this.sites().map((site) => ({ value: site.id, label: site.label })),
  );
  protected readonly articleOptions = computed<FoldSelectOption<string>[]>(() =>
    this.articles().map((article) => ({
      value: article.sku,
      label: `${article.name} · ${article.sku}`,
    })),
  );
  protected readonly canAdd = computed(
    () => this.pickedSku() !== null && (this.pickedQuantity() ?? 0) >= 1,
  );
  protected readonly canSend = computed(
    () => this.siteId() !== null && this.lines().length > 0 && !this.pending(),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loadFailed.set(false);
    try {
      const [sites, articles] = await Promise.all([this.pickups.list(), this.service.articles()]);
      this.sites.set(sites.map((site) => ({ id: site.id, label: site.label })));
      this.articles.set(articles);
    } catch {
      this.loadFailed.set(true);
    }
  }

  protected pickTarget(target: ResupplyTarget): void {
    this.target.set(target);
  }

  /** Ajoute à la liste ; un article déjà présent voit sa quantité s'additionner, comme au serveur. */
  protected addLine(): void {
    const sku = this.pickedSku();
    const quantity = this.pickedQuantity();
    const article = this.articles().find((candidate) => candidate.sku === sku);
    if (article === undefined || quantity === null || quantity < 1) {
      return;
    }
    this.lines.update((lines) =>
      lines.some((line) => line.sku === article.sku)
        ? lines.map((line) =>
            line.sku === article.sku ? { ...line, quantity: line.quantity + quantity } : line,
          )
        : [...lines, { sku: article.sku, label: article.name, quantity }],
    );
    this.pickedSku.set(null);
    this.pickedQuantity.set(null);
    this.done.set(null);
  }

  protected withdraw(sku: string): void {
    this.lines.update((lines) => lines.filter((line) => line.sku !== sku));
  }

  protected async send(): Promise<void> {
    const siteId = this.siteId();
    if (siteId === null || !this.canSend()) {
      return;
    }
    this.pending.set(true);
    this.failure.set(null);
    try {
      await this.service.send(siteId, {
        target: this.target(),
        lines: this.lines().map((line) => ({ sku: line.sku, quantity: line.quantity })),
      });
      const label = this.sites().find((site) => site.id === siteId)?.label ?? 'le point';
      this.lines.set([]);
      this.done.set(`Réassort envoyé à ${label}.`);
      this.sent.emit();
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "Le réassort n'a pas pu être envoyé."));
    } finally {
      this.pending.set(false);
    }
  }
}
