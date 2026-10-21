import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { FoldComboboxComponent, type FoldSelectOption } from 'fold-ng';

/**
 * **Le nom d'un réassort** (R1g, Hugo 2026-10-21 : « vitrine du matin ») —
 * un texte libre et facultatif, avec les noms déjà employés au point
 * proposés sous le champ : pas de liste à administrer. Le serveur rogne et
 * borne (60 caractères) ; l'écran ne revalide pas.
 *
 * `text` est le texte du champ, à double sens. `committed` part quand la
 * saisie est arrêtée — un nom proposé choisi, Entrée, ou le champ quitté —
 * et seulement si le texte rogné diffère de `saved` : le comptoir y écrit
 * sa demande en cours, le fournil l'ignore et envoie le nom avec le réassort.
 */
@Component({
  selector: 'app-resupply-name-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldComboboxComponent],
  templateUrl: './resupply-name-field.html',
})
export class ResupplyNameField {
  readonly text = model('');
  /** Le nom enregistré ; `null` : sans nom. */
  readonly saved = input<string | null>(null);
  readonly usedNames = input<readonly string[]>([]);
  readonly disabled = input(false);
  readonly committed = output<string>();

  protected readonly options = computed<readonly FoldSelectOption<string>[]>(() =>
    this.usedNames().map((name) => ({ value: name, label: name })),
  );

  /** Le dernier nom émis : un choix suivi du champ quitté n'écrit qu'une fois. */
  private lastEmitted: string | null = null;

  protected type(text: string): void {
    this.lastEmitted = null;
    this.text.set(text);
  }

  protected pick(name: string): void {
    this.text.set(name);
    this.commit();
  }

  protected commit(): void {
    const name = this.text().trim();
    if (name !== (this.saved() ?? '') && name !== this.lastEmitted) {
      this.lastEmitted = name;
      this.committed.emit(name);
    }
  }
}
