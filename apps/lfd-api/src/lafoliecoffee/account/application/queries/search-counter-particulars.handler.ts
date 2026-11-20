import type { CounterParticularCard } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

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
 * La date de dernière commande n'y est pas : les commandes appartiennent au
 * contexte `orders`, et `account` ne les lit pas.
 *
 * @throws {ParticularSearchTooShortError} saisie de moins de deux caractères.
 */
@QueryHandler(SearchCounterParticularsQuery)
export class SearchCounterParticularsHandler implements IQueryHandler<
  SearchCounterParticularsQuery,
  readonly CounterParticularCard[]
> {
  constructor(private readonly particulars: ParticularFinder) {}

  async execute(query: SearchCounterParticularsQuery): Promise<readonly CounterParticularCard[]> {
    const term = ParticularSearchTerm.create(query.text);
    const found = await this.particulars.search(term, PARTICULAR_SEARCH_LIMIT);
    return found.map(toCard);
  }
}

function toCard(record: ParticularRecord): CounterParticularCard {
  return {
    id: record.id,
    firstName: record.firstName,
    lastName: record.lastName,
    maskedEmail: maskEmail(record.email),
    maskedPhone: maskPhone(record.phone),
    connectable: record.connectable,
  };
}
