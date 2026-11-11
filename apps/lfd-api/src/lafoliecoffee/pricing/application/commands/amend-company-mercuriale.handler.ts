import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PolicyPromotionNamesReader } from "../../domain/ports/policy-promotion-names.reader.js";
import { namedPolicy } from "./promotion-policy-support.js";
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
import { VolumeCommitmentReader } from "../../domain/ports/volume-commitment.reader.js";
import { assertNoVolumeCommitmentUnder } from "./general-discount-support.js";
import { amendmentDraftOf } from "./amendment-draft-support.js";

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
    private readonly promotionNames: PolicyPromotionNamesReader,
    private readonly commitments: VolumeCommitmentReader,
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
   * @throws {MercurialeAmendedMeanwhileError} `basedOnAmendmentId` annoncé, et un
   *   autre avenant a été écrit depuis.
   * @throws {SaleReferenceNotOnSaleError} une ligne vise une référence qui ne se vend pas.
   * @throws {ReservedArticleRefusedError} une ligne ouverte vise un article réservé à un autre compte.
   * @throws les refus de `namedPolicy` (nouvelle politique de promotions).
   * @throws {GeneralDiscountOverVolumeCommitmentError} l'avenant pose ou change
   *   une remise générale sur une fenêtre qu'un engagement de volume recouvre (Q2).
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
    // Une nouvelle politique de promotions, facultative (`plan-la-mercuriale-decide.md`, § 8).
    const promotions =
      command.payload.promotionPolicy === undefined
        ? null
        : await namedPolicy(this.promotionNames, command.payload.promotionPolicy);
    const draft = amendmentDraftOf(command.payload, now, promotions?.policy ?? null);
    const amendmentId = this.ids.next();

    await this.uow.run(async () => {
      const mercuriale = await this.mercuriales.lockForAmendment(mercurialeId);
      if (mercuriale === null || mercuriale.companyId !== companyId) {
        throw new AmendedMercurialeNotFoundError(mercurialeId);
      }
      // Sous le verrou : un avenant écrit pendant la saisie est vu ici (§ 2.2).
      if (command.payload.basedOnAmendmentId !== undefined) {
        mercuriale.assertNotAmendedSince(command.payload.basedOnAmendmentId);
      }
      if (draft.generalDiscount?.set != null) {
        // La remise de l'avenant ne vaut que sur SA fenêtre, bornée par le document.
        await assertNoVolumeCommitmentUnder(
          this.commitments,
          companyId,
          draft.validFrom,
          draft.validTo ?? mercuriale.toPersistence().validTo,
        );
      }
      const amended = mercuriale.amend(amendmentId, draft, staffUserId, now);
      await this.mercuriales.addAmendment(
        amended,
        amendmentId,
        actOf(amended, draft, staffUserId, promotions?.phrase ?? null),
      );
    });
    return amendmentId;
  }
}

/**
 * L'acte : sur le DOCUMENT (un seul fil pour l'accord), daté de la prise
 * d'effet comme la pose, avec le motif — jamais nul ici.
 */
function actOf(
  mercuriale: CompanyMercuriale,
  draft: MercurialeAmendmentDraft,
  actor: string,
  promotionPhrase: string | null,
) {
  return {
    subjectType: "mercuriale" as const,
    subjectId: mercuriale.id,
    kind: "amended" as const,
    actor,
    at: draft.validFrom,
    reason: draft.reason.trim(),
    summary: describeAmendment(mercuriale, draft, promotionPhrase),
    subjectLabel: mercuriale.label,
  };
}
