import { ChangeDetectionStrategy, Component, computed, input, output, signal } from "@angular/core";
import { FoldButtonComponent, FoldNumberInputComponent } from "fold-ng";

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
 * téléphone ; la conversion en millicentimes se fait ici, une fois, à
 * l'émission. Laisser fuir des euros décimaux plus loin ramènerait des flottants
 * dans une chaîne qui n'en veut pas.
 *
 * ## Ce que la réécriture du 2026-09-10 a changé, et pourquoi
 *
 * 🔴 **Le contrôle était INVISIBLE.** Ses deux boutons portaient
 * `--fold-color-on-primary` — l'encre qu'on pose sur un aplat de marque, donc
 * du blanc — sur la carte blanche du catalogue. « Prix B2B » existait dans le
 * DOM, mesurait 61 px, répondait au clic, et personne ne pouvait le voir. Un
 * token existant vaut toujours une couleur valide : ni `tsc`, ni ESLint, ni les
 * tests ne pouvaient le dire. Seul le rendu le disait.
 *
 * Le champ et les boutons sont désormais **ceux de fold** plutôt que trois
 * `<button>` habillés à la main. Ce n'est pas de la cosmétique : c'est ce qui
 * fait que le contrôle ne peut plus être peint hors du système, donc ne peut
 * plus disparaître de la même façon.
 *
 * Purement présentationnel : il ne sait pas écrire. Il émet, l'hôte décide.
 */
@Component({
  selector: "lfd-price-editor",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldNumberInputComponent],
  template: `
    @if (editing()) {
      <div class="editor">
        <!-- Le tarif du PIM est dans l'INDICE du champ, pas ailleurs sur la
             ligne : au moment de saisir, la seule question est « je remplace
             quoi ? », et la réponse doit être sous les yeux. -->
        <fold-number-input
          size="sm"
          label="Prix B2B (€)"
          [hint]="originHint()"
          [min]="0.01"
          [step]="0.01"
          [value]="draft()"
          (valueChange)="draft.set($event)"
        />
        <div class="acts">
          <button
            foldButton
            size="sm"
            type="button"
            [disabled]="!isValid()"
            [attr.aria-label]="'Enregistrer le prix B2B de ' + label()"
            (click)="submit()"
          >
            Enregistrer
          </button>
          <button
            foldButton
            size="sm"
            type="button"
            emphasis="outline"
            intent="neutral"
            (click)="close()"
          >
            Annuler
          </button>
        </div>
      </div>
    } @else {
      <div class="acts">
        <button
          foldButton
          size="sm"
          type="button"
          emphasis="outline"
          [intent]="hasDecision() ? 'neutral' : 'primary'"
          [attr.aria-label]="
            (hasDecision() ? 'Modifier le prix B2B de ' : 'Poser un prix B2B sur ') + label()
          "
          (click)="open()"
        >
          {{ hasDecision() ? "Modifier" : "Poser un prix" }}
        </button>
        @if (hasDecision()) {
          <button
            foldButton
            size="sm"
            type="button"
            emphasis="outline"
            intent="neutral"
            [attr.aria-label]="'Revenir au tarif du PIM pour ' + label()"
            (click)="reset.emit()"
          >
            Revenir au PIM
          </button>
        }
      </div>
    }
  `,
  styles: `
    .editor {
      display: flex;
      flex-direction: column;
      gap: var(--fold-space-sm, 0.5rem);
    }
    .acts {
      display: flex;
      align-items: center;
      gap: var(--fold-space-sm, 0.5rem);
      flex-wrap: wrap;
    }
  `,
})
export class PriceEditor {
  /** Le tarif d'origine, en millicentimes — ce vers quoi « revenir » ramène. */
  readonly originMillicents = input.required<number>();
  /** La décision en place, en millicentimes. `null` = aucune. */
  readonly alteredMillicents = input<number | null>(null);
  /**
   * Le nom de l'article — pour le nom accessible des boutons.
   *
   * Sur une table de quarante lignes, tous les boutons portent le même texte.
   * Sans lui, un lecteur d'écran parcourt « Poser un prix, Poser un prix, Poser
   * un prix » sans jamais apprendre sur quoi.
   */
  readonly label = input<string>("");

  /** Un prix à poser, **en millicentimes** : la conversion se fait ici. */
  readonly save = output<number>();
  /** Renoncer à la décision. Distinct de « saisir le prix d'origine ». */
  readonly reset = output<void>();

  protected readonly editing = signal(false);
  protected readonly draft = signal<number | null>(null);

  protected readonly hasDecision = computed(() => this.alteredMillicents() !== null);

  protected readonly originHint = computed(
    () => `Tarif PIM : ${formatEuros(this.originMillicents())}`,
  );

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
    this.draft.set((this.alteredMillicents() ?? this.originMillicents()) / MILLICENTS_PER_EUR);
    this.editing.set(true);
  }

  protected close(): void {
    this.editing.set(false);
  }

  protected submit(): void {
    const millicents = toMillicents(this.draft());
    if (millicents === null || !this.isValid()) {
      return;
    }
    this.save.emit(millicents);
    this.editing.set(false);
  }
}

/** D'euros saisis à millicentimes entiers — l'unité d'un prix unitaire. */
const MILLICENTS_PER_EUR = 100_000;

/**
 * Euros → **millicentimes** entiers.
 *
 * `Math.round` et non une troncature : `2.99 * 100000` vaut `298999.9999…` en
 * flottant, et tronquer facturerait un millicentime de moins à chaque ligne.
 */
function toMillicents(euros: number | null): number | null {
  return euros !== null && Number.isFinite(euros) ? Math.round(euros * MILLICENTS_PER_EUR) : null;
}
