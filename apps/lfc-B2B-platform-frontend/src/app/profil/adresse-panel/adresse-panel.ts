import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCheckboxComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldSelectComponent,
} from 'fold-ng';

import {
  type Adresse,
  type AdresseLivraison,
  type DeliveryContact,
  type DeliverySlots,
  formatDeliveryContact,
  type GpsPoint,
  type SlotByDay,
  type Weekday,
  WEEKDAYS,
} from '../../data/profil.model';
import { type AdresseLivraisonDraft, ProfilService } from '../../data/profil.service';
import {
  BLANK_DAYS,
  type DraftDays,
  fromSlotByDay,
  gpsIssueOf,
  isBadSlot,
  toSlot,
} from './adresse-panel.helpers';

/**
 * Charge d'ouverture du panneau. Union **discriminée** par `kind` : une
 * facturation édite toujours une adresse existante (jamais de créneaux) ; une
 * livraison crée (`null`) ou édite une `AdresseLivraison` (note + créneaux).
 */
export type AdressePanelData =
  | { readonly kind: 'facturation'; readonly address: Adresse }
  | { readonly kind: 'livraison'; readonly address: AdresseLivraison | null };

/**
 * Panneau **Adresse** — crée ou édite une adresse de facturation (unique) ou de
 * livraison (plusieurs, une par défaut). Une livraison porte en plus une note
 * pour les livreurs et des créneaux préférés (un créneau global tous les jours,
 * ou un créneau par jour).
 */
@Component({
  selector: 'app-adresse-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldInputComponent,
    FoldCheckboxComponent,
    FoldSelectComponent,
    FoldButtonComponent,
  ],
  templateUrl: './adresse-panel.html',
  styleUrl: './adresse-panel.scss',
})
export class AdressePanel {
  private readonly profil = inject(ProfilService);
  private readonly ref = inject(FoldPanelRef);

  readonly data = input<AdressePanelData | undefined>(undefined);
  protected readonly weekdays = WEEKDAYS;

  protected readonly kind = computed(() => this.data()?.kind ?? 'livraison');
  protected readonly isLivraison = computed(() => this.kind() === 'livraison');
  protected readonly isCreate = computed(() => (this.data()?.address ?? null) === null);

  // Champs postaux (communs facturation / livraison).
  protected readonly label = signal('');
  protected readonly ligne1 = signal('');
  protected readonly ligne2 = signal('');
  protected readonly codePostal = signal('');
  protected readonly ville = signal('');
  protected readonly pays = signal('France');
  protected readonly isDefaut = signal(false);

  // Consignes de livraison.
  protected readonly note = signal('');
  protected readonly sameEveryDay = signal(true);
  protected readonly everyStart = signal('');
  protected readonly everyEnd = signal('');
  protected readonly days = signal<DraftDays>(BLANK_DAYS);

  // Contact sur place. « Pas de contact » est un choix explicite (case cochée).
  protected readonly knownContacts = this.profil.knownContacts;
  protected readonly noContact = signal(false);
  protected readonly contactPick = signal('');
  protected readonly contactPrenom = signal('');
  protected readonly contactNom = signal('');
  protected readonly contactTel = signal('');

  // Point GPS (lieux mal géocodés) — les deux champs, ou aucun.
  protected readonly gpsLat = signal('');
  protected readonly gpsLng = signal('');

  constructor() {
    // Préremplit les champs à l'ouverture. `data` est fixé et ne change plus :
    // l'effet sème une seule fois.
    effect(() => {
      const data = this.data();
      if (data === undefined) {
        return;
      }
      if (data.address !== null) {
        this.seedPostal(data.address);
      }
      if (data.kind === 'livraison' && data.address !== null) {
        this.seedSpecs(data.address);
      }
    });
  }

  private seedPostal(a: Adresse): void {
    this.label.set(a.label);
    this.ligne1.set(a.ligne1);
    this.ligne2.set(a.ligne2);
    this.codePostal.set(a.codePostal);
    this.ville.set(a.ville);
    this.pays.set(a.pays);
    this.isDefaut.set(a.isDefaut);
  }

  private seedSpecs(a: AdresseLivraison): void {
    this.note.set(a.note);
    this.seedSlots(a.slots);
    this.seedContact(a.deliveryContact);
    if (a.gps !== null) {
      this.gpsLat.set(String(a.gps.lat));
      this.gpsLng.set(String(a.gps.lng));
    }
  }

  private seedSlots(slots: DeliverySlots): void {
    if (slots.mode === 'everyday') {
      this.sameEveryDay.set(true);
      this.everyStart.set(slots.slot?.start ?? '');
      this.everyEnd.set(slots.slot?.end ?? '');
      return;
    }
    this.sameEveryDay.set(false);
    this.days.set(fromSlotByDay(slots.byDay));
  }

  private seedContact(contact: DeliveryContact | null): void {
    if (contact === null) {
      this.noContact.set(true);
      return;
    }
    this.contactPrenom.set(contact.prenom);
    this.contactNom.set(contact.nom);
    this.contactTel.set(contact.telephone);
  }

  /** Nom lisible d'un contact connu, pour l'option du select. */
  protected contactLabel(contact: DeliveryContact): string {
    return formatDeliveryContact(contact);
  }

  /** « Reprendre un contact connu » : recopie ses champs et lève « pas de contact ». */
  protected onPickContact(index: string): void {
    this.contactPick.set(index);
    const picked = this.knownContacts()[Number(index)];
    if (picked === undefined) {
      return;
    }
    this.noContact.set(false);
    this.contactPrenom.set(picked.prenom);
    this.contactNom.set(picked.nom);
    this.contactTel.set(picked.telephone);
  }

  protected readonly heading = computed(() => {
    if (this.kind() === 'facturation') {
      return 'Adresse de facturation';
    }
    return this.isCreate() ? 'Nouvelle adresse de livraison' : "Modifier l'adresse de livraison";
  });

  /** Lit la valeur d'un `<input>` / `<textarea>` natif sans caster en `any`. */
  protected inputValue(event: Event): string {
    const el = event.target;
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : '';
  }

  /** Met à jour un bout d'un créneau journalier, immuablement. */
  protected setDay(day: Weekday, field: 'start' | 'end', value: string): void {
    this.days.update((d) => ({ ...d, [day]: { ...d[day], [field]: value } }));
  }

  /** Un créneau à moitié rempli ou à l'envers bloque l'enregistrement. */
  protected readonly slotIssue = computed(() => {
    if (this.sameEveryDay()) {
      return isBadSlot(this.everyStart(), this.everyEnd())
        ? 'Renseignez une heure de début ET de fin, la fin après le début.'
        : '';
    }
    const d = this.days();
    return WEEKDAYS.some((w) => isBadSlot(d[w.value].start, d[w.value].end))
      ? 'Chaque créneau renseigné doit avoir un début et une fin valides.'
      : '';
  });

  /** Un contact est attendu, sauf « pas de contact » : alors les trois champs. */
  protected readonly contactIssue = computed(() => {
    if (!this.isLivraison() || this.noContact()) {
      return '';
    }
    const complete =
      this.contactPrenom().trim() !== '' &&
      this.contactNom().trim() !== '' &&
      this.contactTel().trim() !== '';
    return complete ? '' : 'Renseignez prénom, nom et téléphone, ou cochez « pas de contact ».';
  });

  /** GPS : les deux coordonnées ou aucune, dans les bornes. */
  protected readonly gpsIssue = computed(() => {
    if (!this.isLivraison()) {
      return '';
    }
    return gpsIssueOf(this.gpsLat().trim(), this.gpsLng().trim());
  });

  protected readonly canSubmit = computed(
    () =>
      this.ligne1().trim() !== '' &&
      this.codePostal().trim() !== '' &&
      this.ville().trim() !== '' &&
      this.slotIssue() === '' &&
      this.contactIssue() === '' &&
      this.gpsIssue() === '',
  );

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    if (this.kind() === 'facturation') {
      this.profil.updateBillingAddress({ ...this.postalDraft(), isDefaut: false });
      this.ref.close(true);
      return;
    }
    const draft: AdresseLivraisonDraft = {
      ...this.postalDraft(),
      note: this.note().trim(),
      slots: this.buildSlots(),
      deliveryContact: this.buildContact(),
      gps: this.buildGps(),
    };
    this.profil.saveDeliveryAddress(draft, this.data()?.address?.id ?? null);
    this.ref.close(true);
  }

  private buildContact(): DeliveryContact | null {
    if (this.noContact()) {
      return null;
    }
    return {
      prenom: this.contactPrenom().trim(),
      nom: this.contactNom().trim(),
      telephone: this.contactTel().trim(),
    };
  }

  private buildGps(): GpsPoint | null {
    const lat = this.gpsLat().trim();
    const lng = this.gpsLng().trim();
    if (lat === '' || lng === '') {
      return null;
    }
    return { lat: Number(lat), lng: Number(lng) };
  }

  private postalDraft(): Omit<Adresse, 'id'> {
    return {
      label: this.label().trim(),
      ligne1: this.ligne1().trim(),
      ligne2: this.ligne2().trim(),
      codePostal: this.codePostal().trim(),
      ville: this.ville().trim(),
      pays: this.pays().trim(),
      isDefaut: this.isDefaut(),
    };
  }

  private buildSlots(): DeliverySlots {
    if (this.sameEveryDay()) {
      return { mode: 'everyday', slot: toSlot(this.everyStart(), this.everyEnd()) };
    }
    const d = this.days();
    const byDay: SlotByDay = {
      mon: toSlot(d.mon.start, d.mon.end),
      tue: toSlot(d.tue.start, d.tue.end),
      wed: toSlot(d.wed.start, d.wed.end),
      thu: toSlot(d.thu.start, d.thu.end),
      fri: toSlot(d.fri.start, d.fri.end),
      sat: toSlot(d.sat.start, d.sat.end),
      sun: toSlot(d.sun.start, d.sun.end),
    };
    return { mode: 'perDay', byDay };
  }

  protected cancel(): void {
    this.ref.close();
  }
}
