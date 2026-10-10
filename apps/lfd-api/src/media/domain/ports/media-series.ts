import type { WriteTicket } from "../../../platform/journal/scoped-journal.js";
import type { MediaSeries } from "../entities/media-series.js";

/**
 * L'ÉCRITURE des séries — l'agrégat entre, l'agrégat sort.
 *
 * 🔴 `save` exige un `WriteTicket` : écrire une série sans avoir tracé (ou
 * nommé pourquoi pas) ne compile pas — la même mécanique que les autres ports
 * d'écriture du fonds.
 */
export abstract class MediaSeriesRepository {
  abstract load(id: string): Promise<MediaSeries | null>;
  /** Crée ou réécrit la série. Aucune suppression : une série se corrige. */
  abstract save(series: MediaSeries, ticket: WriteTicket): Promise<void>;
}

/** Une série nommée — ce qu'un fait de journal ou une image en cite. */
export interface MediaSeriesLabel {
  readonly id: string;
  readonly title: string;
}

/** Une série dans la liste, avec son compte d'images. */
export interface MediaSeriesListing extends MediaSeriesLabel {
  readonly shotOn: string | null;
  readonly note: string | null;
  /** Les images qui la portent, comptées en base sur tout le fonds. */
  readonly images: number;
  readonly createdAt: Date;
}

/**
 * La LECTURE des séries. Port distinct de l'écriture (ISP) : le dépôt et le
 * panneau d'une image demandent « cette série existe-t-elle, sous quel
 * titre ? », jamais l'agrégat.
 */
export abstract class MediaSeriesReader {
  /** Toutes les séries — prise de vue la plus récente d'abord, puis la création. */
  abstract list(): Promise<readonly MediaSeriesListing[]>;
  /** La série et son titre, ou `null` si elle n'existe pas. */
  abstract find(id: string): Promise<MediaSeriesLabel | null>;
}
