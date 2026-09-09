import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PricingFloorRepository } from "../domain/ports/pricing-floor.repository.js";
import { PricingFloor } from "../domain/entities/pricing-floor.js";
import { floorFromRow } from "./price-rows.js";
import { PricingActWriter } from "./pricing-act.writer.js";
import type { PricingAct } from "../domain/pricing-act.js";
import type { PriceFloor, PriceScope } from "../domain/price-rule.js";

@Injectable()
export class PrismaPricingFloorRepository extends PricingFloorRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acts: PricingActWriter,
  ) {
    super();
  }

  /**
   * **Borne la limite en vigueur, puis pose la nouvelle** — dans une seule
   * transaction.
   *
   * ⚠️ C'était un `upsert` sur la clé primaire jusqu'au 2026-09-09, possible
   * parce que l'identifiant était dérivé de la portée : pas de lecture
   * préalable, donc pas de fenêtre entre « je regarde s'il existe » et « je
   * l'écris ». C'est aussi ce qui **réécrivait** la limite précédente, et rendait
   * le passé illisible.
   *
   * La course que l'`upsert` évitait est désormais rattrapée là où elle l'est
   * pour les quatre autres familles : par la contrainte d'exclusion
   * `price_floors_no_overlap`. Deux poses concurrentes ne peuvent pas laisser
   * deux limites en vigueur sur la même portée.
   */
  async pose(floor: PricingFloor, act: PricingAct): Promise<void> {
    const state = floor.toPersistence();
    const dynamic = state.policy.dynamic;
    const shared = {
      scopeType: state.scope.type,
      scopeId: state.scope.id,
      mode: state.policy.hard.mode,
      value: magnitudeOf(state.policy.hard),
      // Toutes les colonnes de la porte sont écrites, y compris à `null` : un
      // `upsert` qui les omettrait laisserait la porte d'une version précédente
      // en place, et le plancher dur deviendrait contournable sans que personne
      // ne l'ait décidé.
      dynamicMode: dynamic?.floor.mode ?? null,
      dynamicValue: dynamic === null ? null : magnitudeOf(dynamic.floor),
      unlockMinQuantity: dynamic?.unlock.minQuantity ?? null,
      unlockMinVolumeRatioBp: dynamic?.unlock.minVolumeRatioBp ?? null,
      // Re-posée = re-décidée : la référence se rafraîchit, et l'écart repart
      // de zéro. C'est exactement ce qu'on veut d'une confirmation — sans quoi
      // le signal ne s'éteindrait jamais et on apprendrait à l'ignorer.
      //
      // ⚠️ Cet effet est PRÉSERVÉ par le versionnage, et il fallait le vérifier :
      // la ligne neuve porte sa propre référence, donc l'écart repart bien de
      // zéro. Ce qu'on ne perd plus, c'est l'ancienne — que la réécriture en
      // place effaçait.
      referenceCanonicalMillicents: state.referenceCanonicalMillicents,
      createdBy: state.createdBy,
      validFrom: state.validFrom,
      validTo: state.validTo,
    };

    await this.acts.around(act, () =>
      this.prisma.$transaction(async (tx) => {
        // La précédente s'arrête là où la nouvelle commence — bornée, pas
        // réécrite. C'est ce qui rend l'histoire de la portée relisible, et ce
        // que l'`upsert` sur la clé primaire rendait impossible.
        await tx.priceFloor.updateMany({
          where: {
            scopeType: state.scope.type,
            scopeId: state.scope.id,
            archivedAt: null,
            OR: [{ validTo: null }, { validTo: { gt: state.validFrom } }],
          },
          data: { validTo: state.validFrom },
        });
        await tx.priceFloor.create({ data: { id: state.id, ...shared } });
      }),
    );
  }

  /**
   * **La limite qui arbitre cette portée à cet instant.**
   *
   * Elle s'adressait par identifiant — dérivé de la portée, donc unique. Il y a
   * désormais N lignes par portée, une par période : c'est la portée **et
   * l'instant** qui désignent, et l'écran continue de ne connaître que la portée.
   */
  async inForceFor(scope: PriceScope, at: Date): Promise<PricingFloor | null> {
    const row = await this.prisma.priceFloor.findFirst({
      where: {
        scopeType: scope.type,
        scopeId: scope.id,
        archivedAt: null,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
    });
    if (row === null) {
      return null;
    }
    const scoped = floorFromRow(row);
    return PricingFloor.reconstitute({
      id: scoped.id,
      scope: scoped.scope,
      policy: scoped.policy,
      createdBy: row.createdBy,
      referenceCanonicalMillicents: row.referenceCanonicalMillicents,
      validFrom: row.validFrom,
      validTo: row.validTo,
    });
  }

  /**
   * **Archive**, jamais `DELETE`. Le `where` porte sur `archivedAt: null` : ré-
   * archiver une limite déjà retirée rend `false`, donc un 404 — deux personnes
   * peuvent avoir le même écran ouvert, et la seconde doit savoir que son geste
   * n'a rien fait.
   */
  async archive(id: string, act: PricingAct): Promise<boolean> {
    // `aroundChange` et non `around` : sans lui, un archivage qui ne trouve rien
    // écrirait quand même son acte, et le journal raconterait un geste qui n'a
    // rien fait.
    return this.acts.aroundChange(act, async () => {
      const { count } = await this.prisma.priceFloor.updateMany({
        where: { id, archivedAt: null },
        // Ranger BORNE aussi, comme pour les quatre autres familles : sans ça,
        // une relecture datée postérieure au rangement appliquerait encore la
        // limite. Le `validTo` n'est posé que s'il ne recule pas — une limite
        // déjà bornée porte sa vraie fin.
        data: {
          archivedAt: act.at,
          archivedBy: act.actor,
          archiveReason: act.reason,
          validTo: act.at,
        },
      });
      return count > 0;
    });
  }
}

function magnitudeOf(floor: PriceFloor): number {
  return floor.mode === "percent" ? floor.bp : floor.millicents;
}
