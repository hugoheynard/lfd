import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  FoldButtonComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import {
  type DayPart,
  isSlotOpen,
  type OrderSlot,
  ORDER_SLOTS,
} from '../../../client/mock-station';

/** Ce que l'ouvrant doit dire au panneau : quel chemin, et vers où. */
export interface SlotRequest {
  readonly mode: 'pickup' | 'delivery';
  /** Le point de retrait ou l'adresse — le panneau le rappelle en sous-titre. */
  readonly place: string;
}

/**
 * Le choix du créneau — la dernière question avant la boutique.
 *
 * C'est un panneau fold et non un dialogue centré, à dessein : sur un téléphone
 * `side="auto"` en fait une feuille montante, la forme native pour un choix
 * dans une grille ; sur un bureau, un tiroir latéral qui laisse voir ce qu'on
 * vient de choisir. Un dialogue centré aurait masqué les deux.
 *
 * Le `data-theme` est porté par le panneau lui-même : un hôte de panneaux rend
 * hors de l'arbre qui l'a ouvert, et rien ne garantit qu'il vive sous le thème
 * client. Le déclarer ici, c'est la seule façon de ne pas dépendre de l'endroit
 * où on l'a monté.
 */
@Component({
  selector: 'app-slot-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-theme': 'lfc-app' },
  imports: [FoldButtonComponent, FoldPanelHeaderComponent],
  templateUrl: './slot-panel.html',
  styleUrl: './slot-panel.scss',
})
export class SlotPanel {
  /** Feuille montante sur étroit, tiroir sur large — piloté par fold. */
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', surface: 'solid' };

  readonly data = input.required<SlotRequest>();

  private readonly ref = inject<FoldPanelRef<OrderSlot>>(FoldPanelRef);
  protected readonly t = inject(ClientCopyService).t;

  protected readonly pickedId = signal<string | null>(null);

  protected readonly title = computed(() => {
    const c = this.t().slotPanel;
    return this.data().mode === 'pickup' ? c.pickupTitle : c.deliveryTitle;
  });

  protected readonly intro = computed(() => {
    const c = this.t().slotPanel;
    const sentence = this.data().mode === 'pickup' ? c.pickupIntro : c.deliveryIntro;
    return fill(sentence, { place: this.data().place });
  });

  protected readonly groups = computed(() => {
    const c = this.t().slotPanel;
    const label: Record<OrderSlot['state'], string> = {
      'first-batch': c.firstBatch,
      free: c.free,
      full: c.full,
      'second-batch': c.secondBatch,
      'labo-only': c.laboOnly,
    };
    const of = (part: DayPart): readonly (OrderSlot & { sub: string; open: boolean })[] =>
      ORDER_SLOTS.filter((slot) => slot.part === part).map((slot) => ({
        ...slot,
        sub: label[slot.state],
        open: isSlotOpen(slot),
      }));
    return [
      { id: 'am', title: c.amGroup, slots: of('am') },
      { id: 'pm', title: c.pmGroup, slots: of('pm') },
    ];
  });

  private readonly picked = computed(
    () => ORDER_SLOTS.find((slot) => slot.id === this.pickedId()) ?? null,
  );

  protected readonly ctaLabel = computed(() => {
    const slot = this.picked();
    const c = this.t().slotPanel;
    return slot ? fill(c.cta, { slot: slot.label }) : c.ctaIdle;
  });

  protected readonly ready = computed(() => this.picked() !== null);

  protected pick(slot: OrderSlot): void {
    if (isSlotOpen(slot)) {
      this.pickedId.set(slot.id);
    }
  }

  protected confirm(): void {
    const slot = this.picked();
    if (slot) {
      this.ref.close(slot);
    }
  }
}
