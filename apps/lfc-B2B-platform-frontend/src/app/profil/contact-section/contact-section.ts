import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInputComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import type { Contact } from '../../data/profil.model';
import { ProfilService } from '../../data/profil.service';

/**
 * Section **Contact professionnel** — le contact du compte et, en option, un
 * représentant (le gestionnaire de commande interne à l'entreprise). Édition
 * *en place* ; le représentant se coche/décoche dans le même formulaire.
 */
@Component({
  selector: 'app-contact-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldFieldListComponent,
    FoldFieldComponent,
    FoldInputComponent,
    FoldCheckboxComponent,
    FoldButtonComponent,
  ],
  templateUrl: './contact-section.html',
  styleUrl: './contact-section.scss',
})
export class ContactSection {
  private readonly profil = inject(ProfilService);

  protected readonly contact = computed(() => this.profil.profile().contact);
  protected readonly representant = this.profil.representant;
  protected readonly editing = signal(false);

  // Contact principal.
  protected readonly cPrenom = signal('');
  protected readonly cNom = signal('');
  protected readonly cFonction = signal('');
  protected readonly cEmail = signal('');
  protected readonly cTel = signal('');

  // Représentant optionnel.
  protected readonly hasRep = signal(false);
  protected readonly rPrenom = signal('');
  protected readonly rNom = signal('');
  protected readonly rFonction = signal('');
  protected readonly rEmail = signal('');
  protected readonly rTel = signal('');

  protected readonly canSave = computed(() => {
    const mainOk =
      this.cPrenom().trim() !== '' && this.cNom().trim() !== '' && this.cEmail().trim() !== '';
    if (!this.hasRep()) {
      return mainOk;
    }
    const repOk =
      this.rPrenom().trim() !== '' && this.rNom().trim() !== '' && this.rEmail().trim() !== '';
    return mainOk && repOk;
  });

  protected startEdit(): void {
    const c = this.contact();
    this.cPrenom.set(c.prenom);
    this.cNom.set(c.nom);
    this.cFonction.set(c.fonction);
    this.cEmail.set(c.email);
    this.cTel.set(c.telephone);

    const r = this.representant();
    this.hasRep.set(r !== null);
    this.rPrenom.set(r?.prenom ?? '');
    this.rNom.set(r?.nom ?? '');
    this.rFonction.set(r?.fonction ?? 'Gestionnaire de commande');
    this.rEmail.set(r?.email ?? '');
    this.rTel.set(r?.telephone ?? '');

    this.editing.set(true);
  }

  protected cancel(): void {
    this.editing.set(false);
  }

  protected save(): void {
    if (!this.canSave()) {
      return;
    }
    this.profil.updateContact(this.readContact());
    this.profil.setRepresentant(this.hasRep() ? this.readRepresentant() : null);
    this.editing.set(false);
  }

  private readContact(): Contact {
    return {
      prenom: this.cPrenom().trim(),
      nom: this.cNom().trim(),
      fonction: this.cFonction().trim(),
      email: this.cEmail().trim(),
      telephone: this.cTel().trim(),
    };
  }

  private readRepresentant(): Contact {
    return {
      prenom: this.rPrenom().trim(),
      nom: this.rNom().trim(),
      fonction: this.rFonction().trim(),
      email: this.rEmail().trim(),
      telephone: this.rTel().trim(),
    };
  }
}
