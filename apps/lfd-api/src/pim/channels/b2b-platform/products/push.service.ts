import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import type { CatalogIngestionReport } from "@lfd/catalog-sync";

import { currentRequestContext } from "../../../../platform/context/request-context.store.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ProjectionDriftError } from "../../shared/domain/errors/projection-errors.js";
import { CatalogRevisionRepository } from "../../../catalogue/revision/domain/ports/catalog-revision.repository.js";
import {
  TakeCatalogRevisionCommand,
  type TakenRevision,
} from "../../../catalogue/revision/application/take-catalog-revision.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { B2bCatalogDriver, DryRunB2bCatalogDriver } from "./driver.js";
import { B2bCatalogFeedPreview } from "./feed-preview.js";
import type { Exclusion } from "./projection.js";

/** La destination, nommée une fois : elle désigne une ligne de publication. */
const B2B_CHANNEL = "b2b";

/** Ce que le push a produit, dit en entier — y compris ce qui n'est pas parti. */
export interface B2bPushSummary {
  readonly mode: "dry-run" | "live";
  /** Produits publiés sur le canal au moment du push. */
  readonly candidates: number;
  readonly report: CatalogIngestionReport | null;
  /** Ce qui a été écarté, avec son motif. Vide est une bonne nouvelle, pas un défaut. */
  readonly excluded: readonly Exclusion[];
  /**
   * L'empreinte de ce qui vient d'être projeté.
   *
   * Rendue **dans les deux modes**, et pour deux raisons différentes : en
   * simulation c'est le jeton que l'appelant redonnera au push réel ; en envoi
   * c'est la trace de ce qui est parti.
   */
  readonly fingerprint: string;
  /**
   * L'ancre posée par ce push — `null` quand il n'y avait rien à envoyer.
   *
   * Rendue parce que le fait de journal en a besoin comme sujet : « la révision
   * R est partie vers b2b » se relit, « un push a eu lieu » ne se relit pas.
   */
  readonly revisionId: string | null;
}

@Injectable()
export class B2bCatalogPushService {
  constructor(
    private readonly feed: B2bCatalogFeedPreview,
    private readonly dryRun: DryRunB2bCatalogDriver,
    private readonly live: B2bCatalogDriver,
    private readonly prisma: PimPrismaService,
    private readonly commands: CommandBus,
    private readonly revisions: CatalogRevisionRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * Projette le catalogue publié et l'envoie — ou le simule.
   *
   * L'instant d'émission est pris **une seule fois**, sur le `Clock` : deux
   * lectures d'horloge dans la même opération dériveraient de quelques
   * millisecondes, et le snapshot porterait un instant qui n'est celui de rien.
   *
   * Rien n'est estampillé tant que la plateforme n'a pas répondu. Poser
   * `lastPushedAt` avant la réponse ferait passer un échec réseau pour un
   * catalogue en ligne — l'écran dirait « à jour » d'un produit que personne ne
   * peut acheter.
   *
   * @param expectedFingerprint l'empreinte rendue par l'aperçu qu'on vient de
   *   relire. Fournie, elle est **exigée** : si la reprojection n'y correspond
   *   plus, rien ne part. C'est ce qui relie la relecture à l'envoi, et c'est
   *   tout ce qui manquait.
   *
   *   **Optionnelle pour l'instant**, et ce n'est pas un choix de confort : le
   *   front en ligne appelle déjà cette route sans elle
   *   (`pim/channels/b2b-channel-api.ts`), et un contrat servi ne se casse pas
   *   dans le même déploiement. Elle devient obligatoire au troisième temps,
   *   quand le front l'enverra.
   *
   * @throws {ProjectionDriftError} le catalogue a bougé depuis la relecture.
   */
  async push(dryRunRequested: boolean, expectedFingerprint?: string): Promise<B2bPushSummary> {
    const driver: B2bCatalogDriver = dryRunRequested ? this.dryRun : this.live;
    const { snapshot, candidates, excluded, fingerprint } = await this.feed.preview(
      this.clock.now().toISOString(),
    );

    // 🔴 AVANT le court-circuit sur `candidates === 0`, et c'est délibéré : un
    // catalogue devenu vide depuis la relecture est précisément la dérive qu'on
    // veut refuser. Sortir en « rien à faire » la ferait passer pour un succès.
    //
    // Un dry-run ne vérifie rien : c'est LUI qui produit l'empreinte, il ne la
    // consomme pas. Refuser une simulation parce que l'état a changé serait
    // refuser de montrer l'état actuel.
    if (!dryRunRequested && expectedFingerprint !== undefined) {
      if (expectedFingerprint !== fingerprint) {
        throw new ProjectionDriftError(B2B_CHANNEL, expectedFingerprint, fingerprint);
      }
    }

    // 🔴 **Une simulation n'écrit rien, et sort ici.** Elle traversait tout ce
    // qui suit — ancre de révision comprise — et posait donc une ancre à chaque
    // regard, alors qu'une révision est censée dire ce qu'on s'apprête à
    // publier. Cent ancres pour zéro publication ne disent plus rien.
    //
    // L'aperçu de l'écran ne passe plus par cette route : il lit
    // `GET admin/catalog/push-preview`, qui confronte en plus la projection au
    // miroir — ce qu'un dry-run ne peut pas faire, faute de connaître l'autre
    // côté. Ce chemin reste servi le temps qu'un appelant tiers s'en détache.
    if (dryRunRequested) {
      return {
        mode: this.dryRun.mode,
        candidates,
        report: candidates === 0 ? null : this.dryRun.simulate(snapshot),
        excluded,
        fingerprint,
        revisionId: null,
      };
    }

    if (candidates === 0) {
      return {
        mode: driver.mode,
        candidates: 0,
        report: null,
        excluded: [],
        fingerprint,
        revisionId: null,
      };
    }

    // **On fige AVANT d'envoyer.** Une révision est ce qu'on s'apprête à
    // publier, pas une photographie prise après coup : figer ensuite
    // enregistrerait un catalogue qui a pu bouger entre l'envoi et la réponse,
    // et l'ancre ne dirait plus ce qui est parti.
    //
    // Sur un catalogue inchangé, aucune ancre n'est créée — la commande rend
    // celle qui existait, et la publication s'inscrit dessus. Deux envois du
    // même catalogue sont donc deux publications d'UNE révision, ce qui est
    // exactement ce qu'ils sont.
    const revision = await this.commands.execute<TakeCatalogRevisionCommand, TakenRevision>(
      new TakeCatalogRevisionCommand(null),
    );

    const report = await driver
      .send(snapshot, { revisionId: revision.id, fingerprint })
      .catch(async (error: unknown) => {
        // L'échec s'inscrit AUSSI. Une trace qui n'existe qu'en cas de succès ne
        // raconte que les bons jours, et c'est le mauvais jour qu'on vient
        // relire.
        await this.recordPublication(revision.id, driver.mode, "failed", null, fingerprint);
        throw error;
      });

    if (driver.mode === "live") {
      await this.stamp(snapshot.products.map((product) => product.id));
    }
    await this.recordPublication(revision.id, driver.mode, "sent", report, fingerprint);

    return {
      mode: driver.mode,
      candidates,
      report,
      excluded,
      fingerprint,
      revisionId: revision.id,
    };
  }

  /**
   * Où cette révision est partie, ce que la destination en a dit, et **ce qui
   * est parti** — l'empreinte de la projection.
   *
   * Elle s'inscrit dans les trois cas, y compris l'échec et la simulation. Ne la
   * poser qu'au succès reviendrait à ne pas savoir ce qu'on avait tenté d'envoyer
   * le jour où l'envoi a échoué, c'est-à-dire le seul jour où la question se
   * pose. Le tri entre les trois est la charge du LECTEUR, qui filtre
   * `mode = 'live' AND outcome = 'sent'` — pas celle de l'écrivain, qui perdrait
   * l'information au lieu de la qualifier.
   */
  private async recordPublication(
    revisionId: string,
    mode: string,
    outcome: string,
    report: unknown,
    projectionFingerprint: string,
  ): Promise<void> {
    await this.revisions.recordPublication({
      revisionId,
      channel: B2B_CHANNEL,
      mode,
      outcome,
      report,
      projectionFingerprint,
      publishedAt: new Date(this.clock.now()),
      publishedBy: currentRequestContext()?.actor.id ?? null,
    });
  }

  /**
   * Estampille les produits **réellement partis**, pas les candidats.
   *
   * Un produit écarté par la projection (sans prix, famille sans TVA) reste sans
   * `lastPushedAt` : c'est ce qui permet à l'écran de le montrer comme en
   * attente au lieu de le déclarer à jour.
   */
  private async stamp(productIds: readonly string[]): Promise<void> {
    if (productIds.length === 0) {
      return;
    }
    await this.prisma.b2bChannelBinding.updateMany({
      where: { productId: { in: [...productIds] } },
      data: { lastPushedAt: new Date(this.clock.now()) },
    });
  }
}
