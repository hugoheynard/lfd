import type { AlertKind, AlertRule } from "@lfd/contracts";
import { Inject, Injectable, Logger } from "@nestjs/common";

import { AppConfig } from "../../../infra/config/app-config.js";
import { MAILER, type B2bMailer } from "../../../infra/mailer/mailer.module.js";
import { StaffNotifier } from "../../../staff-notifications/domain/ports/staff-notifier.js";
import { ALERT_KIND_TITLES } from "../../domain/alert-labels.js";
import { alertIdempotencyKey, type AlertDraft } from "../../domain/evaluate-order.js";
import { AlertChannels, type AlertContext } from "../../domain/ports/alert-channels.js";

/**
 * Les **canaux** d'une alerte — ce qu'on fait en plus de l'inscrire au journal.
 *
 * Séparé de l'évaluation : décider *qu'il se passe quelque chose* et *prévenir
 * qui de droit* sont deux responsabilités, et les mélanger rendrait l'évaluation
 * intestable sans mailer.
 *
 * **Un canal qui échoue ne fait pas échouer la commande.** L'alerte est déjà au
 * journal ; perdre un e-mail est ennuyeux, refuser une commande passée et payée
 * pour cette raison serait absurde. On journalise et on continue.
 */
@Injectable()
export class DispatchAlertChannels extends AlertChannels {
  private readonly logger = new Logger(DispatchAlertChannels.name);

  constructor(
    private readonly notifier: StaffNotifier,
    @Inject(MAILER) private readonly mailer: B2bMailer,
    private readonly config: AppConfig,
  ) {
    super();
  }

  async dispatch(
    drafts: readonly AlertDraft[],
    rules: ReadonlyMap<AlertKind, AlertRule>,
    context: AlertContext,
  ): Promise<void> {
    await Promise.all(
      drafts.map(async (draft) => {
        const delivery = rules.get(draft.kind)?.delivery;
        if (delivery === undefined) {
          return;
        }
        if (delivery.staffInApp) {
          await this.ring(draft, context);
        }
        if (delivery.staffEmail) {
          await this.mail(draft, context);
        }
      }),
    );
  }

  /** La cloche : un sujet, une ligne, un lien. L'écran ciblé porte le détail. */
  private async ring(draft: AlertDraft, context: AlertContext): Promise<void> {
    const label = ALERT_KIND_TITLES[draft.kind];
    try {
      await this.notifier.notify([
        {
          kind: "alert.account",
          subject: `${label} — ${context.companyName}`,
          body: summarise(draft),
          link: `/comptes-clients/${context.companyId}/alertes`,
          // Même clé que l'alerte : un événement rejoué ne sonne pas deux fois.
          idempotencyKey: `notification:${alertIdempotencyKey(draft.kind, context.orderNumber)}`,
          occurredAt: context.occurredAt,
        },
      ]);
    } catch (error) {
      this.logger.error(`Notification d'alerte non émise (${draft.kind})`, error);
    }
  }

  private async mail(draft: AlertDraft, context: AlertContext): Promise<void> {
    const inbox = this.config.mailerConfig().staffInbox;
    if (inbox === null) {
      // Aucune boîte d'équipe configurée : on le DIT une fois plutôt que
      // d'échouer en silence à chaque commande.
      this.logger.warn("Canal e-mail demandé, mais aucune boîte d'équipe configurée.");
      return;
    }
    const base = this.config.adminBaseUrl();
    try {
      await this.mailer.send({
        to: inbox,
        template: "staff.account-alert",
        data: {
          companyName: context.companyName,
          ruleLabel: ALERT_KIND_TITLES[draft.kind],
          orderNumber: context.orderNumber,
          findings: draft.findings.map((finding) => finding.message),
          // Sans racine configurée, la chaîne n'est pas une URL : le gabarit omet
          // alors le bouton plutôt que d'en rendre un qui ne mène nulle part.
          accountUrl: base === null ? "" : `${base}/comptes-clients/${context.companyId}/alertes`,
        },
        // Le fournisseur ne renverra pas deux fois le même fait.
        idempotencyKey: `mail:${alertIdempotencyKey(draft.kind, context.orderNumber)}`,
      });
    } catch (error) {
      this.logger.error(`E-mail d'alerte non envoyé (${draft.kind})`, error);
    }
  }
}

/** Le premier constat, plus le compte des autres — la cloche annonce, elle n'explique pas. */
function summarise(draft: AlertDraft): string {
  const [first, ...rest] = draft.findings;
  const head = first?.message ?? "";
  return rest.length === 0 ? head : `${head} (+${rest.length} autre${rest.length > 1 ? "s" : ""})`;
}
