import type {
  CollectionExclusionView,
  CollectionPreviewLineView,
  CollectionPreviewView,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { CollectionNotYetOpenError } from "../../domain/errors/collection-errors.js";
import { CollectionCandidatesReader } from "../../domain/ports/collection-candidates.reader.js";
import { CollectionMandatesReader } from "../../domain/ports/collection-mandates.reader.js";
import { cycleAt } from "../../domain/services/billing-cycle.js";
import { readAssembly, type ReadAssembly } from "../collection-constitution-support.js";
import { GetCollectionPreviewQuery } from "./collection-batch-queries.js";

/**
 * **L'aperçu du mois** (plan `prelevement-automatique.md`, PA4) : ce que
 * la préparation du lot débiterait à la prochaine clôture.
 *
 * ## Calculé comme le lot, par le même chemin
 *
 * `readAssembly` puis `assembleCollection`, exactement ceux de la
 * constitution — seul le cycle change (`cycleAt`, celui qui court, au lieu
 * du dernier clos). Le montant d'une ligne est donc le total de SA facture,
 * pas la somme de ses bons : un aperçu qui sommerait les bons annoncerait un
 * autre chiffre que celui du fichier.
 *
 * ## Une lecture n'écrit rien
 *
 * Ni verrou, ni transaction, ni état d'encaissement, ni arrêté : le handler
 * n'a aucun port d'écriture à appeler. Deux aperçus simultanés ne se gênent
 * pas, et un aperçu pendant une constitution lit l'état d'avant ou d'après.
 *
 * ## « Pas encore prélevable » est un état, pas un refus
 *
 * Le plancher (mise en service) après la prochaine clôture n'est pas une
 * erreur de l'aperçu : c'est sa réponse, avec les deux dates qui disent quand
 * le premier mois le sera. Le plancher ABSENT, lui, reste un refus (409).
 */
@QueryHandler(GetCollectionPreviewQuery)
export class GetCollectionPreviewHandler implements IQueryHandler<
  GetCollectionPreviewQuery,
  CollectionPreviewView
> {
  constructor(
    private readonly candidates: CollectionCandidatesReader,
    private readonly mandates: CollectionMandatesReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetCollectionPreviewQuery): Promise<CollectionPreviewView> {
    try {
      const read = await readAssembly(
        { candidates: this.candidates, mandates: this.mandates },
        query.legalEntityId,
        this.clock.now(),
        cycleAt,
      );
      return toView(read);
    } catch (caught) {
      if (caught instanceof CollectionNotYetOpenError) {
        return {
          state: "not_yet_open",
          floorAt: caught.floorAt.toISOString(),
          firstClosureAt: caught.firstClosure.toISOString(),
        };
      }
      throw caught;
    }
  }
}

function toView(read: ReadAssembly): CollectionPreviewView {
  const lines: CollectionPreviewLineView[] = [...read.assembly.debits.entries()].flatMap(
    ([scheme, debits]) =>
      debits.map((debit) => ({
        scheme,
        payerCompanyId: debit.payerId,
        debtorName: debit.debtorName,
        orderCount: debit.orders.length,
        amountCents: debit.amountCents,
        ordersTotalCents: debit.ordersTotalCents,
      })),
  );
  const exclusions: CollectionExclusionView[] = read.assembly.exclusions.map(
    ({ order, reason }) => ({
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      companyName: read.companyNames.get(order.companyId) ?? order.companyId,
      placedAt: order.placedAt.toISOString(),
      amountCents: order.totalCents,
      reason,
    }),
  );
  return {
    state: "open",
    cycleStartsAt: read.cycle.startsAt.toISOString(),
    cycleClosesAt: read.cycle.closesAt.toISOString(),
    floorAt: read.floor.toISOString(),
    lines,
    totalCents: sum(lines.map((line) => line.amountCents)),
    ordersTotalCents: sum(lines.map((line) => line.ordersTotalCents)),
    exclusions,
    unmandatedCompanies: read.assembly.unmandatedCompanies,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
