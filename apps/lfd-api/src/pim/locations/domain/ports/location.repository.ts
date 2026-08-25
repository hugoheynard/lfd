import type { WriteTicket } from "../../../journal/pim-journal.js";
import type { Location } from "../entities/location.js";

/**
 * Port : l'application dépend de cette abstraction, jamais de Prisma.
 *
 * Il rend et reprend l'**agrégat** plutôt qu'une ligne et un tas de champs.
 * Il portait une méthode par mutation (`updateFields`, `replaceTables`,
 * `setTableQr`) — donc plusieurs écritures pour un seul geste métier, et un
 * état intermédiaire où un emplacement fermé en salle gardait ses tables. Un
 * `save` de l'agrégat entier ferme ce trou : il n'y a plus d'entre-deux.
 */
export abstract class LocationRepository {
  abstract listAll(): Promise<Location[]>;
  abstract findById(id: string): Promise<Location | null>;
  /**
   * L’emplacement qui porte ce nom, s'il y en a un. Comparaison **insensible à
   * la casse** : « Village » et « village » désignent le même point de vente
   * pour qui lit l'écran, et c'est l'écran qui compte ici.
   */
  abstract findByName(name: string): Promise<Location | null>;
  abstract add(location: Location, ticket: WriteTicket): Promise<void>;
  /** Écrit l'état entier — champs ET grille de tables — en une transaction. */
  abstract save(location: Location, ticket: WriteTicket): Promise<void>;
  abstract remove(id: string, ticket: WriteTicket): Promise<void>;
}
