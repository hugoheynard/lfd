import { ChangeDetectionStrategy, Component, computed, input, output, signal } from "@angular/core";

import { formatEuros } from "../price-origin/format-euros";

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
      gap: var(--fold-space-sm, 0.5rem);
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
      color: var(--fold-color-text-muted, #6b7280);
    }
    button {
      font: inherit;
      cursor: pointer;
    }
    .link {
      border: 0;
      background: none;
      padding: 0;
      color: var(--fold-color-on-primary, #2563eb);
      text-decoration: underline;
    }
    .link.muted {
      color: var(--fold-color-text-muted, #6b7280);
    }
    .ok,
    .cancel {
      padding: 0.25rem 0.5rem;
      border-radius: var(--fold-radius-sm, 0.25rem);
      border: 1px solid var(--fold-color-border, #d1d5db);
      background: var(--fold-color-surface-card, #fff);
    }
    .ok:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,
})
export class PriceEditor {
  /** Le tarif d'origine, en centimes — ce vers quoi « revenir » ramène. */
  readonly originMillicents = input.required<number>();
  /** La décision en place, en centimes. `null` = aucune. */
  readonly alteredMillicents = input<number | null>(null);
  /** Le nom de l'article — pour l'étiquette accessible du champ. */
  readonly label = input<string>("");

  /** Un prix à poser, **en centimes** : la conversion se fait ici, pas chez l'hôte. */
  readonly save = output<number>();
  /** Renoncer à la décision. Distinct de « saisir le prix d'origine ». */
  readonly reset = output<void>();

  protected readonly editing = signal(false);
  protected readonly draft = signal("");

  protected readonly hasDecision = computed(() => this.alteredMillicents() !== null);
  protected readonly originLabel = computed(() => formatEuros(this.originMillicents()));

  /**
   * Un montant strictement positif — et **différent de l'origine**, parce que le
   * serveur refuserait l'égalité. Le dire ici évite un aller-retour pour
   * apprendre une règle que l'écran connaissait déjà.
   */
  protected readonly isValid = computed(() => {
    const millicents = toMillicents(this.draft());
    return millicents !== null && millicents > 0 && millicents !== this.originMillicents();
  });

  protected open(): void {
    // Deux décimales AU MOINS, cinq au plus, et les fines seulement si elles
    // existent : un prix rond se rouvre « 2,10 », un prix déduit « 8,18182 ».
    // Forcer cinq décimales ferait ressaisir des zéros à chaque correction.
    this.draft.set(draftOf(this.alteredMillicents() ?? this.originMillicents()));
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
    const millicents = toMillicents(this.draft());
    if (millicents === null || !this.isValid()) {
      return;
    }
    this.save.emit(millicents);
    this.editing.set(false);
  }
}

/**
 * Euros saisis → **millicentimes** entiers.
 *
 * Cinq décimales acceptées, et c'est délibéré : un devis grand compte se pose
 * avec, parce que le volume les rend visibles sur la facture. Les tronquer à
 * deux décollerait le prix négocié du prix facturé.
 *
 * `Math.round` et non une troncature : `2.99 * 100000` vaut `298999.9999…` en
 * flottant, et tronquer facturerait un millicentime de moins à chaque ligne.
 */
function toMillicents(raw: string): number | null {
  const value = Number.parseFloat(raw.replace(",", "."));
  return Number.isFinite(value) ? Math.round(value * 100_000) : null;
}

/** Le montant tel qu'on le rouvre à la saisie : « 2,10 », « 8,18182 ». */
function draftOf(millicents: number): string {
  const euros = millicents / 100_000;
  const fine = euros.toFixed(5).replace(/0+$/u, "");
  return fine.endsWith(".") ? euros.toFixed(2) : fine.padEnd(fine.indexOf(".") + 3, "0");
}
