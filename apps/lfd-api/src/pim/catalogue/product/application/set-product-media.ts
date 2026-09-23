import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { SyncMedia } from "@lfd/catalog-sync";

import {
  SOURCE_LOCALE,
  type LocalizedText,
} from "../../shared/domain/value-objects/localized-text.js";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { changesBetween } from "../../../../platform/journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { EditorialReader } from "../domain/ports/editorial-reader.js";
import { EditorialRepository } from "../domain/ports/editorial.repository.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { ProductMediaChangedEvent } from "../../../channels/b2b-platform/products/product-media-changed.event.js";
import { mediaItems, type MediaInput } from "../domain/value-objects/editorial.js";
import { requireProduct } from "./product-support.js";

export class SetProductMediaCommand {
  constructor(
    readonly id: string,
    readonly media: readonly MediaInput[],
  ) {}
}

/**
 * Remplace les visuels d'un produit.
 *
 * Un **remplacement**, pas un ajout : l'écran envoie ce qu'il affiche, et cette
 * liste fait foi. Retirer une image et réordonner les autres sont le même geste
 * pour qui l'exécute ; les découper en routes séparées ferait porter à l'écran
 * une suite d'appels dont l'échec partiel laisserait un ordre incohérent.
 *
 * Les règles ne sont pas réécrites ici : `mediaItems` les tient déjà — URL
 * obligatoire, rôle unique là où il doit l'être, et **position dérivée du rang**
 * dans la liste reçue. Deux images ne peuvent donc pas revendiquer la même
 * place, et l'ordre affiché est l'ordre enregistré par construction.
 */
@CommandHandler(SetProductMediaCommand)
export class SetProductMediaHandler implements ICommandHandler<SetProductMediaCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly editorials: EditorialRepository,
    private readonly readers: EditorialReader,
    private readonly journal: PimJournal,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetProductMediaCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    const before = await this.readers.mediaOf(command.id);
    const after = mediaItems(command.media);
    // UNE seule entrée `media`, la liste entière : c'est un remplacement, et
    // réordonner EST la modification. Un diff par image ne saurait pas dire la
    // différence entre « déplacée » et « retirée puis ajoutée ».
    const changes = changesBetween({ media: listOf(before) }, { media: listOf(after) });

    await this.uow.run(async () => {
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.productMediaSaved,
              subjectType: "product",
              subjectId: command.id,
              payload: { subjectLabel: product.snapshot().name.fr, changes },
            })
          : this.journal.untraced("section enregistrée sans modification");
      await this.editorials.replaceMedia(command.id, after, ticket);
    });

    await this.announce(command.id);
  }

  /**
   * Annonce le changement, **hors de la transaction**.
   *
   * 🔴 Après le `uow.run`, et jamais dedans : publier à l'intérieur ferait
   * projeter un changement qui peut encore être annulé. Un abonné qui aurait
   * déjà écrit en boutique ne serait pas rejoué par le rollback — il n'est pas
   * dans la transaction, c'est tout l'intérêt.
   *
   * ⚠️ **`publish` et non `publishTraced`.** Le fait décisif est déjà inscrit
   * (`product.media_saved`) ; ceci en est la conséquence. Un second fait au
   * journal ferait deux lignes d'historique là où il s'est passé une seule
   * chose.
   *
   * ⚠️ **Relu plutôt qu'assemblé depuis `after`.** La liste écrite ne porte que
   * le rôle et l'URL ; la vitrine a besoin de l'alternative, qui vit à la
   * médiathèque. Relire est un aller de plus sur un geste rare, et c'est le
   * prix de ne pas recopier une règle de composition qui existe déjà.
   *
   * ⚠️ **Un échec ici n'annule rien.** La fiche est enregistrée, le fait est
   * tracé ; seule la fraîcheur est perdue, et le prochain push la rattrape.
   * C'est le couple habituel — un chemin rapide et faillible, un chemin lent et
   * complet.
   */
  private async announce(productId: string): Promise<void> {
    const media = await this.readers.mediaOf(productId);
    this.events.publish(
      new ProductMediaChangedEvent(
        productId,
        syncMediaOf(media, MAIN_ROLE),
        syncMediaOf(media, THUMBNAIL_ROLE),
      ),
    );
  }
}

/**
 * Les visuels réduits à ce qu'une FICHE décide : l'ordre, l'image et son RÔLE.
 *
 * 🔴 Ni étiquette ni texte alternatif depuis le 2026-09-23 : ils décrivent
 * l'image et ont leur propre fait (`media_asset.described`). Les garder ici
 * ferait apparaître, dans l'historique d'une fiche, une modification que
 * quelqu'un a faite sur une AUTRE — l'image étant partagée.
 *
 * Ni dimensions ni poids non plus : ils décrivent le fichier, pas la décision
 * de l'écran, et bougeraient sans que personne n'ait rien édité.
 *
 * Le rôle manquait, et c'est le geste le plus fréquent de cette section :
 * promouvoir une image en `hero` ne changeait rien d'autre, donc produisait un
 * diff vide et aucun fait du tout (corrigé le 2026-09-23).
 *
 * La POSITION n'y figure pas et n'a pas à y figurer : `changesBetween` compare
 * les tableaux index par index, donc permuter deux visuels change déjà les
 * entrées comparées. L'ajouter ferait doublon avec le rang.
 */
function listOf(
  media: readonly { readonly role: string; readonly url: string }[],
): readonly Record<string, unknown>[] {
  return media.map((item) => ({ role: item.role, url: item.url }));
}

/**
 * Le rôle que la vitrine montre en ouverture, et celui qu'elle montre en rayon.
 *
 * ⚠️ Les mêmes que `channels/b2b-platform/products/showcase.ts`, et c'est une
 * duplication qu'il faut voir : deux endroits décident ce qui traverse, l'un
 * pour le push, l'autre pour la projection. **Ils doivent dire la même chose**,
 * sinon un push et une projection écriraient deux visuels différents sur la
 * même fiche — et seul un aller-retour entre les deux le dirait.
 */
const MAIN_ROLE = "hero";
const THUMBNAIL_ROLE = "thumbnail";

/**
 * Le visuel d'un rôle, à la forme du fil — ou `null`.
 *
 * L'alternative est aplatie en langue SOURCE, comme sur le fil : une vitrine
 * publique ne négocie pas la langue, et le récepteur n'a pas de carte de
 * locales à lire.
 */
function syncMediaOf(
  media: readonly {
    role: string;
    url: string;
    alt: LocalizedText;
    width: number | null;
    height: number | null;
  }[],
  role: string,
): SyncMedia | null {
  const found = media.find((item) => item.role === role);
  return found === undefined
    ? null
    : {
        url: found.url,
        alt: found.alt[SOURCE_LOCALE] ?? "",
        width: found.width,
        height: found.height,
      };
}
