import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { UuidGenerator } from "../../platform/id/uuid-generator.js";
import { DurablePublisher } from "../../platform/outbox/durable-publisher.js";
import { MediaAssetDescribedFact } from "../channels/carriers/media-asset-described.fact.js";
import { changesBetween } from "../../platform/journal/changes.js";
import { MEDIA_EVENTS, MediaJournal } from "../journal/media-journal.js";
import { MediaLibraryReader } from "../domain/ports/media-library-reader.js";
import { MediaLibraryWriter, type MediaDetails } from "../domain/ports/media-library-writer.js";
import { MediaSeriesReader, type MediaSeriesLabel } from "../domain/ports/media-series.js";
import { MediaSeriesNotFoundError } from "../domain/errors/media-series-errors.js";
import type { WriteTicket } from "../../platform/journal/scoped-journal.js";
import { imageAlt } from "../domain/value-objects/alt-text.js";
import {
  focalPoint,
  mediaLabel,
  MediaNotInLibraryError,
  mediaTags,
  type FocalPoint,
} from "../domain/value-objects/image.js";

/**
 * Nomme, tague et pointe une image de la bibliothèque.
 *
 * Une seule commande pour les trois, et c'est voulu : elles se décident au même
 * endroit, sur la même image, dans le même geste. Trois routes feraient trois
 * allers-retours dont l'échec partiel laisserait une image à moitié décrite.
 */
export class SaveMediaDetailsCommand {
  constructor(
    readonly url: string,
    readonly name: string,
    readonly tags: readonly string[],
    readonly alt: Readonly<Record<string, string>>,
    readonly focal: FocalPoint | null,
    /**
     * La série : un identifiant la rattache, `null` la détache, et
     * `undefined` n'y touche PAS — le panneau renvoie tous ses champs à chaque
     * geste, et un champ absent ne doit rien changer.
     */
    readonly seriesId?: string | null | undefined,
  ) {}
}

@CommandHandler(SaveMediaDetailsCommand)
export class SaveMediaDetailsHandler implements ICommandHandler<SaveMediaDetailsCommand, void> {
  constructor(
    private readonly library: MediaLibraryWriter,
    private readonly readers: MediaLibraryReader,
    private readonly series: MediaSeriesReader,
    private readonly journal: MediaJournal,
    private readonly uow: UnitOfWork,
    private readonly durable: DurablePublisher,
    private readonly ids: UuidGenerator,
  ) {}

  async execute(command: SaveMediaDetailsCommand): Promise<void> {
    const url = command.url.trim();
    const before = await this.readers.find(url);
    if (before === null) {
      // Un succès silencieux ferait croire à l'écran que son étiquette est
      // enregistrée alors qu'elle ne porte sur rien — typiquement une URL
      // recopiée à la main, ou une image que le ramassage vient de retirer.
      throw new MediaNotInLibraryError(url);
    }
    // La normalisation, les bornes et le repli de l'alternative vivent dans le
    // DOMAINE : ce handler orchestre. Le contrôleur n'a validé que la FORME.
    const details = {
      name: command.name.trim(),
      tags: mediaTags(command.tags),
      alt: imageAlt(command.alt, url),
      focal: focalPoint(command.focal),
    };
    const series = await this.seriesAfter(command.seriesId, before.series);
    const changes = changesBetween(
      decisionsOf(before, before.series),
      decisionsOf(details, series),
    );
    await this.uow.run(async () => {
      const ticket = await this.ticketFor(url, before.name, changes);
      await this.library.describe(url, { ...details, seriesId: series?.id ?? null }, ticket);
      if (CARRIED_FIELDS.some((field) => field in changes)) {
        await this.durable.publish(MediaAssetDescribedFact.announce(url, this.ids));
      }
    });
  }

  /**
   * Le fait « image décrite », ou la dérogation quand rien n'a bougé.
   *
   * Réenvoyer les mêmes valeurs est le cas NORMAL : l'écran renvoie tous ses
   * champs à chaque geste, même quand il n'en change qu'un. Tracer « rien n'a
   * bougé » remplirait le journal de bruit.
   */
  private async ticketFor(
    url: string,
    name: string,
    changes: Readonly<Record<string, unknown>>,
  ): Promise<WriteTicket> {
    if (Object.keys(changes).length === 0) {
      return this.journal.untraced("aucune décision modifiée");
    }
    return this.journal.trace({
      type: MEDIA_EVENTS.mediaDescribed,
      subjectType: "media_asset",
      // L'URL, parce que c'est l'identité de l'image — celle que les porteurs citent.
      subjectId: url,
      payload: { subjectLabel: mediaLabel(name, url), changes },
    });
  }

  /**
   * La série après le geste. Absente : celle d'avant. Changée : relue, pour
   * refuser une série inconnue en 404 nommé plutôt qu'en clé étrangère.
   */
  private async seriesAfter(
    requested: string | null | undefined,
    before: MediaSeriesLabel | null,
  ): Promise<MediaSeriesLabel | null> {
    if (requested === undefined) {
      return before;
    }
    if (requested === null || requested === before?.id) {
      return requested === null ? null : before;
    }
    const found = await this.series.find(requested);
    if (found === null) {
      throw new MediaSeriesNotFoundError(requested);
    }
    return found;
  }
}

/**
 * Les champs qu'un porteur recopie — et donc les seuls dont le changement
 * mérite d'être annoncé (2026-10-10, `mediatheque.md` §7). L'alternative et le point focal
 * voyagent jusqu'à la vitrine ; l'étiquette, les tags et la série restent au
 * fonds. Annoncer pour un tag ferait réécrire des fiches pour rien.
 *
 * ⚠️ Annoncé **dans la transaction** : la description et son annonce tiennent
 * ou tombent ensemble, et le relais ne livre qu'après la validation.
 */
const CARRIED_FIELDS: readonly string[] = ["alt", "focal"];

/** Ce que le journal compare d'une image, avant et après le geste. */
function decisionsOf(
  details: Pick<MediaDetails, "name" | "tags" | "alt" | "focal">,
  series: MediaSeriesLabel | null,
): Record<string, unknown> {
  return {
    name: details.name,
    tags: [...details.tags],
    alt: details.alt,
    focal: details.focal,
    series: namedSeries(series),
  };
}

/** La série telle que le journal la cite : son id et son titre du moment. */
function namedSeries(
  series: MediaSeriesLabel | null,
): { readonly id: string; readonly name: string } | null {
  return series === null ? null : { id: series.id, name: series.title };
}
