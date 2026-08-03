import { ChangeDetectionStrategy, Component, computed, input, model } from "@angular/core";
import type { DeliveryContact, Weekday } from "@lfd/contracts";
import { FoldCheckboxComponent, FoldInputComponent, FoldSelectComponent } from "fold-ng";

import { formatDeliveryContact, WEEKDAYS } from "../delivery-format";
import { contactIssueOf, gpsIssueOf, slotIssueOf, type AddressDraft } from "../address-form.model";

/**
 * Champs d'une **adresse** (facturation ou livraison) — fragment de formulaire
 * pur, partagé par les panneaux d'adresse des deux frontends B2B. Un `model`
 * two-way `value` porte le brouillon ; le container garde l'en-tête, le pied et
 * la sauvegarde. Le bloc **livraison** (défaut, note, créneaux, contact, GPS) ne
 * s'affiche que pour `kind = 'livraison'`. Les messages d'erreur *de forme* sont
 * calculés ici ; la validité globale (`isAddressValid`) est au container.
 */
@Component({
  selector: "lfd-address-fields",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldInputComponent, FoldCheckboxComponent, FoldSelectComponent],
  templateUrl: "./address-fields.html",
  styleUrl: "./address-fields.scss",
})
export class AddressFields {
  /** Brouillon d'adresse (two-way). */
  readonly value = model.required<AddressDraft>();
  /** Facturation (postal seul) ou livraison (postal + consignes). */
  readonly kind = input<"facturation" | "livraison">("livraison");
  /** Contacts connus de l'entreprise, proposés pour préremplir le contact sur place. */
  readonly knownContacts = input<readonly DeliveryContact[]>([]);

  protected readonly weekdays = WEEKDAYS;
  protected readonly isLivraison = computed(() => this.kind() === "livraison");

  protected readonly slotIssue = computed(() => slotIssueOf(this.value()));
  protected readonly contactIssue = computed(() =>
    this.isLivraison() ? contactIssueOf(this.value()) : "",
  );
  protected readonly gpsIssue = computed(() =>
    this.isLivraison() ? gpsIssueOf(this.value()) : "",
  );

  /** Nom lisible d'un contact connu, pour l'option du select. */
  protected contactLabel(contact: DeliveryContact): string {
    return formatDeliveryContact(contact);
  }

  /** Lit la valeur d'un `<input>` / `<textarea>` natif sans caster en `any`. */
  protected inputValue(event: Event): string {
    const el = event.target;
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : "";
  }

  protected set<K extends keyof AddressDraft>(key: K, value: AddressDraft[K]): void {
    this.value.update((draft) => ({ ...draft, [key]: value }));
  }

  /** Met à jour un bout d'un créneau journalier, immuablement. */
  protected setDay(day: Weekday, field: "start" | "end", value: string): void {
    this.value.update((draft) => ({
      ...draft,
      days: { ...draft.days, [day]: { ...draft.days[day], [field]: value } },
    }));
  }

  /** « Reprendre un contact connu » : recopie ses champs et lève « pas de contact ». */
  protected onPickContact(index: string): void {
    const picked = this.knownContacts()[Number(index)];
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
