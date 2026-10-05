import type {
  DevSeedDeliveryReport,
  DevSeedDriverReport,
  DevSeedOrdersOnlyReport,
  DevSeedOrdersReport,
  DevSeedReport,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AppConfig } from "../platform/config/app-config.js";
import { PrismaService } from "../platform/database/prisma.service.js";
import { BackgroundWork } from "../platform/events/background-work.js";
import { Clock } from "../platform/time/clock.js";
import type { SeedDriverAssignment } from "./seeding/delivery-driver.seed.js";
import { seedAccounting } from "./seeding/accounting.seed.js";
import { seedClient, seedImpersonatedAccess, seedPendingCompany } from "./seeding/client.seed.js";
import { resetDeliveryRounds } from "./seeding/delivery-rounds.seed.js";
import { type OrdersReport, seedOrders } from "./seeding/orders.seed.js";
import { resetProduction } from "./seeding/production.seed.js";
import { resetToSeed } from "./seeding/reset.seed.js";
import { seedLegalDocuments } from "./seeding/legal-documents.seed.js";
import { seedStation } from "./seeding/station.seed.js";
import { refuseUnlessLocalDevelopment } from "./local-development.lock.js";
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
 *    et local — schéma **et hôte**. Le schéma seul ne suffit plus : la
 *    production sort d'Accelerate (`prisma+postgres://`) pour le pooler
 *    mutualisé, qui s'écrit `postgres://…@pooled.db.prisma.io`
 *    (`documentation/ops/plan-sortie-d-accelerate.md`). C'est l'hôte, hors de
 *    la liste blanche {@link LOCAL_HOSTS}, qui rend le rechargement
 *    **inexprimable** contre elle, pas seulement interdit.
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
    private readonly work: BackgroundWork,
  ) {}

  /**
   * `requester` est la fiche staff de qui a cliqué : la tournée chargée lui
   * est affectée (cf. `assignSeedDriver`).
   *
   * Efface ce que le seed ne déclare pas, repose la station, l'entité émettrice,
   * le client et ses commandes. **Dans cet ordre** : les commandes visent des adresses et des
   * points que les deux étapes précédentes posent.
   */
  async reload(requester: string): Promise<DevSeedReport> {
    refuseUnlessLocalDevelopment(this.config);
    // UN seul instant pour tout le semis, pris au port. Chaque module le lisait
    // au mur, au fond de ses propres fonctions : le jeu de données n'était donc
    // ni gelable ni rejouable, et deux modules d'un même rechargement pouvaient
    // voir deux instants — sur un semis qui date des commandes par décalage.
    const context = {
      prisma: this.prisma,
      commands: this.commands,
      now: this.clock.now(),
      requester,
      settle: () => this.work.whenIdle(),
    };
    await seedStation(context);
    // L'entité émettrice passe ici, comme dans `prisma/seed.ts` : les deux corpus
    // exécutent LES MÊMES fonctions, sans quoi le bouton de rechargement pose un
    // jeu de données que la ligne de commande ne pose pas — la divergence que
    // l'existence même de ce service est censée éviter.
    await seedAccounting(context);
    // Les mentions légales appartiennent au décor, comme la station : elles ne
    // dépendent d'aucun client et ne sont touchées par aucune coupe —
    // `resetToSeed` ne connaît que les sociétés et leurs commandes.
    await seedLegalDocuments(context);
    const client = await seedClient(context);
    // 🔴 Le SECOND espace pro, laissé « en cours » (2026-09-17). Le poste ne
    // portait que le perso et une société active : rien ne montrait un dossier
    // en constitution, ni la bascule d'espace à trois entrées.
    const pendingCompanyId = await seedPendingCompany(context, client.userId);
    // 🔴 Et l'accès pour le compte d'IMPERSONATION : c'est sous lui qu'on
    // développe, et il n'était membre d'aucune des deux — son sélecteur d'espace
    // ne montrait donc jamais ce que le semis venait de poser.
    await seedImpersonatedAccess(context, [client.companyId, pendingCompanyId]);
    const reset = await resetToSeed(this.prisma);
    // « Tout recharger » vide TOUT le fournil et toutes les tournées, comme
    // avant le 2026-10-05 : la coupe vient d'emporter les commandes de sociétés
    // qui ne sont pas au scénario, et leurs journées seraient orphelines. La
    // remise du scénario, elle, ne vise plus que ses journées.
    await resetProduction(this.prisma);
    await resetDeliveryRounds(this.prisma);
    // Les buckets APRÈS la coupe et AVANT le semis : les commandes qui
    // possédaient ces documents n'existent plus, et celles qu'on va poser n'en
    // ont pas encore. Vider avant la coupe laisserait une fenêtre où une
    // commande vivante n'a plus son bon.
    const storage = await clearSeededBuckets([
      this.config.r2Storage("customers"),
      this.config.r2Storage("production"),
    ]);
    // Les commandes, ET la journée de livraison qu'elles portent : clients de
    // livraison, flotte, départ, tournée chargée — les mêmes fonctions que
    // `pnpm seed:orders`, pour que le bouton et la ligne de commande posent le
    // même jeu de données.
    const orders = await seedOrders(context);
    return { reset, orders: ordersOf(orders), storage, delivery: deliveryOf(orders) };
  }

  /**
   * **Recharger le scénario de commandes, et lui seul** (Hugo, 2026-09-30).
   *
   * Les mêmes fonctions que `pnpm seed:orders` : le client, ses voisins et les
   * clients de livraison sont remis à l'identique (semis idempotent), leurs
   * commandes, le fournil et les tournées repartent de zéro. Rien d'autre
   * n'est coupé — ni les sociétés d'essai, ni la station, ni les décisions
   * tarifaires : c'est ce qui le distingue de {@link reload}.
   *
   * ⚠️ Il suppose le décor posé (station, client de référence) : sur une base
   * vierge, `seedOrders` refuse faute de client, et le message le dit.
   */
  async reloadOrders(requester: string): Promise<DevSeedOrdersOnlyReport> {
    refuseUnlessLocalDevelopment(this.config);
    const context = {
      prisma: this.prisma,
      commands: this.commands,
      now: this.clock.now(),
      requester,
      settle: () => this.work.whenIdle(),
    };
    // Depuis le 2026-10-05, la remise à l'état de base du scénario suivie de
    // ses étapes (`seedOrders`) : les bons tirés ne partent plus avec le
    // bucket entier, seulement ceux des commandes et journées du scénario.
    const orders = await seedOrders(context, {
      customers: this.config.r2Storage("customers"),
      production: this.config.r2Storage("production"),
    });
    return {
      orders: ordersOf(orders),
      storage: orders.purge.storage,
      delivery: deliveryOf(orders),
    };
  }
}

/** Les commandes posées, dans la forme que l'écran lit. */
function ordersOf(report: OrdersReport): DevSeedOrdersReport {
  return {
    removed: report.purge.orders,
    placed: report.placed,
    yesterday: report.yesterday,
    today: report.today,
    counterToday: report.counterToday,
    peakDay: report.peakDay,
  };
}

/** La journée de livraison, dans la forme que l'écran lit. */
function deliveryOf({ delivery }: OrdersReport): DevSeedDeliveryReport {
  return {
    day: delivery.day,
    deliveries: delivery.deliveriesToday,
    notReady: delivery.notReady,
    vehicles: delivery.vehicles,
    rounds: delivery.rounds,
    loadedBins: delivery.loadedBins,
    unassigned: delivery.unassigned,
    driver: driverOf(delivery.driver),
  };
}

/** Le livreur, sans son identifiant : `assigned` désigne toujours le requérant. */
function driverOf(driver: SeedDriverAssignment): DevSeedDriverReport {
  return driver.status === "assigned" ? { status: "assigned", name: driver.name } : driver;
}
