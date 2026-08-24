import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInputComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import type { Etablissement } from '../../data/profil.model';
import { ProfilService } from '../../data/profil.service';

/**
 * Section **Établissement** — identité légale de la société, en édition *en
 * place* : la fiche bascule lecture ↔ formulaire via « Modifier », sans quitter
 * la page. Un composant autonome qui possède son propre `fold-page-section` et
 * son état d'édition, pour rester sous les limites de taille et cohérent avec
 * les autres sections du profil.
 */
@Component({
  selector: 'app-societe-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldFieldListComponent,
    FoldFieldComponent,
    FoldInputComponent,
    FoldButtonComponent,
  ],
  templateUrl: './societe-section.html',
  styleUrl: './societe-section.scss',
})
export class SocieteSection {
  private readonly profil = inject(ProfilService);

  protected readonly etablissement = computed(() => this.profil.profile().etablissement);
  protected readonly editing = signal(false);

  protected readonly raisonSociale = signal('');
  protected readonly enseigne = signal('');
  protected readonly formeJuridique = signal('');
  protected readonly siret = signal('');
  protected readonly vatNumber = signal('');

  protected readonly canSave = computed(
    () => this.raisonSociale().trim() !== '' && this.siret().trim() !== '',
  );

  protected startEdit(): void {
    const e = this.etablissement();
    this.raisonSociale.set(e.raisonSociale);
    this.enseigne.set(e.enseigne);
    this.formeJuridique.set(e.formeJuridique);
    this.siret.set(e.siret);
    this.vatNumber.set(e.vatNumber);
    this.editing.set(true);
  }

  protected cancel(): void {
    this.editing.set(false);
  }

  protected save(): void {
    if (!this.canSave()) {
      return;
    }
    const next: Etablissement = {
      raisonSociale: this.raisonSociale().trim(),
      enseigne: this.enseigne().trim(),
      formeJuridique: this.formeJuridique().trim(),
      siret: this.siret().trim(),
      vatNumber: this.vatNumber().trim(),
    };
    this.profil.updateEtablissement(next);
    this.editing.set(false);
  }
}
