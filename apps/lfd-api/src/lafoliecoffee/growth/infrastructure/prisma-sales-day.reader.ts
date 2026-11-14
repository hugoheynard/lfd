import type { CompanyContactMode } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ACCOUNT_FACTS } from "../../account/domain/events/account-facts.js";
import { SalesDayReader, type SalesDayScope } from "../domain/ports/sales-day.reader.js";
import { contactModeOfAppointment, type ParisDay } from "../domain/sales-today.js";
import { notedContactOf } from "./noted-contact-payload.js";

const HONORED = "honored";
const COMPANY_SUBJECT = "company";

/** Ce qu'il faut savoir d'une société touchée ce jour pour la garder ou non. */
interface TouchedCompany {
  readonly followedByStaffId: string | null;
}

/**
 * Le récap du jour, en **quatre lectures** au plus quel que soit le volume :
 * un `count` des ouvertures, les contacts notés depuis le début du jour (index
 * `(type, occurred_at)`), les rendez-vous honorés du jour (index
 * `(start_at)`), puis les sociétés touchées, par lot, pour le canal et le
 * suiveur. Aucune jointure entre schémas : les deux dernières se joignent en
 * mémoire.
 */
@Injectable()
export class PrismaSalesDayReader extends SalesDayReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  openedOn(scope: SalesDayScope, day: ParisDay): Promise<number> {
    return this.prisma.company.count({
      where: {
        parentCompanyId: null,
        createdAt: { gte: day.start, lt: day.end },
        ...(scope.actor === undefined ? {} : { declaredByStaffId: scope.actor }),
        ...(scope.actor === undefined && scope.unassigned === true
          ? { followedByStaffId: null }
          : {}),
        ...(scope.channel === undefined ? {} : { declaredVia: scope.channel }),
      },
    });
  }

  async contactsOn(scope: SalesDayScope, day: ParisDay): Promise<readonly CompanyContactMode[]> {
    const [noted, honored] = await Promise.all([
      // Un contact daté de ce jour est forcément noté ce jour ou après (jamais
      // dans le futur) : la borne basse sur `occurred_at` ne perd rien.
      this.prisma.activityEvent.findMany({
        where: {
          type: ACCOUNT_FACTS.companyContacted,
          subjectType: COMPANY_SUBJECT,
          occurredAt: { gte: day.start },
          ...(scope.actor === undefined ? {} : { actorId: scope.actor }),
        },
        select: { subjectId: true, payload: true },
      }),
      this.prisma.appointment.findMany({
        where: {
          status: HONORED,
          subjectType: COMPANY_SUBJECT,
          startAt: { gte: day.start, lt: day.end },
        },
        select: { subjectId: true, channel: true },
      }),
    ]);
    const companies = await this.touched(
      scope,
      [...noted, ...honored].map((row) => row.subjectId),
    );
    const notedModes = noted.flatMap((row) => {
      const contact = notedContactOf(row.payload);
      return contact !== null && contact.date === day.day && companies.has(row.subjectId)
        ? [contact.mode]
        : [];
    });
    const honoredModes = honored.flatMap((row) => {
      const company = companies.get(row.subjectId);
      const mode = contactModeOfAppointment(row.channel);
      const mine = scope.actor === undefined || company?.followedByStaffId === scope.actor;
      return company !== undefined && mode !== null && mine ? [mode] : [];
    });
    return [...notedModes, ...honoredModes];
  }

  /** Les sociétés touchées que le canal retient, par lot. */
  private async touched(
    scope: SalesDayScope,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, TouchedCompany>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.company.findMany({
      where: {
        id: { in: [...new Set(ids)] },
        ...(scope.channel === undefined ? {} : { declaredVia: scope.channel }),
      },
      select: { id: true, followedByStaffId: true },
    });
    return new Map(rows.map((row) => [row.id, { followedByStaffId: row.followedByStaffId }]));
  }
}
