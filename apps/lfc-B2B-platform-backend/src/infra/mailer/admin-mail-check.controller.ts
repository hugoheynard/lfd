import { Body, Controller, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";

import { AppConfig } from "../config/app-config.js";
import { Public } from "../auth/public.decorator.js";
import { RecomputeGuard } from "../auth/recompute.guard.js";
import { MAILER, type B2bMailer } from "./mailer.tokens.js";

/** Ce que l'appelant peut dire — rien d'obligatoire. */
interface MailCheckBody {
  /** La révision déployée, pour tracer QUELLE image a prouvé quoi. */
  readonly revision?: string;
}

/** Ce que l'appelant apprend. `sent` ment rarement : un échec lève. */
interface MailCheckResult {
  readonly sent: boolean;
  readonly from: string;
  readonly to: string;
  readonly revision: string;
}

/**
 * **Le contrôle de mise en service du courrier**, appelé après chaque
 * déploiement.
 *
 * Il répond à un défaut structurel du mailer, décrit dans
 * `documentation/ops/mailer-resend.md` : **il ne tombe jamais en panne
 * visible**. Sans clé il journalise et rend la main ; avec une clé mais un
 * expéditeur sur un domaine non vérifié, le fournisseur refuse et personne ne
 * regarde. Un canal mal configuré ressemble exactement à un canal qui marche.
 *
 * **Pourquoi ici et pas dans le workflow.** Un envoi depuis GitHub Actions
 * testerait Resend depuis Actions — or le maillon qui a cassé deux fois est le
 * dernier : `RUNTIME_KEYS` → `envVars` → `process.env` du NestJS. Partir d'ici
 * est la seule façon de le couvrir. Effet de bord utile : la requête réveille
 * le container endormi (`sleepAfter`), donc elle prouve aussi que l'image neuve
 * démarre — pas seulement que `wrangler deploy` a rendu 200.
 *
 * **Pourquoi l'expéditeur configuré et pas une adresse en dur.** Une adresse
 * codée ici prouverait que le DOMAINE fonctionne, pas que `MAILER_FROM_ADDRESS`
 * est juste. Le contrôle serait vert avec un expéditeur de production cassé —
 * exactement le cas rencontré le 2026-08-16, où le défaut du code pointait
 * encore vers un domaine que personne ne possède.
 *
 * **Le destinataire est l'admin de secours** (`BOOTSTRAP_ADMIN_EMAIL`) : une
 * adresse déjà configurée, déjà transmise au container, et qui est par
 * définition la boîte qu'on relève quand plus rien ne marche. Aucun réglage de
 * plus à tenir.
 *
 * L'échec **remonte** (le mailer lève `MailerSendError`), donc l'étape de
 * déploiement échoue. C'est le point : un contrôle qui journalise sans rien
 * casser est ignoré en trois semaines.
 */
@Controller("admin/ops/mail-check")
@Public()
@UseGuards(RecomputeGuard)
export class AdminMailCheckController {
  constructor(
    @Inject(MAILER) private readonly mailer: B2bMailer,
    private readonly config: AppConfig,
  ) {}

  @Post()
  @HttpCode(200)
  async check(@Body() body: MailCheckBody): Promise<MailCheckResult> {
    const revision = body.revision?.trim() ?? "";
    const stamped = revision === "" ? "révision inconnue" : revision;
    const from = this.config.mailerConfig().fromAddress;
    const to = this.config.bootstrapAdminEmail();

    // Pas d'idempotencyKey : deux déploiements de la MÊME révision doivent
    // produire deux e-mails. Dédoublonner ferait passer pour un succès un
    // second déploiement dont le courrier serait en réalité tombé.
    await this.mailer.send({
      to,
      template: "ops.deploy-check",
      data: { revision: stamped, fromAddress: from },
    });

    return { sent: true, from, to, revision: stamped };
  }
}
