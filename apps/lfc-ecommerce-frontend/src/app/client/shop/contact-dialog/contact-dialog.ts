import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { ContactMessagePayload } from '@lfd/contracts';
// Valeurs par le sous-chemin sans zod : la carte qui ouvre ce dialogue est sur l'accueil (budget `cloudflare`).
import { CONTACT_BOUNDS, type PublicRequestReasonView } from '@lfd/contracts/shop-values';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
  FoldTextareaComponent,
} from 'fold-ng';

import { AuthFacade } from '../../../auth/auth.facade';
import { NotifyService } from '../../../notify.service';
import { ClientAudience } from '../../client-audience.service';
import { ClientIdentity } from '../../client-identity.service';
import { ClientLocale } from '../../client-locale.service';
import { fill } from '../../copy/client-copy.service';
import { contactDialogCopy } from '../../copy/screens/contact-dialog.copy';
import { dialogSide } from '../../panel-side';
import { ContactGateway } from '../contact.gateway';
import { localizedOr } from '../contact-settings.store';

/** Garde-fou de FRAPPE, pas une validation : l'autorité est au serveur (`EmailAddress`). */
const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

type SubjectsState = 'loading' | 'failed' | 'ready';

/**
 * **« Nous écrire »** — le message à l'équipe, par objet
 * (`documentation/contenu-ecommerce/demandes-clients.md`, §2.2 et §4).
 *
 * Remplace le `mailto:` de la carte de contact : l'objet choisi décide à quelle
 * adresse le message part, et le message est aussi rangé au back-office.
 *
 * - Les objets sont ceux du PUBLIC de l'espace courant ({@link ClientAudience}) ;
 *   le serveur revérifie qu'il est actif et visible pour ce public.
 * - Un client connecté a son nom, son e-mail et son téléphone pré-remplis ; il
 *   écrit par `/me/contact-messages`, qui prend sa société à l'espace courant.
 * - Le champ piège `lfd_trap`, qu'un humain ne voit pas, part avec le message ;
 *   le public, lui, est déduit au serveur (un objet hors public → 409, dit ici).
 */
@Component({
  selector: 'app-contact-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './contact-dialog.html',
  styleUrl: './contact-dialog.scss',
})
export class ContactDialog {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  /** Ouvre le dialogue. `stack` quand on l'ouvre depuis un panneau, qui reste dessous. */
  static open(panels: FoldPanelHostService, stack = false): FoldPanelRef<boolean | undefined> {
    return panels.open<boolean | undefined>(ContactDialog, { side: dialogSide(), stack });
  }

  private readonly ref = inject(FoldPanelRef);
  private readonly gateway = inject(ContactGateway);
  private readonly notify = inject(NotifyService);
  private readonly locale = inject(ClientLocale).current;
  private readonly audience = inject(ClientAudience).shown;
  private readonly authenticated = inject(AuthFacade).isAuthenticated;
  private readonly identity = inject(ClientIdentity);

  protected readonly c = computed(() => contactDialogCopy(this.locale()));
  protected readonly bounds = CONTACT_BOUNDS;

  protected readonly state = signal<SubjectsState>('loading');
  private readonly subjects = signal<readonly PublicRequestReasonView[]>([]);

  /** Les objets en options, libellés dans la langue de l'écran (le français à défaut). */
  protected readonly subjectOptions = computed(() =>
    this.subjects().map((subject) => ({
      value: subject.id,
      label: localizedOr(subject.label, this.locale(), subject.label.fr),
    })),
  );

  protected readonly reasonId = signal<string | null>(null);
  protected readonly name = signal(this.authenticated() ? this.identity.fullName() : '');
  protected readonly email = signal(this.authenticated() ? (this.identity.email() ?? '') : '');
  protected readonly phone = signal(this.authenticated() ? (this.identity.phone() ?? '') : '');
  protected readonly message = signal('');
  /** Le champ piège : jamais montré, jamais rempli par un humain. */
  protected readonly trapValue = signal('');

  protected readonly sending = signal(false);
  /** Le refus du serveur, dit dans le dialogue, qui reste ouvert. */
  protected readonly refusal = signal<string | null>(null);

  protected readonly messageTooLong = computed(
    () => this.message().length > CONTACT_BOUNDS.message,
  );

  protected readonly canSend = computed(
    () =>
      !this.sending() &&
      this.reasonId() !== null &&
      within(this.name(), CONTACT_BOUNDS.authorName) &&
      within(this.email(), CONTACT_BOUNDS.authorEmail) &&
      PLAUSIBLE_EMAIL.test(this.email().trim()) &&
      this.phone().trim().length <= CONTACT_BOUNDS.authorPhone &&
      within(this.message(), CONTACT_BOUNDS.message),
  );

  constructor() {
    void this.load();
  }

  protected tooLong(max: number): string {
    return fill(this.c().tooLong, { max: String(max) });
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.subjects.set(await this.gateway.reasons('contact', this.audience()));
      this.state.set('ready');
    } catch {
      this.state.set('failed');
    }
  }

  protected async send(): Promise<void> {
    const reasonId = this.reasonId();
    if (!this.canSend() || reasonId === null) {
      return;
    }
    this.sending.set(true);
    this.refusal.set(null);
    const payload: ContactMessagePayload = {
      reasonId,
      name: this.name().trim(),
      email: this.email().trim(),
      phone: this.phone().trim(),
      message: this.message().trim(),
      lfd_trap: this.trapValue(),
    };
    const refusal = await this.gateway.send(payload);
    this.sending.set(false);
    if (refusal === null) {
      this.notify.success(this.c().sent);
      this.ref.close(true);
    } else {
      this.refusal.set(refusal === '' ? this.c().refused : refusal);
    }
  }

  protected trap(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.trapValue.set(event.target.value);
    }
  }

  protected cancel(): void {
    this.ref.close(undefined);
  }
}

/** Non vide une fois rogné, et dans sa borne. */
function within(value: string, max: number): boolean {
  const trimmed = value.trim();
  return trimmed !== '' && trimmed.length <= max;
}
