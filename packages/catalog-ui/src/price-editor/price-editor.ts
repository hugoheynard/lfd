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
 * du blanc — sur la carte blanche du catalogue. « Prix pro » existait dans le
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
          [label]="words().field"
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
            [attr.aria-label]="'Enregistrer le ' + words().noun + ' de ' + label()"
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
            hasDecision()
              ? 'Modifier le ' + words().noun + ' de ' + label()
              : 'Poser un ' + words().noun + ' sur ' + label()
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
            [attr.aria-label]="'Revenir ' + words().back + ' pour ' + label()"
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
  /**
   * **De quel prix on parle**, et c'est le seul interrupteur du composant.
   *
   * 🔴 Il ne change pas que des mots : il change l'**unité**. Le prix
   * professionnel est un hors taxe DÉRIVÉ, donc en millicentimes ; l'étiquette
   * publique est un TTC qu'un humain pose, donc en centimes. Deux composants
   * auraient divergé ; deux entrées séparées (`kind` et `unit`) auraient permis
   * de les accorder de travers. Une seule, et les deux suivent.
   */
  readonly kind = input<PriceKind>("pro");
  /** Le tarif d'origine, **dans l'unité de `kind`** — ce vers quoi « revenir » ramène. */
  readonly originMillicents = input.required<number>();
  /** La décision en place, dans la même unité. `null` = aucune. */
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

  protected readonly words = computed(() => WORDS[this.kind()]);

  /** L'unité dans laquelle l'hôte compte — celle de `kind`, jamais devinée. */
  private readonly perEuro = computed(() =>
    this.kind() === "pro" ? MILLICENTS_PER_EUR : CENTS_PER_EUR,
  );

  protected readonly originHint = computed(
    () =>
      `${this.words().origin} : ${formatEuros(this.originMillicents() * (MILLICENTS_PER_EUR / this.perEuro()))}`,
  );

  /**
   * Un montant strictement positif — et **différent de l'origine**, parce que le
   * serveur refuserait l'égalité. Le dire ici évite un aller-retour pour
   * apprendre une règle que l'écran connaissait déjà.
   */
  protected readonly isValid = computed(() => {
    const amount = toUnit(this.draft(), this.perEuro());
    return amount !== null && amount > 0 && amount !== this.originMillicents();
  });

  protected open(): void {
    this.draft.set((this.alteredMillicents() ?? this.originMillicents()) / this.perEuro());
    this.editing.set(true);
  }

  protected close(): void {
    this.editing.set(false);
  }

  protected submit(): void {
    const amount = toUnit(this.draft(), this.perEuro());
    if (amount === null || !this.isValid()) {
      return;
    }
    this.save.emit(amount);
    this.editing.set(false);
  }
}

/** D'euros saisis à millicentimes entiers — l'unité d'un prix unitaire DÉRIVÉ. */
const MILLICENTS_PER_EUR = 100_000;
/** L'unité d'un prix qu'un humain POSE. */
const CENTS_PER_EUR = 100;

/** Les deux prix que cet éditeur sait poser. */
export type PriceKind = "pro" | "public";

/**
 * Les mots de chaque prix, en un seul endroit.
 *
 * Ils sont ici et non en entrées séparées pour qu'on ne puisse pas composer un
 * éditeur qui dirait « prix public » au-dessus d'un champ en millicentimes.
 */
const WORDS: Readonly<
  Record<PriceKind, { field: string; noun: string; origin: string; back: string }>
> = {
  pro: {
    field: "Prix pro (€ HT)",
    noun: "prix pro",
    origin: "Tarif PIM",
    back: "au tarif du PIM",
  },
  public: {
    field: "Prix public (€ TTC)",
    noun: "prix public",
    origin: "Étiquette PIM",
    back: "à l'étiquette du PIM",
  },
};

/**
 * Euros → entiers de l'unité demandée.
 *
 * `Math.round` et non une troncature : `2.99 * 100000` vaut `298999.9999…` en
 * flottant, et tronquer facturerait un millicentime de moins à chaque ligne.
 */
function toUnit(euros: number | null, perEuro: number): number | null {
  return euros !== null && Number.isFinite(euros) ? Math.round(euros * perEuro) : null;
}
