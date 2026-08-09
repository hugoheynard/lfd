import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import type {
  ActivationSupportPayload,
  AppointmentChannel,
  AppointmentPurpose,
  Slot,
  SupportChannel,
} from '@lfd/contracts';
import { APPOINTMENT_PURPOSES, purposeChoice, purposeShort } from '@lfd/b2b-ui/appointment';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldListboxComponent,
  FoldScrollRegionDirective,
  FoldSelectComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { AccountService } from '../../account/account.service';
import { AppointmentsService } from '../appointments.service';
import { SlotPicker } from '../slot-picker/slot-picker';
import { soonestLabel } from '../slot-picker/slots-model';
import { SupportService } from '../support.service';

/** Les motifs proposés, au format attendu par `fold-listbox`. */
const PURPOSE_OPTIONS: readonly FoldSelectOption<AppointmentPurpose>[] = APPOINTMENT_PURPOSES.map(
  (purpose) => ({ value: purpose, label: purposeChoice(purpose) }),
);

/**
 * Charge d'ouverture : l'entreprise concernée, ou `null`.
 *
 * `null` = l'appelant **ne sait pas** de quelle entreprise il s'agit (l'icône
 * contact de l'en-tête). Ce n'est pas « aucune entreprise » : le panneau la
 * **résout** alors depuis le compte — une seule société, on la prend ; plusieurs,
 * on demande laquelle ; aucune, seul le rendez-vous reste (il porte sur la
 * personne, là où `SupportRequest` est muré par la société).
 */
export interface SupportPanelData {
  readonly companyId: string | null;
}

/** Combien de jours de créneaux on demande — deux semaines suffisent à choisir. */
const SLOT_WINDOW_DAYS = 21;

/**
 * Panneau **Demande de support à l'activation** — trois chemins vers l'équipe
 * commerciale, du plus engageant au plus léger :
 *
 * 1. **Prendre rendez-vous** — le client choisit un créneau **réellement ouvert**
 *    (`GET /appointments/slots`) et le réserve. Il repart avec un rendez-vous,
 *    pas avec une demande en attente.
 * 2. **Être rappelé au plus vite** — aucune date : c'est une `SupportRequest`.
 * 3. **Par e-mail** — idem, sans numéro ni créneau.
 *
 * Le choix « prendre rendez-vous » n'est proposé **que si des créneaux existent** :
 * offrir un calendrier vide serait pire que ne rien offrir. Quand le commercial
 * n'a rien déclaré, le panneau retombe naturellement sur les deux autres chemins.
 */
@Component({
  selector: 'app-activation-support-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldSelectComponent,
    FoldListboxComponent,
    SlotPicker,
    FoldCheckboxComponent,
    FoldInputComponent,
    FoldCalloutComponent,
    FoldButtonComponent,
    FoldScrollRegionDirective,
  ],
  templateUrl: './activation-support-panel.html',
  styleUrl: './activation-support-panel.scss',
})
export class ActivationSupportPanel {
  private readonly account = inject(AccountService);
  private readonly support = inject(SupportService);
  private readonly appointments = inject(AppointmentsService);
  private readonly ref = inject(FoldPanelRef);

  readonly data = input<SupportPanelData | undefined>(undefined);

  private readonly profile = this.account.profile;
  private readonly companies = this.account.companies;
  protected readonly profilePhone = computed(() => this.profile()?.phone.trim() ?? '');
  protected readonly profileEmail = computed(() => this.profile()?.email ?? '');
  protected readonly hasProfilePhone = computed(() => this.profilePhone() !== '');

  /**
   * Le **motif**, commun aux trois chemins : la question « de quoi s'agit-il ? »
   * ne change pas selon qu'on réserve, qu'on demande un rappel ou qu'on écrit.
   */
  protected readonly purposes = PURPOSE_OPTIONS;
  protected readonly purpose = signal<AppointmentPurpose>('discover');
  /** Le motif en version courte — c'est lui qui fera l'objet de l'e-mail. */
  protected readonly purposeLabel = computed(() => purposeShort(this.purpose()));

  protected readonly channel = signal<SupportChannel>('phone');
  protected readonly useOtherNumber = signal(false);
  protected readonly customPhone = signal('');
  protected readonly asap = signal(true);
  protected readonly message = signal('');

  /** Les créneaux ouverts, chargés à l'ouverture du panneau. */
  private readonly slots = signal<readonly Slot[]>([]);
  /** Les canaux que le commercial propose (téléphone, visio, sur place). */
  protected readonly meetingChannels = signal<readonly AppointmentChannel[]>([]);
  /** Le créneau retenu (`startAt` ISO), vide tant qu'on n'a rien choisi. */
  protected readonly chosenSlot = signal('');
  /** Le canal du rendez-vous, parmi ceux que le commercial propose. */
  protected readonly meetingChannel = signal<AppointmentChannel>('phone');

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  /** Une fois la demande envoyée : on montre la confirmation. */
  protected readonly placed = signal(false);
  /** La confirmation diffère : un rendez-vous est pris, une demande est en attente. */
  protected readonly booked = signal(false);

  protected readonly isPhone = computed(() => this.channel() === 'phone');
  /** Y a-t-il quelque chose à réserver ? Sinon on ne propose pas le choix. */
  protected readonly canBook = computed(() => this.slots().length > 0);

  /** La société choisie quand la personne en a plusieurs et qu'on lui demande. */
  private readonly pickedCompany = signal<string | null>(null);

  /** Les entreprises entre lesquelles choisir, au format `fold-listbox`. */
  protected readonly companyOptions = computed<readonly FoldSelectOption<string>[]>(() =>
    this.companies().map((company) => ({ value: company.id, label: company.raisonSociale })),
  );

  /**
   * La société sur laquelle déposer la demande : celle que l'appelant impose,
   * celle qu'on vient de choisir, ou **la seule** que la personne possède —
   * lui demander de la désigner quand il n'y en a qu'une serait une question
   * dont on connaît déjà la réponse.
   */
  protected readonly targetCompanyId = computed<string | null>(() => {
    const given = this.data()?.companyId ?? null;
    if (given !== null) {
      return given;
    }
    const picked = this.pickedCompany();
    if (picked !== null) {
      return picked;
    }
    const list = this.companies();
    return list.length === 1 ? (list[0]?.id ?? null) : null;
  });

  /** On ne pose la question que si elle a plusieurs réponses possibles. */
  protected readonly needsCompanyChoice = computed(
    () => this.data()?.companyId == null && this.companies().length > 1,
  );

  /**
   * **Aucune** entreprise au compte : les deux chemins de repli n'ont nulle part
   * où se poser, seule la réservation reste — elle portera sur la personne.
   */
  protected readonly bookingOnly = computed(
    () => this.data()?.companyId == null && this.companies().length === 0,
  );

  /** Le client est en train de réserver un créneau (et non de demander un rappel). */
  protected readonly isBooking = computed(
    () => this.canBook() && (this.bookingOnly() || (this.isPhone() && !this.asap())),
  );

  /**
   * Rien à proposer : ni créneau ouvert, ni société sur laquelle déposer une
   * demande. On le dit, et on renvoie vers le contact direct — plutôt qu'un
   * formulaire qui n'aboutirait nulle part.
   */
  protected readonly nothingToOffer = computed(() => this.bookingOnly() && !this.canBook());

  protected readonly openSlots = computed(() => this.slots());
  protected readonly today = isoDay(0);
  protected readonly tomorrow = isoDay(1);

  /**
   * Le **premier créneau ouvert**, écrit en toutes lettres. C'est ce qui rend
   * « au plus vite » honnête : sans repère, personne ne sait s'il sera rappelé
   * dans l'heure ou la semaine prochaine. `null` quand il n'y a rien à
   * promettre — et on ne promet alors rien.
   */
  protected readonly soonest = computed(() =>
    soonestLabel(this.slots(), this.today, this.tomorrow),
  );
  /** Saisie d'un numéro : soit pas de numéro au profil, soit « un autre numéro ». */
  protected readonly showCustomPhone = computed(
    () => !this.hasProfilePhone() || this.useOtherNumber(),
  );
  protected readonly resolvedPhone = computed(() =>
    this.hasProfilePhone() && !this.useOtherNumber()
      ? this.profilePhone()
      : this.customPhone().trim(),
  );

  /** « Autre demande » exige une précision — même règle que le contrat. */
  protected readonly needsDetail = computed(
    () => this.purpose() === 'other' && this.message().trim() === '',
  );

  protected readonly canSubmit = computed(() => {
    if (this.submitting() || this.placed() || this.needsDetail()) {
      return false;
    }
    if (!this.isPhone()) {
      return true;
    }
    if (this.bookingOnly()) {
      return this.chosenSlot() !== '';
    }
    // Une demande de rappel ou d'e-mail se dépose SUR une société : tant qu'on
    // n'a pas tranché laquelle, il n'y a rien à envoyer.
    if (this.targetCompanyId() === null) {
      return false;
    }
    if (this.resolvedPhone() === '') {
      return false;
    }
    return this.asap() || this.chosenSlot() !== '';
  });

  constructor() {
    void this.loadSlots();
  }

  /**
   * Charge les créneaux. En cas d'échec on ne bloque pas le panneau : les deux
   * chemins non datés restent ouverts, et le client peut quand même joindre
   * l'équipe — c'est tout l'intérêt de les avoir gardés.
   */
  private loadSlots(): void {
    const from = isoDay(0);
    const to = isoDay(SLOT_WINDOW_DAYS);
    this.appointments.slots(from, to).subscribe({
      next: (view) => {
        this.slots.set(view.slots);
        this.meetingChannels.set(view.channels);
        const first = view.channels[0];
        if (first !== undefined) {
          this.meetingChannel.set(first);
        }
      },
      error: () => this.slots.set([]),
    });
  }

  protected chooseSlot(startAt: string): void {
    this.chosenSlot.set(startAt);
  }

  protected onMeetingChannel(value: string): void {
    const channel = this.meetingChannels().find((c) => c === value);
    if (channel !== undefined) {
      this.meetingChannel.set(channel);
    }
  }

  protected onCompany(value: string | null): void {
    this.pickedCompany.set(value);
  }

  protected onPurpose(value: AppointmentPurpose | null): void {
    if (value !== null) {
      this.purpose.set(value);
    }
  }

  protected onChannel(value: string): void {
    this.channel.set(value === 'email' ? 'email' : 'phone');
  }

  /** Lit la valeur d'un `<input>` / `<textarea>` natif sans caster en `any`. */
  protected inputValue(event: Event): string {
    const el = event.target;
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : '';
  }

  protected submit(): void {
    const data = this.data();
    if (!this.canSubmit() || data === undefined) {
      return;
    }
    const companyId = this.targetCompanyId();
    this.submitting.set(true);
    this.errorMessage.set(null);
    if (this.isBooking()) {
      this.bookSlot(companyId);
      return;
    }
    // Les chemins de repli exigent une société : ils passent par SupportRequest,
    // qui est muré. `canSubmit` l'a déjà garanti ; ce garde re-narrow le type.
    if (companyId === null) {
      this.submitting.set(false);
      return;
    }
    const phone = this.isPhone();
    const payload: ActivationSupportPayload = {
      channel: this.channel(),
      purpose: this.purpose(),
      phoneNumber: phone ? this.resolvedPhone() : '',
      asap: true,
      scheduledDate: null,
      slot: null,
      message: this.message().trim(),
    };
    this.support.requestActivation(companyId, payload).subscribe({
      next: () => {
        this.placed.set(true);
        this.submitting.set(false);
      },
      error: () => {
        this.submitting.set(false);
        this.errorMessage.set("L'envoi de la demande a échoué. Réessayez.");
      },
    });
  }

  /**
   * Réserve le créneau retenu. Un **409** signifie que quelqu'un vient de le
   * prendre : on recharge les créneaux et on le dit, plutôt que d'afficher une
   * erreur générique devant une liste devenue fausse.
   */
  private bookSlot(companyId: string | null): void {
    this.appointments
      .book({
        startAt: this.chosenSlot(),
        channel: this.meetingChannel(),
        purpose: this.purpose(),
        companyId,
        contactName: '',
        contactPhone: this.resolvedPhone(),
        message: this.message().trim(),
      })
      .subscribe({
        next: () => {
          this.booked.set(true);
          this.placed.set(true);
          this.submitting.set(false);
        },
        error: () => {
          this.submitting.set(false);
          this.chosenSlot.set('');
          this.loadSlots();
          this.errorMessage.set("Ce créneau vient d'être réservé. Choisissez-en un autre.");
        },
      });
  }

  protected close(): void {
    this.ref.close(this.placed());
  }
}

/** Le jour local dans `offset` jours, au format `AAAA-MM-JJ`. */
function isoDay(offset: number): string {
  return new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
