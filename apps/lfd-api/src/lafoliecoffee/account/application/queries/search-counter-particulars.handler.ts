import type { CounterParticularCard } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ParticularNoShowCountsReader } from "../../../orders/domain/ports/particular-no-show-counts.reader.js";
import { ParticularFinder, type ParticularRecord } from "../../domain/ports/particular-finder.js";
import { maskEmail, maskPhone } from "../../domain/services/particular-contact-mask.js";
import {
  PARTICULAR_SEARCH_LIMIT,
  ParticularSearchTerm,
} from "../../domain/value-objects/particular-search-term.js";
import { SearchCounterParticularsQuery } from "./search-counter-particulars.query.js";

/**
 * Cherche LA personne pour qui l'équipe note une commande au comptoir : elle
 * choisit à l'écran, aucun rapprochement ne se fait seul.
 *
 * Les coordonnées sortent masquées : un vendeur reconnaît, il ne relève pas.
 * Chaque carte dit combien de commandes la personne n'est pas venue retirer
 * (`noShowCount`) : les commandes publient ce compte
 * (`ParticularNoShowCountsReader`), le compte ne lit pas leur table. Aucune
 * règle ne bloque sur ce compte : il se lit. La date de dernière commande n'y
 * est pas.
 *
 * @throws {ParticularSearchTooShortError} saisie de moins de deux caractères.
 */
@QueryHandler(SearchCounterParticularsQuery)
export class SearchCounterParticularsHandler implements IQueryHandler<
  SearchCounterParticularsQuery,
  readonly CounterParticularCard[]
> {
  constructor(
    private readonly particulars: ParticularFinder,
    private readonly noShows: ParticularNoShowCountsReader,
  ) {}

  async execute(query: SearchCounterParticularsQuery): Promise<readonly CounterParticularCard[]> {
    const term = ParticularSearchTerm.create(query.text);
    const found = await this.particulars.search(term, PARTICULAR_SEARCH_LIMIT);
    const counts = await this.noShows.countsOf(found.map((record) => record.id));
    return found.map((record) => toCard(record, counts.get(record.id) ?? 0));
  }
}

function toCard(record: ParticularRecord, noShowCount: number): CounterParticularCard {
  return {
    id: record.id,
    firstName: record.firstName,
    lastName: record.lastName,
    maskedEmail: maskEmail(record.email),
    maskedPhone: maskPhone(record.phone),
    connectable: record.connectable,
    noShowCount,
  };
}
