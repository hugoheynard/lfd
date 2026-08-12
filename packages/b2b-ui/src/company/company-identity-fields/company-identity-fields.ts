import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import {
  LEGAL_FORM_OPTIONS,
  legalFormRequiresVat,
  toLegalForm,
  type LegalForm,
} from '@lfd/contracts';
import { FoldInputComponent, FoldListboxComponent, type FoldSelectOption } from 'fold-ng';

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
  imports: [FoldInputComponent, FoldListboxComponent],
  templateUrl: './company-identity-fields.html',
  styleUrl: './company-identity-fields.scss',
})
export class CompanyIdentityFields {
  /** Brouillon d'identité (two-way). */
  readonly value = model.required<CompanyIdentityDraft>();

  /** Les formes du catalogue — la liste vient du contrat, pas de l'écran. */
  protected readonly legalForms: readonly FoldSelectOption<LegalForm>[] = LEGAL_FORM_OPTIONS.map(
    (option) => ({ value: option.value, label: option.label }),
  );

  /**
   * La TVA est-elle obligatoire pour la forme choisie ? Tant qu'aucune n'est
   * choisie, on répond OUI : mieux vaut inviter à renseigner un numéro que le
   * laisser manquer en silence pour une société assujettie — le même défaut
   * prudent que côté serveur.
   */
  protected readonly vatRequired = computed(() => {
    const form = toLegalForm(this.value().formeJuridique);
    return form === null ? true : legalFormRequiresVat(form);
  });

  /**
   * **Différer** l'identité légale : raison sociale, forme juridique et SIRET
   * passent de requis à facultatifs. L'enseigne, elle, reste exigée — c'est le
   * nom de la société pour tout le monde sauf le greffe.
   *
   * Le cas est celui du commercial chez son client, qui ouvre le compte devant
   * lui : les papiers sont au bureau. Exiger 14 chiffres à cet instant, c'est
   * renvoyer le commercial dans sa voiture — et le compte ne sera jamais ouvert.
   * Ce que le client déclare lui-même, en revanche, reste exigé : il a ses
   * papiers sous les yeux.
   */
  readonly legalDeferred = input(false);

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
