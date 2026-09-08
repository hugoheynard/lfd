import type { MercurialeDraftView, SaveMercurialeDraftPayload } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";

/**
 * **Le brouillon de mercuriale d'un client** — lire, enregistrer, jeter.
 *
 * Un `*Store` et non un `*Query` : il ÉCRIT autant qu'il lit, et le nommer
 * « query » aurait fait passer `save` et `discard` pour des lectures dans la
 * liste des fichiers — exactement ce que la séparation lecture/écriture du
 * dépôt existe pour rendre visible.
 *
 * ## Pourquoi ce n'est pas un agrégat
 *
 * Il n'a **aucun invariant à protéger**. Une grille incomplète est son état
 * normal — c'est même sa raison d'être : on écrit les prix avant de dater, on
 * date avant de nommer, et rien de tout cela ne doit être refusé. Un agrégat
 * ici serait de la cérémonie, et la question de tri du dépôt le dit :
 * « existe-t-il une règle qui peut refuser cette écriture ? » — non.
 *
 * Les refus arrivent **à la pose**, où ils ont un sens : c'est là qu'une grille
 * devient une décision, et c'est `PricingRule` qui les porte.
 *
 * ## Un seul par société, et enregistrer remplace
 *
 * `companyId` est la clé primaire. Une négociation se reprend, elle ne se
 * collectionne pas : deux brouillons ouverts sur le même compte poseraient la
 * question de savoir lequel fait foi, à laquelle personne n'aurait de réponse.
 */
@Injectable()
export class MercurialeDrafts {
  constructor(private readonly prisma: PrismaService) {}

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
