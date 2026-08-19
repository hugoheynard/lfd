import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";

import { AppConfig } from "../config/app-config.js";
import { auditCapabilities, type MissingCapability } from "./capability-audit.js";

/**
 * Le **bulletin de démarrage** : ce que cette instance ne saura pas faire, dit
 * une fois, en clair, au moment où quelqu'un regarde encore les logs.
 *
 * Il répond à une panne vécue deux fois le même jour : le système *savait* qu'il
 * était incomplet, il l'a écrit là où personne ne lit, et le symptôme est
 * apparu des heures plus tard sous une forme qui n'orientait vers rien. Un
 * réglage absent n'est pas une erreur — c'est une **capacité éteinte**, et ça se
 * dit à voix haute.
 *
 * Deux sources s'y rejoignent :
 * - ce que la **configuration** permet de déduire seule ({@link auditCapabilities}) ;
 * - ce qu'un module a **constaté** en démarrant (`report()`), qu'aucune lecture
 *   de configuration ne pouvait prévoir — une migration manquante, par exemple.
 *
 * Il se lit à `onApplicationBootstrap`, donc **après** tous les `onModuleInit` :
 * c'est ce qui laisse aux modules le temps de signaler leurs propres pannes
 * avant que le bulletin ne soit imprimé.
 */
@Injectable()
export class StartupReport implements OnApplicationBootstrap {
  private readonly logger = new Logger("Démarrage");
  private readonly reported: MissingCapability[] = [];

  constructor(private readonly config: AppConfig) {}

  /**
   * Signale une capacité éteinte **constatée à l'exécution**, que la
   * configuration ne pouvait pas annoncer.
   */
  report(missing: MissingCapability): void {
    this.reported.push(missing);
  }

  /**
   * L'inventaire **courant** : ce que la configuration permet de déduire, plus
   * ce que les modules ont constaté.
   *
   * Public parce que le bulletin ne suffit pas. Il est imprimé **une fois**, au
   * démarrage : le lire suppose d'avoir attaché un journal à ce moment-là. Le
   * 2026-08-16 il a été imprimé dans le vide — aucune observabilité sur le
   * Worker — et l'enquête a cherché ailleurs ce qu'il disait déjà. Le même
   * constat, **interrogeable**, se demande quand la question se pose, pas quand
   * le container redémarre.
   */
  missing(): readonly MissingCapability[] {
    return [...auditCapabilities(this.snapshot()), ...this.reported];
  }

  onApplicationBootstrap(): void {
    const missing = this.missing();
    if (missing.length === 0) {
      this.logger.log("Tous les canaux sont configurés.");
      return;
    }

    // `error` pour ce qui ferme une porte du produit : c'est le niveau que les
    // alertes d'hébergeur remontent, et un canal bloquant en production doit
    // réveiller quelqu'un plutôt que d'attendre qu'un client s'en plaigne.
    const blocking = missing.filter((entry) => entry.severity === "blocking");
    this.logger.warn(
      `Démarré en mode dégradé — ${String(missing.length)} canal(aux) indisponible(s), ` +
        `dont ${String(blocking.length)} bloquant(s).`,
    );
    for (const entry of missing) {
      const line = `· ${entry.capability} — ${entry.setting} absent → ${entry.consequence}`;
      if (entry.severity === "blocking") {
        this.logger.error(line);
      } else {
        this.logger.warn(line);
      }
    }
  }

  /** L'état des réglages, réduit à des booléens : aucune valeur n'est lue ici. */
  private snapshot() {
    return {
      hasManagementCredentials: this.config.auth0ManagementCredentials() !== null,
      hasAdminAudience: this.config.auth0AdminAudience() !== null,
      hasMailerKey: this.config.mailerConfig().apiKey !== null,
      hasStorage: this.config.r2Storage("kbis") !== null,
      hasStripe: this.config.stripeConfig() !== null,
      hasClientBaseUrl: this.config.clientBaseUrl() !== null,
      hasShopifyCredentials: this.config.hasShopifyCredentials(),
      hasAdminBaseUrl: this.config.adminBaseUrl() !== null,
    };
  }
}
