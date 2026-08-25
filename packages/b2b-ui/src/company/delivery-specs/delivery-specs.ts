import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type { DeliveryContact } from '@lfd/contracts';
import {
  FoldCheckboxComponent,
  FoldFieldsetComponent,
  FoldInputComponent,
  FoldListboxComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { HoursForm } from '../../hours/hours-form/hours-form';
import type { HoursEntry } from '../../hours/hours.model';
import { contactIssueOf, type DeliveryDraft, type DraftDays } from '../delivery-draft.model';
import { formatDeliveryContact, WEEKDAYS } from '../delivery-format';

/**
 * Les **consignes de livraison** d'une adresse : quand on vient, à qui on
 * remet, et si la remise se signe.
 *
 * Fragment pur — le lieu lui-même est saisi par `lfd-address-form`, qui ne
 * connaît que la poste. Ne reste sous ce toit que ce qui est propre à LFC.
 * Les messages d'erreur *de forme* sont calculés ici ; la validité globale est
 * au panneau.
 */
@Component({
  selector: 'lfd-delivery-specs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HoursForm,
    FoldInputComponent,
    FoldCheckboxComponent,
    FoldFieldsetComponent,
    FoldListboxComponent,
  ],
  templateUrl: './delivery-specs.html',
  styleUrl: './delivery-specs.scss',
})
export class DeliverySpecs {
  /** Le brouillon de livraison (two-way). */
  readonly value = model.required<DeliveryDraft>();

  /**
   * Le socle de signature de la SOCIÉTÉ — ce dont cette adresse hérite quand
   * elle ne déroge pas.
   *
   * Il entre ici pour être AFFICHÉ, jamais pour être écrit : sans lui, l'option
   * « comme la société » ne dirait pas ce qu'elle vaut, et choisir entre hériter
   * et déroger demanderait d'aller voir ailleurs.
   */
  readonly signatureFloor = input.required<boolean>();

  /** Contacts connus de l'entreprise, proposés pour préremplir le contact sur place. */
  readonly knownContacts = input.required<readonly DeliveryContact[]>();

  protected readonly contactIssue = computed(() => contactIssueOf(this.value()));

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

  protected set<K extends keyof DeliveryDraft>(key: K, value: DeliveryDraft[K]): void {
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
      label: formatDeliveryContact(contact),
    })),
  );

  /**
   * Les trois réponses possibles à « signe-t-on ici ? ».
   *
   * L'option d'héritage DIT ce dont elle hérite. « Comme la société » tout court
   * obligerait à ouvrir un autre écran pour savoir ce qu'on choisit — et on
   * choisirait donc au hasard.
   */
  protected readonly signatureOptions = computed<readonly FoldSelectOption<string>[]>(() => [
    {
      value: 'inherit',
      label: `Comme la société (${this.signatureFloor() ? 'exigée' : 'non exigée'})`,
    },
    { value: 'yes', label: 'Exigée' },
    { value: 'no', label: 'Non exigée' },
  ]);

  protected readonly signatureChoice = computed(() => {
    const own = this.value().signatureRequired;
    return own === null ? 'inherit' : own ? 'yes' : 'no';
  });

  protected setSignature(choice: string): void {
    this.set('signatureRequired', choice === 'inherit' ? null : choice === 'yes');
  }

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
