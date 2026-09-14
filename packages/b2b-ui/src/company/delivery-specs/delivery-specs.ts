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
import {
  contactIssueOf,
  type DeliveryDraft,
  type DraftDays,
  withNoContact,
} from '../delivery-draft.model';
import { formatDeliveryContact, WEEKDAYS } from '../delivery-format';
import { withKnownContact } from '../delivery-address-form/delivery-address-form.model';
import {
  DELIVERY_SPECS_LABELS_FR,
  type DeliverySpecsLabels,
  signatureOptionsOf,
} from './delivery-specs.labels';

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

  /**
   * Les mots du fragment. Le défaut est le français d'avant l'entrée : le
   * back-office ne passe rien et ne change pas ; l'app cliente passe sa langue.
   */
  readonly labels = input<DeliverySpecsLabels>(DELIVERY_SPECS_LABELS_FR);

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
          label: this.labels().everyDay,
          range: { start: draft.everyStart, end: draft.everyEnd },
        },
      ];
    }
    return WEEKDAYS.map((day) => ({
      key: day.value,
      label: this.labels().weekdays[day.value],
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
  protected readonly signatureOptions = computed<readonly FoldSelectOption<string>[]>(() =>
    signatureOptionsOf(this.labels(), this.signatureFloor(), this.value().noContact),
  );

  /** L'aide sous la signature : sans contact sur place, elle dit pourquoi « exigée » a disparu. */
  protected readonly signatureHint = computed(() =>
    this.value().noContact ? this.labels().signatureNoContactHint : this.labels().signatureHint,
  );

  /** « Pas de contact » : cocher fait tomber une signature exigée, posée ou héritée. */
  protected setNoContact(noContact: boolean): void {
    this.value.update((draft) => withNoContact(draft, noContact, this.signatureFloor()));
  }

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
    this.value.update((draft) => withKnownContact(draft, picked));
  }
}
