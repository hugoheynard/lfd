import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type { DeliveryContact } from '@lfd/contracts';
import {
  FoldCheckboxComponent,
  FoldInputComponent,
  FoldListboxComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { AddressForm } from '../../address/address-form/address-form';
import { HoursForm } from '../../hours/hours-form/hours-form';
import type { HoursEntry } from '../../hours/hours.model';
import {
  ALL_POSTAL_FIELDS,
  DEFAULT_POSTAL_FIELDS,
  type PostalAddress,
} from '../../address/address.model';
import { formatDeliveryContact, WEEKDAYS } from '../delivery-format';
import {
  contactIssueOf,
  postalOfDraft,
  withPostal,
  type AddressDraft,
  type DraftDays,
} from '../address-form.model';

/**
 * Champs d'une **adresse** (facturation ou livraison) — fragment de formulaire
 * pur, partagé par les panneaux d'adresse des deux frontends B2B. Un `model`
 * two-way `value` porte le brouillon ; le container garde l'en-tête, le pied et
 * la sauvegarde. Le bloc **livraison** (défaut, note, créneaux, contact, GPS) ne
 * s'affiche que pour `kind = 'livraison'`. Les messages d'erreur *de forme* sont
 * calculés ici ; la validité globale (`isAddressValid`) est au container.
 *
 * L'adresse **postale** elle-même n'est plus écrite ici : c'est
 * `lfd-address-form`, qui ne connaît que la poste. Ne reste sous ce toit que ce
 * qui est propre à LFC — les consignes de livraison.
 */
@Component({
  selector: 'lfd-address-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AddressForm,
    HoursForm,
    FoldInputComponent,
    FoldCheckboxComponent,
    FoldListboxComponent,
  ],
  templateUrl: './address-fields.html',
  styleUrl: './address-fields.scss',
})
export class AddressFields {
  /** Brouillon d'adresse (two-way). */
  readonly value = model.required<AddressDraft>();
  /** Facturation (postal seul) ou livraison (postal + consignes). */
  readonly kind = input<'facturation' | 'livraison'>('livraison');
  /** Contacts connus de l'entreprise, proposés pour préremplir le contact sur place. */
  readonly knownContacts = input<readonly DeliveryContact[]>([]);

  /** La part postale du brouillon, dans la langue neutre du fragment adresse. */
  protected readonly postal = computed(() => postalOfDraft(this.value()));

  /** Le point GPS ne se demande qu'en livraison. */
  protected readonly postalFields = computed(() =>
    this.isLivraison() ? ALL_POSTAL_FIELDS : DEFAULT_POSTAL_FIELDS,
  );

  protected setPostal(postal: PostalAddress): void {
    this.value.update((draft) => withPostal(draft, postal));
  }

  /**
   * Les créneaux, en lignes nommées. Une seule — « Tous les jours » — ou sept,
   * selon la case : c'est la même saisie, ce n'est pas la même promesse.
   */
  protected readonly slotEntries = computed<readonly HoursEntry[]>(() => {
    const draft = this.value();
    if (draft.sameEveryDay) {
      return [
        {
          key: 'every',
          label: 'Tous les jours',
          range: { start: draft.everyStart, end: draft.everyEnd },
        },
      ];
    }
    return WEEKDAYS.map((day) => ({
      key: day.value,
      label: day.label,
      range: draft.days[day.value],
    }));
  });

  protected setSlotEntries(entries: readonly HoursEntry[]): void {
    const single = entries[0];
    if (this.value().sameEveryDay) {
      if (single !== undefined) {
        this.value.update((draft) => ({
          ...draft,
          everyStart: single.range.start,
          everyEnd: single.range.end,
        }));
      }
      return;
    }
    this.value.update((draft) => ({
      ...draft,
      days: WEEKDAYS.reduce<DraftDays>((days, day) => {
        const found = entries.find((entry) => entry.key === day.value);
        return { ...days, [day.value]: found?.range ?? draft.days[day.value] };
      }, draft.days),
    }));
  }

  protected readonly isLivraison = computed(() => this.kind() === 'livraison');

  protected readonly contactIssue = computed(() =>
    this.isLivraison() ? contactIssueOf(this.value()) : '',
  );

  /** Nom lisible d'un contact connu, pour l'option du select. */
  protected contactLabel(contact: DeliveryContact): string {
    return formatDeliveryContact(contact);
  }

  /** Lit la valeur d'un `<input>` / `<textarea>` natif sans caster en `any`. */
  protected inputValue(event: Event): string {
    const el = event.target;
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : '';
  }

  protected set<K extends keyof AddressDraft>(key: K, value: AddressDraft[K]): void {
    this.value.update((draft) => ({ ...draft, [key]: value }));
  }

  /**
   * Les contacts connus, proposés au listbox. La **position** sert de valeur :
   * deux personnes peuvent porter le même nom, et rien d'autre ici ne les
   * distingue — ces contacts viennent de la fiche, pas d'une table à identité.
   */
  protected readonly knownContactOptions = computed<readonly FoldSelectOption<number>[]>(() =>
    this.knownContacts().map((contact, index) => ({
      value: index,
      label: this.contactLabel(contact),
    })),
  );

  /** « Reprendre un contact connu » : recopie ses champs et lève « pas de contact ». */
  protected onPickContact(index: number): void {
    const picked = this.knownContacts()[index];
    if (picked === undefined) {
      return;
    }
    this.value.update((draft) => ({
      ...draft,
      noContact: false,
      contactPrenom: picked.prenom,
      contactNom: picked.nom,
      contactTel: picked.telephone,
    }));
  }
}
