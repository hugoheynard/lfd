import type { MercurialeDraftView, SaveMercurialeDraftPayload } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { MercurialeDraftStore } from "../application/ports/mercuriale-draft.store.js";

/**
 * **Le brouillon de mercuriale, en base.**
 *
 * La classe vivait dans `application/` et injectait `PrismaService` — ce que
 * `CLAUDE.md` §4 interdit. Le port porte désormais le raisonnement (pourquoi ce
 * n'est pas un agrégat, pourquoi un seul port) ; ici il ne reste que la ligne et
 * sa conversion.
 */
@Injectable()
export class PrismaMercurialeDraftStore extends MercurialeDraftStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Le brouillon en cours, ou `null` — il n'y en a jamais eu, ou il est posé. */
  async forCompany(companyId: string): Promise<MercurialeDraftView | null> {
    const row = await this.prisma.mercurialeDraft.findUnique({ where: { companyId } });
    if (row === null) {
      return null;
    }
    return {
      label: row.label,
      validFrom: row.validFrom?.toISOString() ?? null,
      validTo: row.validTo?.toISOString() ?? null,
      lines: linesOf(row.lines),
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Enregistre — remplace ce qui s'y trouvait. */
  async save(
    companyId: string,
    payload: SaveMercurialeDraftPayload,
    staffSub: string,
  ): Promise<void> {
    const data = {
      label: payload.label,
      validFrom: payload.validFrom === null ? null : new Date(payload.validFrom),
      validTo: payload.validTo === null ? null : new Date(payload.validTo),
      lines: [...payload.lines],
      updatedBy: staffSub,
    };
    await this.prisma.mercurialeDraft.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
    });
  }

  /**
   * Jette le brouillon. **Silencieux s'il n'y en a pas** : le geste vise un état
   * — « plus de brouillon sur ce compte » — et il est atteint dans les deux cas.
   * C'est aussi ce qui rend la pose sûre à répéter, puisqu'elle nettoie derrière
   * elle.
   */
  async discard(companyId: string): Promise<void> {
    await this.prisma.mercurialeDraft.deleteMany({ where: { companyId } });
  }
}

/**
 * Les lignes du JSON, filtrées sur ce qui a la forme attendue.
 *
 * Le schéma fait foi à l'écriture ; en lecture, une ligne mal formée vient
 * forcément d'une écriture antérieure au contrat courant. La jeter vaut mieux
 * que de faire tomber l'écran : un brouillon amputé d'une ligne se recomplète,
 * une page blanche ne dit rien.
 */
function linesOf(raw: unknown): { sku: string; unitPriceMillicents: number }[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isLine).map((line) => ({
    sku: line.sku,
    unitPriceMillicents: line.unitPriceMillicents,
  }));
}

function isLine(value: unknown): value is { sku: string; unitPriceMillicents: number } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const line: Record<string, unknown> = { ...value };
  return typeof line["sku"] === "string" && typeof line["unitPriceMillicents"] === "number";
}
