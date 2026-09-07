import type { DevSeedReport } from "@lfd/contracts";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AppConfig } from "../platform/config/app-config.js";
import { PrismaService } from "../platform/database/prisma.service.js";
import { Clock } from "../platform/time/clock.js";
import { seedClient } from "./seeding/client.seed.js";
import { seedOrders } from "./seeding/orders.seed.js";
import { resetToSeed } from "./seeding/reset.seed.js";
import { seedStation } from "./seeding/station.seed.js";
import { clearSeededBuckets } from "./seeding/storage.seed.js";

/**
 * **Recharger le jeu de données de développement**, depuis l'application
 * elle-même.
 *
 * Les scripts CLI font déjà ce travail. Ce service existe parce qu'un
 * rechargement demandé depuis un écran n'a pas de terminal sous la main : on
 * montre une démo, la journée a tourné, la « commande de demain » est devenue
 * celle d'hier, et il faut la recaler sans quitter le navigateur.
 *
 * ## Trois serrures, et une seule suffirait
 *
 * 1. **La cible.** Ce service refuse toute base qui n'est pas un Postgres direct
 *    et local. En production l'URL est une URL Accelerate (`prisma://`) : le
 *    rechargement y est **inexprimable**, pas seulement interdit.
 * 2. **L'environnement.** `NODE_ENV=production` referme la porte, quelle que
 *    soit la base.
 * 3. **La surface.** La route vit derrière le mur staff, comme le reste de
 *    `/admin`.
 * 4. **Le stockage.** `clearSeededBuckets` refuse tout point de terminaison qui
 *    n'est pas en boucle locale — la serrure la plus basse, et la seule qui
 *    rende le geste inexprimable contre R2 plutôt qu'interdit.
 *
 * Trois plutôt qu'une parce que celle qui compte — la première — est un
 * raisonnement sur une chaîne de connexion, et qu'un jour quelqu'un branchera un
 * tunnel local sur une base distante.
 */
@Injectable()
export class DevSeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandBus,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  /**
   * Efface ce que le seed ne déclare pas, repose la station, le client et ses
   * commandes. **Dans cet ordre** : les commandes visent des adresses et des
   * points que les deux étapes précédentes posent.
   */
  async reload(): Promise<DevSeedReport> {
    this.refuseUnlessLocalDevelopment();
    // UN seul instant pour tout le semis, pris au port. Chaque module le lisait
    // au mur, au fond de ses propres fonctions : le jeu de données n'était donc
    // ni gelable ni rejouable, et deux modules d'un même rechargement pouvaient
    // voir deux instants — sur un semis qui date des commandes par décalage.
    const context = { prisma: this.prisma, commands: this.commands, now: this.clock.now() };
    await seedStation(context);
    await seedClient(context);
    const reset = await resetToSeed(this.prisma);
    // Les buckets APRÈS la coupe et AVANT le semis : les commandes qui
    // possédaient ces documents n'existent plus, et celles qu'on va poser n'en
    // ont pas encore. Vider avant la coupe laisserait une fenêtre où une
    // commande vivante n'a plus son bon.
    const storage = await clearSeededBuckets([
      this.config.r2Storage("customers"),
      this.config.r2Storage("production"),
    ]);
    const orders = await seedOrders(context);
    return { reset, orders, storage };
  }

  /**
   * La serrure, à l'usage plutôt qu'au démarrage.
   *
   * Au démarrage, elle empêcherait l'API de booter sur une machine mal
   * configurée — un refus disproportionné pour un outil de confort. Ici elle ne
   * refuse que le geste, et elle dit pourquoi.
   */
  private refuseUnlessLocalDevelopment(): void {
    if (this.config.isProduction()) {
      throw new ServiceUnavailableException(
        "Le rechargement du jeu de données n'existe pas en production.",
      );
    }
    const url = this.config.databaseUrl();
    if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
      throw new ServiceUnavailableException(
        "Base non locale : le rechargement n'écrit que vers un Postgres direct.",
      );
    }
    const host = new URL(url).hostname;
    if (!LOCAL_HOSTS.has(host)) {
      throw new ServiceUnavailableException(
        `Base non locale (« ${host} ») : le rechargement supprime des sociétés et des commandes.`,
      );
    }
  }
}

/**
 * Les hôtes acceptés comme « ma machine ». Une **liste blanche**, et non une
 * négation de l'hôte de production : ce qui n'est pas explicitement local doit
 * être refusé, y compris ce qu'on n'a pas pensé à interdire.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
