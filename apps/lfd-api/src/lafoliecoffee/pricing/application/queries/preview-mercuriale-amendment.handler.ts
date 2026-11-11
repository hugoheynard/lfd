import type {
  AmendCompanyMercurialePayload,
  MercurialeAmendmentPreviewRefusal,
  MercurialeAmendmentPreviewView,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { AppError } from "../../../../platform/shared/errors/app-error.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { CompanyMercuriale } from "../../domain/entities/company-mercuriale.js";
import { CompanyMercurialeReader } from "../../domain/ports/company-mercuriale.reader.js";
import { PolicyPromotionNamesReader } from "../../domain/ports/policy-promotion-names.reader.js";
import { PricedCompanyReader } from "../../domain/ports/priced-company.reader.js";
import {
  AmendedMercurialeNotFoundError,
  PricedCompanyNotFoundError,
} from "../../domain/pricing-errors.js";
import { amendmentDraftOf } from "../commands/amendment-draft-support.js";
import { namedPolicy } from "../commands/promotion-policy-support.js";
import { previewItems, previewState, refusalOf } from "../mercuriale-amendment-preview.js";
import { PricingPartiesResolver } from "../pricing-parties.resolver.js";
import { CompanyPriceSheets } from "../ports/company-price-sheet.js";
import { PreviewMercurialeAmendmentQuery } from "./preview-mercuriale-amendment.query.js";

/**
 * L'identifiant et l'auteur que `amend` exige, pour une copie qui ne sera
 * jamais écrite : ce handler n'a aucun port d'écriture.
 */
const PREVIEW_AMENDMENT_ID = "preview";
const PREVIEW_AUTHOR = "preview";

/** La copie amendée, ou les refus qui l'empêchent. */
interface Attempt {
  readonly amended: CompanyMercuriale | null;
  readonly refusals: readonly MercurialeAmendmentPreviewRefusal[];
}

@QueryHandler(PreviewMercurialeAmendmentQuery)
export class PreviewMercurialeAmendmentHandler implements IQueryHandler<
  PreviewMercurialeAmendmentQuery,
  MercurialeAmendmentPreviewView
> {
  constructor(
    private readonly companies: PricedCompanyReader,
    private readonly mercuriales: CompanyMercurialeReader,
    private readonly parties: PricingPartiesResolver,
    private readonly sheets: CompanyPriceSheets,
    private readonly promotionNames: PolicyPromotionNamesReader,
    private readonly clock: Clock,
  ) {}

  /**
   * Résout chaque article du catalogue de ce client à la date d'effet, sur la
   * mercuriale telle qu'elle est puis sur sa copie amendée. Les refus de
   * l'avenant sont RENDUS (`refusals`), pas levés : l'écran désigne la ligne.
   *
   * 🔴 **Le mur** : la mercuriale doit appartenir au compte de tarif du client
   * à la date d'effet — la sienne, ou celle du principal qu'un site suit.
   *
   * @throws {PricedCompanyNotFoundError} l'identifiant ne désigne aucune société.
   * @throws {AmendedMercurialeNotFoundError} aucune mercuriale non close de cet
   *   identifiant sur le compte de tarif de ce client.
   */
  async execute(query: PreviewMercurialeAmendmentQuery): Promise<MercurialeAmendmentPreviewView> {
    const { companyId, mercurialeId, payload } = query;
    if (!(await this.companies.exists(companyId))) {
      throw new PricedCompanyNotFoundError(companyId);
    }
    const now = this.clock.now();
    // Absente du corps = maintenant (`amendment-draft.ts`) : jamais un minuit.
    const at = payload.validFrom === undefined ? now : new Date(payload.validFrom);
    const parties = await this.parties.partiesAt(companyId, at, "unknown");
    const [sheet, owned] = await Promise.all([
      this.sheets.sheetFor(companyId, parties, at),
      this.mercuriales.listFor(parties.pricingCompanyId ?? companyId),
    ]);
    const mercuriale = owned.find((candidate) => candidate.id === mercurialeId);
    if (mercuriale === undefined) {
      throw new AmendedMercurialeNotFoundError(mercurialeId);
    }
    const attempt = await this.attempt(mercuriale, payload, now);
    const before = await sheet.categoriesWith(mercuriale);
    const after = attempt.amended === null ? before : await sheet.categoriesWith(attempt.amended);
    return {
      at: at.toISOString(),
      basedOnAmendmentId: mercuriale.latestAmendmentId,
      state: previewState(mercuriale, at),
      items: previewItems(before, after, attempt.amended ?? mercuriale, at),
      refusals: attempt.refusals,
    };
  }

  /** Les mêmes refus que l'enregistrement : politique nommée, puis `amend`. */
  private async attempt(
    mercuriale: CompanyMercuriale,
    payload: AmendCompanyMercurialePayload,
    now: Date,
  ): Promise<Attempt> {
    try {
      const promotions =
        payload.promotionPolicy === undefined
          ? null
          : await namedPolicy(this.promotionNames, payload.promotionPolicy);
      const draft = amendmentDraftOf(payload, now, promotions?.policy ?? null);
      const amended = mercuriale.amend(PREVIEW_AMENDMENT_ID, draft, PREVIEW_AUTHOR, now);
      return { amended, refusals: [] };
    } catch (error) {
      if (error instanceof AppError) {
        return { amended: null, refusals: [refusalOf(error)] };
      }
      throw error;
    }
  }
}
