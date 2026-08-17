import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { AuthoredPriceStage, CreatePriceRulePayload, PriceScopePayload } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldSelectComponent,
} from 'fold-ng';

import { PriceAlterationField, type PriceAlteration } from '@lfd/b2b-ui/pricing';

import { NotifyService } from '../../../notify.service';
import { TarificationService } from '../tarification.service';

/** Charge d'ouverture : sur quoi la règle porte, et comment le dire à l'écran. */
export interface RulePanelData {
  readonly scope: PriceScopePayload;
  /** Ce que l'écran appelle cette cible — « Viennoiseries », « Croissant ». */
  readonly target: string;
}

/**
 * Les étages **saisissables ici**.
 *
 * La mercuriale n'y est pas, et c'est une décision : elle vise un client, et
 * choisir un client est un écran à part (S5). L'offrir sans le sélecteur aurait
 * produit des tarifs négociés ouverts à tous — soit exactement le contraire de
 * ce qu'une mercuriale est.
 *
 * Le **volume** n'y est plus non plus, et pour une raison plus forte : il ne
 * s'écrit pas règle par règle. Une remise de volume est une échelle entière —
 * elle se pose par le bouton « Barème », qui garantit que commander plus
 * n'accorde jamais moins. Tant que les deux chemins coexistaient, on pouvait
 * poser ici un palier isolé qui l'emportait sur le barème de la même cible.
 */
const STAGES: readonly { readonly value: AuthoredPriceStage; readonly label: string }[] = [
  { value: 'promotion', label: 'Promotion — une opération datée' },
  { value: 'geste', label: 'Geste — un cas particulier' },
];

/** Ce que la règle fait au prix : elle en pose un, ou elle modifie l'entrant. */
type Nature = 'alter' | 'replace';

/**
 * Panneau **Altération de prix** — pose une règle sur une portée déjà choisie
 * (la famille, ou l'article) par le bouton qui a ouvert ce panneau.
 *
 * Trois choses que l'écran doit dire, et qu'il dit :
 *
 * - **le sens n'est PAS verrouillé.** C'est le premier écran où il ne l'est pas :
 *   un supplément produit (préparation spéciale, conditionnement) vit dans le
 *   même étage qu'une remise, donc le sens est une donnée et non une propriété
 *   de l'emplacement ;
 * - **poser un prix ≠ le modifier.** Un montant en euros ne suit pas les hausses
 *   du tarif de liste ; un pourcentage les suit. Les deux sont légitimes, et
 *   c'est à celui qui saisit de choisir lequel il veut ;
 * - **la fenêtre est obligatoire à son début, ouverte à sa fin.** Une règle sans
 *   date de départ serait une règle qu'on ne sait pas dater après coup.
 */
@Component({
  selector: 'app-rule-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldButtonComponent,
    FoldInputComponent,
    FoldSelectComponent,
    PriceAlterationField,
  ],
  templateUrl: './rule-panel.html',
  styleUrl: './rule-panel.scss',
})
export class RulePanel {
  private readonly tarification = inject(TarificationService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<RulePanelData | undefined>(undefined);

  protected readonly stages = STAGES;

  protected readonly stage = signal<AuthoredPriceStage>('promotion');
  protected readonly nature = signal<Nature>('alter');
  protected readonly label = signal('');
  protected readonly alteration = signal<PriceAlteration | null>(null);
  /** Le prix posé, en euros tels que saisis. */
  protected readonly amount = signal<number | null>(null);
  protected readonly validFrom = signal(today());
  protected readonly validTo = signal('');
  protected readonly saving = signal(false);

  protected readonly target = computed(() => this.data()?.target ?? '');

  protected readonly canSubmit = computed(() => {
    if (this.label().trim() === '' || this.validFrom() === '') {
      return false;
    }
    return this.nature() === 'replace' ? this.amount() !== null : this.alteration() !== null;
  });

  protected setStage(stage: string): void {
    const match = STAGES.find((candidate) => candidate.value === stage);
    if (match !== undefined) {
      this.stage.set(match.value);
    }
  }

  protected setNature(nature: Nature): void {
    this.nature.set(nature);
  }

  protected setAmount(value: string): void {
    const parsed = Number.parseFloat(value.replace(',', '.'));
    this.amount.set(value.trim() === '' || Number.isNaN(parsed) ? null : parsed);
  }

  protected async submit(): Promise<void> {
    const scope = this.data()?.scope;
    const payload = scope === undefined ? null : this.buildPayload(scope);
    if (payload === null || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.tarification.createRule(payload);
      this.notify.success('Règle tarifaire posée.');
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error, "La règle n'a pas pu être posée.");
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }

  /**
   * L'audience est **`all`**, sans choix offert : viser un client est le geste de
   * la mercuriale, qui a son propre écran. Un sélecteur ici aurait permis de
   * poser une promotion réservée à quelqu'un — une mercuriale déguisée, rangée
   * au mauvais étage, donc composée au lieu de remplacer.
   */
  private buildPayload(scope: PriceScopePayload): CreatePriceRulePayload | null {
    const effect = this.buildEffect();
    if (effect === null) {
      return null;
    }
    return {
      stage: this.stage(),
      scope,
      audience: { type: 'all', id: null },
      // Aucun seuil : le seul étage qui lisait un palier de quantité était le
      // volume, et il se pose désormais en barème.
      minQuantity: null,
      effect,
      label: this.label().trim(),
      validFrom: new Date(`${this.validFrom()}T00:00:00.000Z`).toISOString(),
      validTo:
        this.validTo() === '' ? null : new Date(`${this.validTo()}T00:00:00.000Z`).toISOString(),
    };
  }

  private buildEffect(): CreatePriceRulePayload['effect'] | null {
    if (this.nature() === 'replace') {
      const amount = this.amount();
      return amount === null ? null : { nature: 'replace', amountCents: Math.round(amount * 100) };
    }
    const alteration = this.alteration();
    if (alteration === null) {
      return null;
    }
    return {
      nature: 'alter',
      direction: alteration.direction,
      mode: alteration.mode,
      value: alteration.mode === 'percent' ? alteration.bp : alteration.cents,
    };
  }
}

/** Aujourd'hui en `YYYY-MM-DD`, le format qu'attend un `<input type="date">`. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
