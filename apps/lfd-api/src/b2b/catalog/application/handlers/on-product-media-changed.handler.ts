import { Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { ProductMediaChangedEvent } from "../../../../pim/channels/b2b-platform/products/product-media-changed.event.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";

/**
 * **La photo d'une fiche arrive en boutique sans republier le catalogue.**
 *
 * 🔴 `catalog_items.image_url` est une COPIE, écrite par l'ingestion d'un
 * instantané. Changer une photo ne se voyait donc qu'après une republication —
 * un acte lourd, délibéré, et sans rapport avec le geste qu'on venait de
 * faire : « je ne veux pas republier pour les images » (Hugo, 2026-09-23).
 *
 * ## Deux écrivains sur les mêmes colonnes, et ils ne se contredisent pas
 *
 * L'ingestion d'un instantané écrit ces colonnes ; cette projection aussi.
 * Ils lisent **la même source de vérité** — le référentiel — donc ils ne
 * peuvent diverger que pendant la fenêtre où un instantané vieillit.
 *
 * - **la projection sert la FRAÎCHEUR** : elle arrive dans la seconde ;
 * - **le push sert la RÉPARATION** : il remet tout d'aplomb, y compris ce
 *   qu'une projection aurait manqué.
 *
 * ⚠️ **Un instantané fabriqué AVANT un changement de photo et ingéré APRÈS
 * annulera cette projection.** C'est correct au sens du modèle — l'instantané
 * dit ce que le catalogue ÉTAIT — mais ça se lira comme un défaut. La fenêtre
 * est celle d'un push, qui dure des minutes et se déclenche à la main. Le jour
 * où la publication devient automatique, il faudra dater les deux écritures et
 * faire gagner la plus récente.
 *
 * ## Ce que cet abonné ne fait pas
 *
 * ⚠️ **Il n'importe PAS le référentiel** — il reçoit un fait publié sur le bus
 * de la plateforme. Le PIM publie sans savoir qui écoute ; le commerce écoute
 * sans que le PIM le connaisse. Aucune des deux flèches interdites par la
 * matrice n'est empruntée.
 *
 * ⚠️ **Il ne journalise rien.** Le référentiel a déjà inscrit la DÉCISION
 * (`product.media_saved`) ; ceci en est la conséquence, et un second fait
 * ferait deux lignes d'historique là où il s'est passé une seule chose.
 *
 * ⚠️ **Il n'échoue jamais vers l'émetteur.** Un abonné est appelé après la
 * transaction du référentiel : lever ici ne rejouerait rien et remonterait une
 * panne de projection à qui enregistrait une fiche. La fiche est enregistrée,
 * le fait est tracé ; seule la fraîcheur est perdue, et le prochain push la
 * rattrape.
 */
@EventsHandler(ProductMediaChangedEvent)
export class OnProductMediaChangedHandler implements IEventHandler<ProductMediaChangedEvent> {
  private readonly logger = new Logger(OnProductMediaChangedHandler.name);

  constructor(
    private readonly items: CatalogItemRepository,
    private readonly work: BackgroundWork,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
   * inscription, personne — ni la production, ni un test — ne sait quand il a
   * fini. Un e2e passerait alors sur une projection qui n'a pas encore eu
   * lieu, et le vert dirait le contraire de ce qui s'est produit.
   */
  handle(event: ProductMediaChangedEvent): void {
    void this.work.track(this.run(event), "on-product-media-changed");
  }

  private async run(event: ProductMediaChangedEvent): Promise<void> {
    try {
      // Les articles d'un produit, RETIRÉS COMPRIS : recevoir une photo n'est
      // pas revenir au catalogue, et un retiré doit garder son visuel à jour.
      const items = await this.items.loadByProduct(event.productId);
      if (items.length === 0) {
        // Le cas NORMAL d'une fiche jamais poussée : elle existe au
        // référentiel et le commerce ne la connaît pas encore. Rien à
        // projeter, et surtout rien à créer — un article naît d'un push.
        return;
      }

      // 🔴 Par une méthode MÉTIER, jamais par une écriture de colonnes : le
      // port de ce dépôt l'interdit en toutes lettres, et `showVisuals` porte
      // une règle qu'un `updateMany` aurait tue — elle ne change QUE les
      // visuels, ni le prix, ni le retrait, ni la décision commerciale.
      const refreshed = items.map((item) => item.showVisuals(event.image, event.thumbnail));
      await this.uow.run(async () => {
        await this.items.saveMany(refreshed);
      });
    } catch (caught) {
      // Avalé, et DIT. Voir le JSDoc de la classe : la fiche est enregistrée,
      // le fait est tracé, seule la fraîcheur est perdue — et le prochain push
      // la rattrape. Lever ici remonterait une panne de projection à qui
      // enregistrait une fiche.
      this.logger.warn(
        `Visuels non projetés pour ${event.productId} — le prochain push les rattrapera.`,
        caught,
      );
    }
  }
}
