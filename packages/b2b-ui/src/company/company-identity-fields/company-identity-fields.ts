import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { FoldInputComponent } from 'fold-ng';

import type { CompanyIdentityDraft } from '../company-form.model';

/**
 * Champs d'**identité légale** d'une société — fragment de formulaire pur,
 * réutilisable dans tout panneau (création client, création admin, édition). Un
 * `model` two-way `value` porte le brouillon ; le container garde l'en-tête, les
 * callouts, le pied et l'action de sauvegarde. Aucune connaissance de service.
 */
@Component({
  selector: 'lfd-company-identity-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldInputComponent],
  templateUrl: './company-identity-fields.html',
  styleUrl: './company-identity-fields.scss',
})
export class CompanyIdentityFields {
  /** Brouillon d'identité (two-way). */
  readonly value = model.required<CompanyIdentityDraft>();

  protected setRaisonSociale(raisonSociale: string): void {
    this.value.update((draft) => ({ ...draft, raisonSociale }));
  }
  protected setEnseigne(enseigne: string): void {
    this.value.update((draft) => ({ ...draft, enseigne }));
  }
  protected setFormeJuridique(formeJuridique: string): void {
    this.value.update((draft) => ({ ...draft, formeJuridique }));
  }
  protected setSiret(siret: string): void {
    this.value.update((draft) => ({ ...draft, siret }));
  }
  protected setTvaIntracom(tvaIntracom: string): void {
    this.value.update((draft) => ({ ...draft, tvaIntracom }));
  }
}
