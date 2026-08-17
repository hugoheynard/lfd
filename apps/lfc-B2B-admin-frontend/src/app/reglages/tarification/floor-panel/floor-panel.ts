import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { PriceFloorView, PriceMode, PriceScopePayload } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { formatEuros } from '@lfd/catalog-ui';

import { NotifyService } from '../../../notify.service';
import { TarificationService } from '../tarification.service';

/** Charge d'ouverture : la portée visée, ce qui y est posé, ce dont elle hérite. */
export interface FloorPanelData {
  readonly scope: PriceScopePayload;
  readonly target: string;
  /** La limite posée sur CETTE portée, ou `null`. */
  readonly current: PriceFloorView | null;
  /** Celle qui s'applique aujourd'hui — la sienne, ou celle dont elle hérite. */
  readonly inherited: PriceFloorView | null;
  /** Le prix canonique, pour montrer ce qu'une fraction donnerait. `null` sur une famille. */
  readonly canonicalCents: number | null;
}

/**
 * Panneau **Limite** — le prix ne descendra pas sous ce seuil.
 *
 * Deux choses que cet écran doit dire, parce qu'elles surprennent :
 *
 * - **poser une limite sur un article REMPLACE celle de sa famille**, elle ne
 *   s'y ajoute pas. Elle peut donc l'abaisser. C'est le geste « cet article est
 *   une exception », et il faut le voir avant de le faire — d'où le rappel de
 *   la limite héritée, juste à côté ;
 * - **une fraction suit le tarif** quand le PIM augmente ; un montant non. Le
 *   pourcentage vaut pour une marge relative, le montant pour un coût fixe connu
 *   (un emballage, une pièce achetée).
 */
@Component({
  selector: 'app-floor-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, FoldInputComponent],
  templateUrl: './floor-panel.html',
  styleUrl: './floor-panel.scss',
})
export class FloorPanel {
  private readonly tarification = inject(TarificationService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<FloorPanelData | undefined>(undefined);

  protected readonly mode = signal<PriceMode>('amount');
  /** La grandeur telle que saisie : des euros, ou des pourcents. */
  protected readonly amount = signal<number | null>(null);
  protected readonly saving = signal(false);
  private readonly seeded = signal(false);

  protected readonly target = computed(() => this.data()?.target ?? '');
  protected readonly current = computed(() => this.data()?.current ?? null);

  /**
   * La limite dont on hérite, **quand ce n'est pas la sienne**. C'est celle-là
   * qu'un remplacement fait sauter, donc c'est celle qu'il faut montrer.
   */
  protected readonly inherited = computed(() => {
    const data = this.data();
    if (data === undefined || data.inherited === null) {
      return null;
    }
    return data.inherited.id === data.current?.id ? null : data.inherited;
  });

  /**
   * Ce qu'une fraction donnerait **sur cet article** — la seule façon de juger
   * un pourcentage. « 50 % » ne dit rien tant qu'on ne voit pas 1,00 €.
   */
  protected readonly preview = computed(() => {
    const canonical = this.data()?.canonicalCents ?? null;
    const value = this.amount();
    if (canonical === null || value === null || this.mode() !== 'percent') {
      return null;
    }
    return formatEuros(Math.round((canonical * value) / 100));
  });

  /** La limite héritée, mise en forme selon son unité. */
  protected readonly inheritedLabel = computed(() => {
    const heritee = this.inherited();
    if (heritee === null) {
      return '';
    }
    return heritee.mode === 'percent'
      ? `${String(heritee.value / 100)} % du tarif`
      : formatEuros(heritee.value);
  });

  constructor() {
    // Amorçage **unique**, comme `lfd-price-alteration-field` : réamorcer à
    // chaque passage remettrait le champ à sa valeur d'origine pendant qu'on est
    // en train de le retaper.
    effect(() => {
      const current = this.data()?.current ?? null;
      if (untracked(this.seeded) || current === null) {
        return;
      }
      this.seeded.set(true);
      this.mode.set(current.mode);
      this.amount.set(current.value / 100);
    });
  }

  protected setMode(mode: PriceMode): void {
    this.mode.set(mode);
  }

  protected setAmount(value: string): void {
    const parsed = Number.parseFloat(value.replace(',', '.'));
    this.amount.set(value.trim() === '' || Number.isNaN(parsed) ? null : parsed);
  }

  protected readonly canSubmit = computed(() => {
    const value = this.amount();
    if (value === null || value <= 0) {
      return false;
    }
    // Au-delà de 100 %, ce n'est plus un plancher : ça relèverait TOUS les prix,
    // y compris ceux qu'aucune règle n'a touchés. Le serveur le refuse aussi ;
    // le dire ici évite un aller-retour pour une faute évidente.
    return this.mode() !== 'percent' || value <= 100;
  });

  protected async submit(): Promise<void> {
    const scope = this.data()?.scope;
    const value = this.amount();
    if (scope === undefined || value === null || !this.canSubmit() || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.tarification.setFloor({
        scope,
        mode: this.mode(),
        value: Math.round(value * 100),
        // Le MUR seul. La porte — un plancher plus bas déverrouillé par le
        // volume — est acceptée par le serveur mais pas encore saisissable ici :
        // envoyer `null` explicitement plutôt que d'omettre le champ, pour que
        // re-poser une limite n'efface pas une porte par inadvertance… et pour
        // que le jour où l'écran la propose, ce soit une décision visible.
        dynamic: null,
      });
      this.notify.success('Limite posée.');
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error, "La limite n'a pas pu être posée.");
    } finally {
      this.saving.set(false);
    }
  }

  /** Retire la limite : la portée retombe sur celle dont elle hérite, ou sur rien. */
  protected async remove(): Promise<void> {
    const scope = this.data()?.scope;
    if (scope === undefined || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.tarification.removeFloor(scope);
      this.notify.success('Limite retirée.');
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error, "La limite n'a pas pu être retirée.");
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
