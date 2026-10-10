import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { SyncMedia } from "@lfd/catalog-sync";

import {
  SOURCE_LOCALE,
  type LocalizedText,
} from "../../shared/domain/value-objects/localized-text.js";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { UuidGenerator } from "../../../../platform/id/uuid-generator.js";
import { changesBetween } from "../../../../platform/journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { EditorialReader } from "../domain/ports/editorial-reader.js";
import { EditorialRepository } from "../domain/ports/editorial.repository.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { ProductMediaChangedFact } from "../../../channels/b2b-platform/products/product-media-changed.fact.js";
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
    private readonly durable: DurablePublisher,
    private readonly ids: UuidGenerator,
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
      await this.announce(command.id);
    });
  }

  /**
   * Annonce le changement, **DANS la transaction** — depuis le 2026-10-10 (lot E5).
   *
   * 🔴 C'était l'inverse : « après le `uow.run`, et jamais dedans », parce
   * qu'un fait publié EN MÉMOIRE à l'intérieur faisait projeter un changement
   * qui pouvait encore être annulé — l'abonné, hors de la transaction, n'était
   * pas rejoué par le rollback. Le fait est désormais DURABLE : il s'écrit dans
   * la boîte d'envoi de la même transaction, et le relais ne le livre qu'après
   * la validation. Un rollback l'emporte avec la fiche ; une validation le
   * garantit, redémarrage compris. Écrit après, il pouvait se perdre entre les
   * deux — la boutique gardait l'ancienne photo jusqu'au prochain push.
   *
   * ⚠️ **Pas de second fait au journal.** Le fait décisif est déjà inscrit
   * (`product.media_saved`) ; ceci en est la conséquence.
   *
   * ⚠️ **Relu dans la transaction**, donc APRÈS `replaceMedia` : la lecture
   * suit la transaction ambiante et voit la liste qu'on vient d'écrire.
   *
   * ⚠️ **Relu plutôt qu'assemblé depuis `after`.** La liste écrite ne porte que
   * le rôle et l'URL ; la vitrine a besoin de l'alternative, qui vit à la
   * médiathèque. Relire est un aller de plus sur un geste rare, et c'est le
   * prix de ne pas recopier une règle de composition qui existe déjà.
   *
   * ⚠️ **Un échec d'écriture ici annule le geste** : la fiche et son annonce
   * tiennent ou tombent ensemble. C'est le prix de ne plus perdre l'annonce.
   */
  private async announce(productId: string): Promise<void> {
    const media = await this.readers.mediaOf(productId);
    const fact = new ProductMediaChangedFact(
      productId,
      this.ids.next(),
      syncMediaOf(media, MAIN_ROLE),
      syncMediaOf(media, THUMBNAIL_ROLE),
    );
    await this.durable.publish(fact.durableFact());
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
