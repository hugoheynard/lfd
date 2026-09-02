import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DeliveryChangeView, PendingDeliveryView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { ReceptionService } from './reception.service';

/** Les champs, dits en français — un écran qui affiche `vatRate` ne se relit pas. */
const FIELDS: Readonly<Record<string, string>> = {
  name: 'nom',
  price: 'prix',
  vatRate: 'taux de TVA',
  weight: 'poids',
  category: 'famille',
  allergens: 'allergènes',
};

/** Ce que l'arrivée fait à un article, dit comme on le lit. */
const KINDS: Readonly<Record<DeliveryChangeView['kind'], string>> = {
  added: 'entre au catalogue',
  removed: 'sort du catalogue',
  changed: 'modifié',
};

/**
 * **Relire ce que le référentiel a livré, avant que ça se vende.**
 *
 * L'écran qui manquait, et sans lequel la boîte de réception ne peut pas
 * s'ouvrir : `B2B_DELIVERY_INBOX` sans lui gèlerait le catalogue B2B sur son
 * état courant, en silence.
 *
 * ## Écarter plutôt que bloquer
 *
 * Le tout-ou-rien serait plus simple à écrire et impraticable : un catalogue
 * dont **un** article porte un prix faux ne se validerait pas, et plus le
 * catalogue grossit, plus la probabilité qu'un article annule la relecture des
 * autres monte. Ici un article s'écarte, les autres passent, et l'arrivée est
 * close en une fois — il n'existe jamais d'arrivée à moitié validée.
 *
 * ⚠️ Écarter un article qui **sort** revient à le garder. C'est le geste où l'on
 * tient le plus à décider soi-même, et le libellé le dit plutôt que de laisser
 * deviner.
 */
@Component({
  selector: 'app-reception-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './reception-page.html',
  styleUrl: './reception-page.scss',
})
export class ReceptionPage {
  private readonly reception = inject(ReceptionService);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly delivery = signal<PendingDeliveryView | null>(null);
  protected readonly busy = signal(false);
  /** Les SKU que l'opérateur écarte — vidés à chaque rechargement. */
  private readonly excluded = signal<ReadonlySet<string>>(new Set());

  constructor() {
    void this.load();
  }

  protected readonly changes = computed(() =>
    (this.delivery()?.changes ?? []).map((change) => ({
      sku: change.sku,
      name: change.name ?? change.sku,
      kind: KINDS[change.kind],
      /** Un article qui entre ou qui sort n'a pas de champ à nommer. */
      fields: change.fields.map((field) => FIELDS[field] ?? field).join(', '),
      /** Le libellé change de sens sur un retrait : écarter, c'est GARDER. */
      excludeLabel: change.kind === 'removed' ? 'Garder cet article' : 'Écarter ce changement',
      excluded: this.excluded().has(change.sku),
    })),
  );

  protected readonly excludedCount = computed(() => this.excluded().size);

  protected readonly acceptedCount = computed(
    () => (this.delivery()?.changes.length ?? 0) - this.excludedCount(),
  );

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.delivery.set(await this.reception.pending());
      // Une relecture repart à zéro : garder les exclusions d'une arrivée
      // précédente ferait écarter des articles que personne n'a regardés.
      this.excluded.set(new Set());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected toggle(sku: string, excluded: boolean): void {
    const next = new Set(this.excluded());
    if (excluded) {
      next.add(sku);
    } else {
      next.delete(sku);
    }
    this.excluded.set(next);
  }

  protected async accept(): Promise<void> {
    const pending = this.delivery();
    if (pending === null) {
      return;
    }
    this.busy.set(true);
    try {
      await this.reception.accept(pending.id, [...this.excluded()]);
      this.notify.success('Arrivée validée — le catalogue est à jour.');
      // On RECHARGE plutôt que de vider l'écran : une nouvelle livraison a pu
      // arriver entre-temps, et laisser l'écran vide la ferait manquer.
      await this.load();
    } catch (caught) {
      // `notify.error` lit l'enveloppe : le refus du serveur est en français
      // dedans — « cette arrivée a été remplacée par une livraison plus
      // récente : rechargez l'écran ».
      this.notify.error(caught, 'Validation impossible.');
      // Un refus vient presque toujours d'une arrivée remplacée : recharger
      // remet l'écran sur ce qui attend VRAIMENT, au lieu de laisser réessayer
      // sur une arrivée qui n'existe plus.
      await this.load();
    } finally {
      this.busy.set(false);
    }
  }
}
