import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent, FoldInputComponent } from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { marketingConsentCopy } from '../../copy/screens/marketing-consent.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { consentText } from '../../marketing/consent-answer';
import { PRIVACY_PAGE } from '../../marketing/marketing-consent-box/marketing-consent-box';
import {
  NewsletterSignup as NewsletterSignupService,
  type NewsletterOutcome,
} from '../../marketing/newsletter-signup.service';

/** Une erreur sous le champ, sous la forme que `fold-input` sait afficher. */
interface FieldError {
  readonly kind: 'newsletter';
  readonly message: string;
}

const NO_ERRORS: readonly FieldError[] = [];
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * **« Recevoir nos nouvelles »**, dans le pied de page (plan
 * `documentation/mail/la-desinscription-et-l-accord.md`, lot C5).
 *
 * 🔴 **Toujours la même réponse** après l'envoi, quelle que soit l'adresse :
 * dire « déjà inscrite » ou « désinscrite » ferait du champ un oracle
 * (règle 17). Seuls le débit (429) et une forme refusée se disent autrement.
 *
 * Le champ `website` est un piège à robots : hors écran, `aria-hidden`, hors
 * de la tabulation — un humain ne le voit ni ne l'entend, et le laisse vide.
 */
@Component({
  selector: 'app-newsletter-signup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldInputComponent],
  templateUrl: './newsletter-signup.html',
  styleUrl: './newsletter-signup.scss',
})
export class NewsletterSignup {
  private readonly service = inject(NewsletterSignupService);
  private readonly locale = inject(ClientLocale);
  private readonly t = inject(ClientCopyService).t;
  protected readonly copy = screenCopy('marketingConsent', marketingConsentCopy);
  protected readonly privacyPage = PRIVACY_PAGE;

  protected readonly email = signal('');
  protected readonly trap = signal('');
  protected readonly sending = signal(false);
  protected readonly outcome = signal<NewsletterOutcome | null>(null);

  protected readonly sentence = computed(() => consentText(this.copy(), 'newsletter'));
  protected readonly linkName = computed(() =>
    fill(this.t().nav.newTab, { name: this.copy().privacyLink }),
  );

  /** L'erreur de forme, attachée au champ (et annoncée par lui). */
  protected readonly errors = computed<readonly FieldError[]>(() =>
    this.outcome() === 'invalid'
      ? [{ kind: 'newsletter', message: this.copy().newsletterInvalid }]
      : NO_ERRORS,
  );

  /** La phrase qui suit l'envoi, et son ton. `null` : rien à dire. */
  protected readonly notice = computed(() => {
    const copy = this.copy();
    switch (this.outcome()) {
      case 'sent':
        return { variant: 'success' as const, text: copy.newsletterSent };
      case 'too-many':
        return { variant: 'warning' as const, text: copy.newsletterTooMany };
      case 'failed':
        return { variant: 'alert' as const, text: copy.newsletterFailed };
      default:
        return null;
    }
  });

  protected async submit(): Promise<void> {
    if (this.sending()) {
      return;
    }
    const email = this.email().trim();
    if (!EMAIL_SHAPE.test(email)) {
      this.outcome.set('invalid');
      return;
    }
    this.sending.set(true);
    this.outcome.set(null);
    const outcome = await this.service.signUp(email, this.trap(), this.locale.current());
    this.sending.set(false);
    this.outcome.set(outcome);
    if (outcome === 'sent') {
      this.email.set('');
    }
  }

  /** Le piège se lit sans `$any` : un `<input>` natif, typé à la lecture. */
  protected readTrap(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.trap.set(target.value);
    }
  }
}
