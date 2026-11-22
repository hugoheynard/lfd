import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { SubjectQuote } from "../../../channels/subjects/linkable-subject.js";
import { LinkableSubjects } from "../../../channels/subjects/linkable-subjects.js";
import { SubjectNotLinkableError } from "../../domain/errors/pay-link-errors.js";
import { LivePayLinkLookup } from "../live-pay-link-lookup.js";
import { ViewPayLinkQuery } from "./view-pay-link.query.js";

/**
 * Rend le devis du sujet, lu à chaque ouverture (§2.3) : un sujet réglé ou
 * annulé se dit `payable: false`, sans 404 — le lien existe toujours.
 */
@QueryHandler(ViewPayLinkQuery)
export class ViewPayLinkHandler implements IQueryHandler<ViewPayLinkQuery, SubjectQuote> {
  constructor(
    private readonly lookup: LivePayLinkLookup,
    private readonly linkables: LinkableSubjects,
  ) {}

  /**
   * @throws {PayLinkNotFoundError} jeton inconnu ou lien révoqué.
   * @throws {SubjectNotLinkableError} le type du lien n'a plus d'implémenteur.
   */
  async execute(query: ViewPayLinkQuery): Promise<SubjectQuote> {
    const link = await this.lookup.of(query.token);
    const linkable = this.linkables.forType(link.subjectType);
    if (linkable === null) {
      throw new SubjectNotLinkableError(link.subjectType);
    }
    return linkable.quote({ type: link.subjectType, id: link.subjectId });
  }
}
