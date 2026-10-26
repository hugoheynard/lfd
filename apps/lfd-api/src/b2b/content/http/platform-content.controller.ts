import type {
  AccessibilityFollowUpView,
  FooterContentView,
  LegalDocumentKey,
  PublishedLegalDocumentView,
} from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { GetAccessibilityFollowUpQuery } from "../application/get-accessibility-follow-up.query.js";
import { GetFooterContentQuery } from "../application/get-footer-content.query.js";
import { GetPublishedLegalDocumentQuery } from "../application/get-published-legal-document.query.js";
import { LegalMentionParam } from "./legal-mention.pipe.js";

/**
 * Lecture **publique** du pied de page — la vitrine en a besoin pour se rendre,
 * y compris avant toute connexion. Non sensible : ce sont les textes qu'on
 * publie, précisément.
 *
 * Surface anonyme ⇒ throttle resserré, sous le défaut global. L'écriture est
 * staff ({@link AdminPlatformContentController}).
 */
@Controller("content")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PlatformContentController {
  constructor(private readonly queries: QueryBus) {}

  @Get("footer")
  footer(): Promise<FooterContentView> {
    return this.queries.execute<GetFooterContentQuery, FooterContentView>(
      new GetFooterContentQuery(),
    );
  }

  /**
   * Le **suivi d'accessibilité** — les corrections et l'état de l'audit RGAA,
   * que la boutique montre sous la déclaration d'accessibilité, à l'ouverture
   * du dialogue (Hugo, 2026-10-26). Public : c'est ce qu'on publie.
   *
   * Déclarée AVANT `legal/:mention` par lisibilité seulement : les deux
   * chemins ne se recouvrent pas.
   */
  @Get("accessibility-follow-up")
  accessibilityFollowUp(): Promise<AccessibilityFollowUpView> {
    return this.queries.execute<GetAccessibilityFollowUpQuery, AccessibilityFollowUpView>(
      new GetAccessibilityFollowUpQuery(),
    );
  }

  /**
   * Le document d'une mention légale, lu par le dialogue de la boutique —
   * **paresseusement**, à la première ouverture. Public par nature : c'est ce
   * qu'on oppose au client, le cacher derrière un jeton n'aurait aucun sens.
   *
   * Les CGV professionnelles (`salesTermsPro`) se lisent ici aussi, sans
   * connexion (Hugo, 2026-10-15 : une landing pro doit pouvoir les donner).
   * Jamais rédigées, elles rendent leur titre et aucun article, en révision 0
   * — l'état « en cours de rédaction », jamais une 404 (plan
   * `legal/plan-cgv-par-audience.md`, C1′).
   *
   * Le texte porte son PDF en vigueur (`pdf`, `null` sans dépôt ou hors CGV) :
   * la boutique n'a plus à le deviner par une sonde `HEAD` (Hugo, 2026-10-15).
   *
   * 🔴 La mention est validée contre le vocabulaire fermé, et une mention
   * inconnue rend **404**. Sur une surface anonyme, c'est aussi ce qui empêche
   * de sonder la table de contenu par son segment d'URL.
   */
  @Get("legal/:mention")
  legalDocument(
    @Param("mention", LegalMentionParam) mention: LegalDocumentKey,
  ): Promise<PublishedLegalDocumentView> {
    return this.queries.execute<GetPublishedLegalDocumentQuery, PublishedLegalDocumentView>(
      new GetPublishedLegalDocumentQuery(mention),
    );
  }
}
