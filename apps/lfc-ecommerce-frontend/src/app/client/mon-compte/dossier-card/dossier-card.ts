import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldInputComponent,
} from 'fold-ng';

import { AccountService } from '../../../account/account.service';
import type {
  EstablishmentDraft,
  EstablishmentField,
  EstablishmentRefusal,
} from '../../../account/establishment';
import { ClientLocale } from '../../client-locale.service';
import { proAccountCopy } from '../../copy/screens/pro-account.copy';
import { ProOnboarding } from '../../pro-onboarding.service';

/** Une erreur serveur, sous la forme que `fold-input` sait afficher. */
interface ServerFieldError {
  readonly kind: 'server';
  readonly message: string;
}

/** Un refus, et ce qui avait été envoyé : l'erreur ne vaut que pour cette saisie. */
interface Failure {
  readonly refusal: EstablishmentRefusal;
  readonly draft: EstablishmentDraft;
}

const NO_ERRORS: readonly ServerFieldError[] = [];

/**
 * « Compléter mon dossier » — la déclaration de l'établissement, depuis Mon
 * compte (plan `plan-inscription-pro-seule.md` §3.3).
 *
 * Elle rattrape trois cas : le retour d'Auth0 a échoué, un inscrit d'avant la
 * porte pro dont le profil est vide, un particulier qui devient pro.
 *
 * Elle ne décide PAS quand elle s'affiche : c'est `ProOnboarding.needsDossier`
 * (aucune société, aucune déclaration en route), lu par la page qui l'insère.
 *
 * Préremplie depuis la déclaration rapportée d'Auth0 si elle a été refusée,
 * sinon depuis le profil. Le serveur valide ; chaque refus s'affiche sous son
 * champ — et s'efface dès que ce champ change, puisqu'il ne parle plus de ce
 * qui est écrit.
 */
@Component({
  selector: 'app-dossier-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldInputComponent,
  ],
  templateUrl: './dossier-card.html',
  styleUrl: './dossier-card.scss',
})
export class DossierCard {
  private readonly account = inject(AccountService);
  private readonly onboarding = inject(ProOnboarding);
  private readonly locale = inject(ClientLocale);

  protected readonly copy = computed(() => proAccountCopy(this.locale.current()));

  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly phone = signal('');
  protected readonly enseigne = signal('');

  protected readonly submitting = signal(false);

  private readonly localFailure = signal<Failure | null>(null);
  private prefilledFromProfile = false;

  /** Le refus à montrer : celui de la carte, sinon celui rapporté d'Auth0. */
  private readonly failure = computed<Failure | null>(() => {
    const local = this.localFailure();
    if (local !== null) {
      return local;
    }
    const refusal = this.onboarding.lastError();
    const draft = this.onboarding.returnedDraft();
    return refusal !== null && draft !== null ? { refusal, draft } : null;
  });

  private readonly values = computed<EstablishmentDraft>(() => ({
    firstName: this.firstName().trim(),
    lastName: this.lastName().trim(),
    phone: this.phone().trim(),
    enseigne: this.enseigne().trim(),
  }));

  /** Les erreurs de chaque champ — vides dès que le champ a changé depuis l'envoi. */
  protected readonly fieldErrors = computed<
    Record<EstablishmentField, readonly ServerFieldError[]>
  >(() => ({
    firstName: this.errorsFor('firstName'),
    lastName: this.errorsFor('lastName'),
    phone: this.errorsFor('phone'),
    enseigne: this.errorsFor('enseigne'),
  }));

  /** Un refus qui ne désigne aucun champ : il se dit en tête du formulaire. */
  protected readonly formError = computed(() => {
    const failure = this.failure();
    return failure !== null && failure.refusal.field === null ? failure.refusal.message : null;
  });

  constructor() {
    effect(() => {
      const returned = this.onboarding.returnedDraft();
      if (returned !== null) {
        this.prefilledFromProfile = true;
        untracked(() => this.fill(returned));
        return;
      }
      const profile = this.account.profile();
      if (profile !== null && !this.prefilledFromProfile) {
        this.prefilledFromProfile = true;
        untracked(() =>
          this.fill({
            firstName: profile.firstName,
            lastName: profile.lastName,
            phone: profile.phone,
            enseigne: '',
          }),
        );
      }
    });
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    const draft = this.values();
    this.submitting.set(true);
    this.localFailure.set(null);
    this.onboarding.clearFailure();
    const outcome = await this.account.declareEstablishment(draft);
    this.submitting.set(false);
    if (outcome.kind === 'refused') {
      this.localFailure.set({ refusal: outcome, draft });
    }
  }

  private errorsFor(field: EstablishmentField): readonly ServerFieldError[] {
    const failure = this.failure();
    if (
      failure === null ||
      failure.refusal.field !== field ||
      this.values()[field] !== failure.draft[field]
    ) {
      return NO_ERRORS;
    }
    return [{ kind: 'server', message: failure.refusal.message }];
  }

  private fill(draft: EstablishmentDraft): void {
    this.firstName.set(draft.firstName);
    this.lastName.set(draft.lastName);
    this.phone.set(draft.phone);
    this.enseigne.set(draft.enseigne);
  }
}
