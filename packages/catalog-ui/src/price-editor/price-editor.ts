import { ChangeDetectionStrategy, Component, computed, input, output, signal } from "@angular/core";

import { formatEuros } from "../price-origin/price-origin";

/**
 * **Poser un prix, ou revenir à l'origine.**
 *
 * Deux gestes distincts et jamais confondus : on saisit un montant, ou on
 * renonce à la décision. « Revenir » n'est donc pas « saisir le prix d'origine »
 * — recopier créerait une décision fantôme que la prochaine hausse du PIM ne
 * traverserait plus.
 *
 * La saisie est en **euros** parce que c'est ce qu'un commercial dicte au
 * téléphone ; la conversion en centimes se fait ici, une fois, à l'émission.
 * Laisser fuir des euros décimaux plus loin ramènerait des flottants dans une
 * chaîne qui n'en veut pas.
 *
 * Purement présentationnel : il ne sait pas écrire. Il émet, l'hôte décide.
 */
@Component({
  selector: "lfd-price-editor",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (editing()) {
      <form class="editor" (submit)="submit($event)">
        <input
          class="amount"
          type="number"
          step="0.01"
          min="0.01"
          inputmode="decimal"
          [attr.aria-label]="'Prix B2B de ' + label()"
          [value]="draft()"
          (input)="onInput($event)"
          autofocus
        />
        <span class="unit">€</span>
        <button type="submit" class="ok" [disabled]="!isValid()">Enregistrer</button>
        <button type="button" class="cancel" (click)="close()">Annuler</button>
      </form>
    } @else {
      <div class="actions">
        <button type="button" class="link" (click)="open()">
          {{ hasDecision() ? "Modifier" : "Prix B2B" }}
        </button>
        @if (hasDecision()) {
          <button type="button" class="link muted" (click)="reset.emit()">
            Revenir à {{ originLabel() }}
          </button>
        }
      </div>
    }
  `,
  styles: `
    .editor,
    .actions {
      display: flex;
      align-items: center;
      gap: var(--fold-space-2, 0.5rem);
    }
    .amount {
      inline-size: 6rem;
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--fold-color-border, #d1d5db);
      border-radius: var(--fold-radius-sm, 0.25rem);
      font: inherit;
      text-align: end;
      font-variant-numeric: tabular-nums;
    }
    .unit {
      color: var(--fold-color-fg-muted, #6b7280);
    }
    button {
      font: inherit;
      cursor: pointer;
    }
    .link {
      border: 0;
      background: none;
      padding: 0;
      color: var(--fold-color-accent-fg, #2563eb);
      text-decoration: underline;
    }
    .link.muted {
      color: var(--fold-color-fg-muted, #6b7280);
    }
    .ok,
    .cancel {
      padding: 0.25rem 0.5rem;
      border-radius: var(--fold-radius-sm, 0.25rem);
      border: 1px solid var(--fold-color-border, #d1d5db);
      background: var(--fold-color-surface, #fff);
    }
    .ok:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,
})
export class PriceEditor {
  /** Le tarif d'origine, en centimes — ce vers quoi « revenir » ramène. */
  readonly originCents = input.required<number>();
  /** La décision en place, en centimes. `null` = aucune. */
  readonly alteredCents = input<number | null>(null);
  /** Le nom de l'article — pour l'étiquette accessible du champ. */
  readonly label = input<string>("");

  /** Un prix à poser, **en centimes** : la conversion se fait ici, pas chez l'hôte. */
  readonly save = output<number>();
  /** Renoncer à la décision. Distinct de « saisir le prix d'origine ». */
  readonly reset = output<void>();

  protected readonly editing = signal(false);
  protected readonly draft = signal("");

  protected readonly hasDecision = computed(() => this.alteredCents() !== null);
  protected readonly originLabel = computed(() => formatEuros(this.originCents()));

  /**
   * Un montant strictement positif — et **différent de l'origine**, parce que le
   * serveur refuserait l'égalité. Le dire ici évite un aller-retour pour
   * apprendre une règle que l'écran connaissait déjà.
   */
  protected readonly isValid = computed(() => {
    const cents = toCents(this.draft());
    return cents !== null && cents > 0 && cents !== this.originCents();
  });

  protected open(): void {
    this.draft.set(((this.alteredCents() ?? this.originCents()) / 100).toFixed(2));
    this.editing.set(true);
  }

  protected close(): void {
    this.editing.set(false);
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const cents = toCents(this.draft());
    if (cents === null || !this.isValid()) {
      return;
    }
    this.save.emit(cents);
    this.editing.set(false);
  }
}

/**
 * Euros saisis → centimes entiers.
 *
 * `Math.round` et non une troncature : `2.99 * 100` vaut `298.99999…` en
 * flottant, et tronquer facturerait un centime de moins à chaque ligne.
 */
function toCents(raw: string): number | null {
  const value = Number.parseFloat(raw.replace(",", "."));
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}
