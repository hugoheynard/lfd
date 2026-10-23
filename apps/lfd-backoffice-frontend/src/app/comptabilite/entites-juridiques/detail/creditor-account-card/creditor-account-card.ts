import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
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
 * et se vide après un enregistrement RÉUSSI — pas avant : la fiche se relit
 * après le geste de n'importe quelle autre carte, et vider à la relecture
 * effaçait une saisie en cours (décision Hugo, 2026-10-23). Un échec garde
 * la saisie. Les autres champs se reprennent de la fiche relue tant que
 * personne n'a commencé à les modifier ; dès la première frappe, la saisie
 * prime jusqu'au prochain succès.
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

  /** Une frappe dans la carte : la relecture de la fiche ne la touche plus. */
  private readonly editing = signal(false);

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
    // Une fiche relue repose la recopie telle que le serveur l'a rendue —
    // sauf pendant une saisie, qu'elle n'écrase jamais. L'IBAN n'en dépend pas.
    effect(() => {
      const entity = this.entity();
      if (!untracked(this.editing)) {
        this.fillDrafts(entity);
      }
    });
  }

  /** Pose une frappe et fige la saisie contre les relectures. */
  protected edit(draft: { set(value: string): void }, value: string): void {
    draft.set(value);
    this.editing.set(true);
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
      // Le vidage suit le succès : un rejet laisse tout à l'écran.
      action: async () => {
        await this.api.setCreditorAccount(id, payload);
        this.ibanDraft.set('');
        this.editing.set(false);
        this.fillDrafts(this.entity());
      },
      said: 'Compte enregistré.',
    });
  }

  private fillDrafts(entity: LegalEntityView): void {
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
