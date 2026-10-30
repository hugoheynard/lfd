import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import type {
  CompanyMercuriale,
  MercurialeAmendmentDraft,
} from "../../domain/entities/company-mercuriale.js";
import { CompanyMercurialeRepository } from "../../domain/ports/company-mercuriale.repository.js";
import { PricedCompanyReader } from "../../domain/ports/priced-company.reader.js";
import { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import {
  AmendedMercurialeNotFoundError,
  PricedCompanyNotFoundError,
} from "../../domain/pricing-errors.js";
import { AmendCompanyMercurialeCommand } from "./amend-company-mercuriale.command.js";
import { describeAmendment } from "./company-mercuriale-support.js";
import { assertNotReservedElsewhere, assertOnSale } from "./sale-reference-support.js";
import { ReservedElsewhereReader } from "../../domain/ports/reserved-elsewhere.reader.js";

@CommandHandler(AmendCompanyMercurialeCommand)
export class AmendCompanyMercurialeHandler implements ICommandHandler<
  AmendCompanyMercurialeCommand,
  string
> {
  constructor(
    private readonly companies: PricedCompanyReader,
    private readonly mercuriales: CompanyMercurialeRepository,
    private readonly references: SaleReferenceReader,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly reservations: ReservedElsewhereReader,
  ) {}

  /**
   * Rend l'identifiant de l'avenant écrit.
   *
   * 🔴 **Verrouiller, relire et amender dans la MÊME transaction** (seconde
   * contradiction, B2). L'agrégat refuse un doublon entre la grille et les
   * avenants qu'il a chargés ; sans le verrou, deux commerciaux qui ajoutent
   * le même article au même instant chargeraient chacun l'état d'avant, et les
   * deux passeraient.
   *
   * Seules les lignes OUVERTES sont confrontées au catalogue (L5) : arrêter le
   * prix d'une référence retirée de la vente reste possible, et même attendu.
   *
   * @throws {PricedCompanyNotFoundError} l'identifiant ne désigne aucune société.
   * @throws {AmendedMercurialeNotFoundError} cette mercuriale n'est pas chez ce client.
   * @throws {SaleReferenceNotOnSaleError} une ligne vise une référence qui ne se vend pas.
   * @throws {ReservedArticleRefusedError} une ligne ouverte vise un article réservé à un autre compte.
   * @throws les refus de `CompanyMercuriale.amend`.
   */
  async execute(command: AmendCompanyMercurialeCommand): Promise<string> {
    const { companyId, mercurialeId, staffUserId } = command;
    if (!(await this.companies.exists(companyId))) {
      throw new PricedCompanyNotFoundError(companyId);
    }
    await assertOnSale(
      this.references,
      command.payload.lines.map((line) => line.sku),
      "pro",
    );
    await assertNotReservedElsewhere(
      this.reservations,
      companyId,
      command.payload.lines.map((line) => line.sku),
    );
    const now = this.clock.now();
    const draft = draftOf(command, now);
    const amendmentId = this.ids.next();

    await this.uow.run(async () => {
      const mercuriale = await this.mercuriales.lockForAmendment(mercurialeId);
      if (mercuriale === null || mercuriale.companyId !== companyId) {
        throw new AmendedMercurialeNotFoundError(mercurialeId);
      }
      const amended = mercuriale.amend(amendmentId, draft, staffUserId, now);
      await this.mercuriales.addAmendment(amended, amendmentId, actOf(amended, draft, staffUserId));
    });
    return amendmentId;
  }
}

/** Le contrat → l'intention du domaine. `validFrom` absent = maintenant (Q2). */
function draftOf(command: AmendCompanyMercurialeCommand, now: Date): MercurialeAmendmentDraft {
  const { payload } = command;
  return {
    // Le prix fixe est le seul palier de sa ligne, comme à la pose.
    lines: payload.lines.map((line) => ({
      sku: line.sku,
      tiers: [{ minQuantity: 1, unitPriceMillicents: line.unitPriceMillicents }],
    })),
    endedSkus: payload.endedSkus,
    validFrom: payload.validFrom === undefined ? now : new Date(payload.validFrom),
    validTo: payload.validTo === null ? null : new Date(payload.validTo),
    reason: payload.reason,
    origin: null,
  };
}

/**
 * L'acte : sur le DOCUMENT (un seul fil pour l'accord), daté de la prise
 * d'effet comme la pose, avec le motif — jamais nul ici.
 */
function actOf(mercuriale: CompanyMercuriale, draft: MercurialeAmendmentDraft, actor: string) {
  return {
    subjectType: "mercuriale" as const,
    subjectId: mercuriale.id,
    kind: "amended" as const,
    actor,
    at: draft.validFrom,
    reason: draft.reason.trim(),
    summary: describeAmendment(mercuriale, draft),
    subjectLabel: mercuriale.label,
  };
}
