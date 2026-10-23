import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { LegalEntityView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { LegalEntitiesService } from '../../../legal-entities.service';

/**
 * **Le compte créancier d'une entité** — la recopie de son RIB, telle que la
 * banque la connaît, et ce qui s'en imprime sur les mandats.
 *
 * Comme les autres cartes de la fiche, elle **décrit** son geste et le remonte
 * (`saved`) : la page détient l'état occupé, le message d'erreur et la relecture.
 *
 * 🔴 **L'IBAN ne revient jamais du serveur.** Le champ est vide à l'ouverture
 * et se vide à chaque relecture de l'entité : le laisser à l'écran le ferait
 * traîner sur un poste de back-office ouvert des heures. Les autres champs, eux,
 * se reprennent de la fiche relue — les effacer donnerait l'impression d'avoir
 * perdu ce qu'on vient d'enregistrer.
 */
@Component({
  selector: 'app-creditor-account-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './creditor-account-card.html',
  styleUrl: './creditor-account-card.scss',
})
export class CreditorAccountCard {
  private readonly api = inject(LegalEntitiesService);

  readonly entity = input.required<LegalEntityView>();
  readonly busy = input(false);

  /** Ce que le geste a fait, pour que la page relise et annonce. */
  readonly saved = output<{ readonly action: () => Promise<unknown>; readonly said: string }>();

  protected readonly ibanDraft = signal('');
  protected readonly bicDraft = signal('');
  protected readonly holderDraft = signal('');
  protected readonly line1Draft = signal('');
  protected readonly line2Draft = signal('');
  protected readonly postalCodeDraft = signal('');
  protected readonly cityDraft = signal('');
  protected readonly countryDraft = signal('FR');

  /**
   * Le RIB se recopie en entier, donc le bouton attend TOUT — sauf le
   * complément d'adresse, qui est facultatif sur un vrai RIB.
   */
  protected readonly accountComplete = computed(
    () =>
      this.ibanDraft().trim() !== '' &&
      this.bicDraft().trim() !== '' &&
      this.holderDraft().trim() !== '' &&
      this.line1Draft().trim() !== '' &&
      this.postalCodeDraft().trim() !== '' &&
      this.cityDraft().trim() !== '' &&
      this.countryDraft().trim() !== '',
  );

  constructor() {
    // Chaque fiche relue (après n'importe quel geste de la page) repose la
    // recopie telle que le serveur l'a rendue.
    effect(() => {
      this.fillDrafts(this.entity());
    });
  }

  protected save(): void {
    if (!this.accountComplete()) {
      return;
    }
    const id = this.entity().id;
    const payload = {
      iban: this.ibanDraft().trim(),
      bic: this.bicDraft().trim(),
      holder: this.holderDraft().trim(),
      line1: this.line1Draft().trim(),
      line2: this.line2Draft().trim(),
      postalCode: this.postalCodeDraft().trim(),
      city: this.cityDraft().trim(),
      countryCode: this.countryDraft().trim().toUpperCase(),
    };
    this.saved.emit({
      action: () => this.api.setCreditorAccount(id, payload),
      said: 'Compte enregistré.',
    });
  }

  private fillDrafts(entity: LegalEntityView): void {
    this.ibanDraft.set('');
    this.bicDraft.set(entity.creditorBic);
    this.holderDraft.set(entity.creditorAccountHolder);
    this.line1Draft.set(entity.creditorAccountLine1);
    this.line2Draft.set(entity.creditorAccountLine2);
    this.postalCodeDraft.set(entity.creditorAccountPostalCode);
    this.cityDraft.set(entity.creditorAccountCity);
    this.countryDraft.set(
      entity.creditorAccountCountryCode === '' ? 'FR' : entity.creditorAccountCountryCode,
    );
  }
}
