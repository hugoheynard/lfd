import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { UuidGenerator } from "../../platform/id/uuid-generator.js";
import { DurablePublisher } from "../../platform/outbox/durable-publisher.js";
import { Clock } from "../../platform/time/clock.js";
import { MediaCarriers } from "../channels/carriers/media-carriers.js";
import { MediaAssetDescribedFact } from "../channels/carriers/media-asset-described.fact.js";
import { MediaLibraryReader } from "../domain/ports/media-library-reader.js";
import { imageReplacement } from "../domain/value-objects/image-replacement.js";
import { MediaNotInLibraryError } from "../domain/value-objects/image.js";
import { MEDIA_EVENTS, MediaJournal } from "../journal/media-journal.js";

/** Remplace l'image `from` par l'image `to` chez tous ceux qui l'affichent. */
export class ReplaceMediaCommand {
  constructor(
    readonly from: string,
    readonly to: string,
    /** La fiche INTERNE du staff : la vitrine signe son enregistrement de lui. */
    readonly staffUserId: string,
  ) {}
}

/**
 * **Remplacer une image** (L7 de
 * `documentation/mediatheque/plan-la-mediatheque-amelioree.md`, 2026-10-10).
 *
 * L'identité d'une image est son URL — le hachage de ses octets. Retoucher
 * une photo en fait donc une AUTRE, qu'il fallait rechoisir porteur par
 * porteur. Ce geste la pose partout où l'ancienne paraissait, d'un coup.
 *
 * ## Une unité de travail, trois écritures
 *
 * Le fait `media_asset.replaced`, le repointage chez tous les porteurs (fiches,
 * familles, opérations, vitrine — un seul client Prisma, chacun rejoint
 * l'unité ouverte ici), et le fait durable `media.asset_described` sur la
 * NOUVELLE image : le référentiel l'écoute déjà et réannonce les fiches qui
 * la montrent, ce qui fait suivre la boutique sans republier. Les trois
 * tiennent ou tombent ensemble.
 *
 * ## Ce qu'il ne fait pas
 *
 * - **Il ne retire pas l'ancienne** (D5) : elle reste au fonds, et le
 *   ramassage l'emportera après 7 jours si plus rien ne l'affiche.
 * - **Il ne dépose rien** : la nouvelle image est déjà au fonds. Déposer
 *   écrit dans un bucket, hors de toute transaction — l'écran fait les deux
 *   appels.
 * - **Il ne recopie pas la description** de l'ancienne (alternative, point
 *   focal, mots-clés) : la nouvelle garde la sienne.
 *
 * ⚠️ La lecture des deux images n'est pas un verrou : une image retirée entre
 * la lecture et le repointage laisserait ses porteurs sur une URL disparue.
 * C'est la fenêtre du retrait (`mediatheque.md` §8, D6), et elle est assumée.
 */
@CommandHandler(ReplaceMediaCommand)
export class ReplaceMediaHandler implements ICommandHandler<ReplaceMediaCommand, void> {
  constructor(
    private readonly library: MediaLibraryReader,
    private readonly carriers: MediaCarriers,
    private readonly journal: MediaJournal,
    private readonly uow: UnitOfWork,
    private readonly durable: DurablePublisher,
    private readonly ids: UuidGenerator,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {MediaReplacementUrlRequiredError} une URL vide.
   * @throws {MediaReplacedBySelfError} les deux URL sont la même image.
   * @throws {MediaNotInLibraryError} l'une des deux n'est pas au fonds.
   */
  async execute(command: ReplaceMediaCommand): Promise<void> {
    const { from, to } = imageReplacement(command.from, command.to);
    const replaced = await this.library.find(from);
    if (replaced === null) {
      throw new MediaNotInLibraryError(from);
    }
    if ((await this.library.find(to)) === null) {
      throw new MediaNotInLibraryError(to);
    }
    const at = this.clock.now();
    await this.uow.run(async () => {
      // Nommés puis comptés, comme le repointage compte : une fiche qui tient
      // l'image sous deux rôles est UN porteur. `usesOf` compterait ses lignes.
      const shown = await this.carriers.carriersOf(from);
      const ticket = await this.journal.trace({
        type: MEDIA_EVENTS.mediaReplaced,
        subjectType: "media_asset",
        subjectId: from,
        payload: {
          subjectLabel: replaced.name !== "" ? replaced.name : (from.split("/").at(-1) ?? from),
          to,
          carriers: shown.length,
        },
      });
      const repointed = await this.carriers.repoint(
        { from, to, staffId: command.staffUserId, at },
        ticket,
      );
      if (repointed > 0) {
        await this.durable.publish(new MediaAssetDescribedFact(to, this.ids.next()).durableFact());
      }
    });
  }
}
