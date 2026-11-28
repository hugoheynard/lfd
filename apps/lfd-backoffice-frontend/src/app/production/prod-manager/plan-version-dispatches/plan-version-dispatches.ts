import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { DossierDispatchView, PlanVersionDossierResendPayload } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInlineConfirmComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { GestureIntents } from '../../../shared/gesture-intents';
import {
  dispatchNeedsAttention,
  dispatchStandingLabel,
  dispatchStandingOf,
  resendOneQuestion,
  resendOutdatedQuestion,
} from '../../plan-versions/plan-version-wording';
import { PlanVersionsService } from '../../plan-versions/plan-versions.service';

/** Le sujet du geste « tous les pas à jour » ; une ligne a le sien (`recipient:<id>`). */
const OUTDATED_SUBJECT = 'outdated';

/** Un destinataire du dossier, déjà dit. */
interface DispatchRow {
  readonly recipientId: string;
  readonly name: string;
  readonly standing: string;
  readonly needsAttention: boolean;
  readonly requested: boolean;
  readonly lastFailed: boolean;
  readonly question: string;
}

/**
 * **Les destinataires du dossier, et le renvoi de la version courante**
 * (`documentation/fournil/les-versions-du-plan.md`) : à une
 * personne sur sa ligne, ou à tous ceux qui ne sont pas à jour.
 *
 * Le renvoi passe par la boîte d'envoi des e-mails : après le 204, le parent
 * relit les envois, et la ligne dit « Demandé » — jamais « reçu ». Le geste
 * est celui de l'arrêt (`production_count_stop:write`) : caché à qui ne l'a
 * pas. Chaque sujet a sa clé d'intention, gardée tant que le geste n'a pas
 * abouti.
 */
@Component({
  selector: 'app-plan-version-dispatches',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInlineConfirmComponent,
  ],
  templateUrl: './plan-version-dispatches.html',
  styleUrl: './plan-version-dispatches.scss',
})
export class PlanVersionDispatches {
  private readonly planVersions = inject(PlanVersionsService);
  private readonly intents = new GestureIntents();
  protected readonly allowed = inject(PermissionsStore).can('production_count_stop:write');

  /** La journée de service, `AAAA-MM-JJ`. */
  readonly date = input.required<string>();
  readonly dispatches = input.required<readonly DossierDispatchView[]>();
  /** La version courante ; `null` sans version (rien à renvoyer). */
  readonly latest = input.required<number | null>();
  /** Un renvoi a été demandé : le parent relit les envois. */
  readonly resent = output<void>();

  /** Le sujet en vol (`outdated` ou `recipient:<id>`), `null` au repos. */
  protected readonly sending = signal<string | null>(null);
  protected readonly error = signal<{ readonly subject: string; readonly message: string } | null>(
    null,
  );

  protected readonly rows = computed<readonly DispatchRow[]>(() => {
    const latest = this.latest();
    return this.dispatches().map((dispatch) => {
      const standing = dispatchStandingOf(dispatch, latest);
      return {
        recipientId: dispatch.recipientId,
        name: dispatch.name,
        standing: dispatchStandingLabel(standing),
        needsAttention: dispatchNeedsAttention(standing),
        requested: standing.kind === 'requested',
        lastFailed: dispatch.lastAttempt?.outcome === 'failed',
        question: latest === null ? '' : resendOneQuestion(latest, dispatch.name),
      };
    });
  });

  protected readonly outdatedCount = computed(
    () => this.rows().filter((row) => row.needsAttention).length,
  );

  protected readonly outdatedQuestion = computed(() => {
    const latest = this.latest();
    return latest === null ? '' : resendOutdatedQuestion(latest, this.outdatedCount());
  });

  protected readonly canResend = computed(() => this.allowed && this.latest() !== null);

  protected subjectOf(recipientId: string): string {
    return `recipient:${recipientId}`;
  }

  protected resendOne(recipientId: string): Promise<void> {
    return this.resend(this.subjectOf(recipientId), { target: 'recipient', recipientId });
  }

  protected resendOutdated(): Promise<void> {
    return this.resend(OUTDATED_SUBJECT, { target: 'outdated' });
  }

  private async resend(subject: string, payload: PlanVersionDossierResendPayload): Promise<void> {
    this.sending.set(subject);
    this.error.set(null);
    try {
      await this.planVersions.resend(this.date(), payload, this.intents.keyFor(subject));
      this.intents.done(subject);
      this.resent.emit();
    } catch (error: unknown) {
      this.error.set({
        subject,
        message: httpErrorMessage(error, 'Le dossier n’a pas pu être renvoyé. Réessayez.'),
      });
    } finally {
      this.sending.set(null);
    }
  }
}
