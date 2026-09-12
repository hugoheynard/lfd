import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DeclareLegalEntityPayload } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldNumberInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

/**
 * **Déclarer une entité émettrice** — l'identité, et rien de bancaire.
 *
 * Ni ICS ni compte dans ce formulaire, et c'est le sujet du panneau plus que son
 * absence : l'identifiant créancier arrive de la Banque de France des semaines
 * après. Les demander ici obligerait à inventer une valeur pour franchir
 * l'écran — et une entité qui affiche un ICS inventé est pire qu'une entité qui
 * dit ne pas en avoir.
 *
 * Un panneau modal parce que fold n'a pas de dialogue, et parce que déclarer la
 * personne morale qui encaisse mérite un moment où l'on ne fait que ça. Fermer
 * sans confirmer ne déclare rien.
 */
@Component({
  selector: 'app-declare-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './declare-panel.html',
  styleUrl: './declare-panel.scss',
})
export class DeclarePanel {
  private readonly panel = inject(FoldPanelRef<DeclareLegalEntityPayload | null>);

  protected readonly name = signal('');
  protected readonly legalForm = signal('');
  protected readonly siren = signal('');
  protected readonly rcs = signal('');
  protected readonly vatNumber = signal('');
  /** Saisi en EUROS ; le contrat le veut en centimes, la conversion est ci-dessous. */
  protected readonly shareCapital = signal<number | null>(null);
  protected readonly line1 = signal('');
  protected readonly line2 = signal('');
  protected readonly postalCode = signal('');
  protected readonly city = signal('');

  /**
   * Les cinq champs sans lesquels aucune mention légale ne s'imprime.
   *
   * Le SIREN n'est vérifié que sur sa LONGUEUR ici : sa clé de contrôle est
   * l'affaire du serveur, qui la refuse en nommant la faute. Recopier le calcul
   * de Luhn côté écran en ferait une seconde implémentation à tenir d'accord
   * avec la première — et celle qui dériverait laisserait passer un SIREN faux
   * ou bloquerait un SIREN juste.
   */
  protected readonly canDeclare = computed(
    () =>
      this.name().trim() !== '' &&
      this.legalForm().trim() !== '' &&
      this.siren().replace(/\s/gu, '').length === 9 &&
      this.line1().trim() !== '' &&
      this.postalCode().trim() !== '' &&
      this.city().trim() !== '',
  );

  protected confirm(): void {
    if (!this.canDeclare()) {
      return;
    }
    this.panel.close({
      name: this.name().trim(),
      legalForm: this.legalForm().trim(),
      siren: this.siren().replace(/\s/gu, ''),
      rcs: this.rcs().trim(),
      vatNumber: this.vatNumber().trim(),
      // Les euros saisis deviennent des centimes entiers. `Math.round` et non
      // une troncature : 12 500,10 € tapé à la virgule ne doit pas perdre un
      // centime au passage en flottant.
      shareCapitalCents: Math.round((this.shareCapital() ?? 0) * 100),
      address: {
        line1: this.line1().trim(),
        line2: this.line2().trim(),
        postalCode: this.postalCode().trim(),
        city: this.city().trim(),
        countryCode: 'FR',
      },
    });
  }

  protected cancel(): void {
    this.panel.close(null);
  }
}
