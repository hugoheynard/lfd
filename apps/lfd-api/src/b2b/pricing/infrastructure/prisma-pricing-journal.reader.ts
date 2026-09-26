import { Injectable } from "@nestjs/common";
import { pricingSubjectSchema } from "@lfd/contracts";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  PricingJournalReader,
  type JournalEntry,
  type JournalPage,
  type JournalPageRequest,
} from "../domain/ports/pricing-journal.reader.js";
import {
  PRICING_ACTS,
  type PricingActKind,
  type PricingSubjectType,
} from "../domain/pricing-act.js";
import { UnknownJournalAnchorError } from "../domain/pricing-errors.js";
import type { PricingEventRow } from "./pricing-journal.writer.js";

/** Au-delà, l'écran ne montre plus une histoire mais un fichier de logs. */
const MAX_ENTRIES = 200;

/** Un ordre TOTAL : à la même milliseconde, l'`id` départage. */
const NEWEST_FIRST: Prisma.PricingEventOrderByWithRelationInput[] = [
  { occurredAt: "desc" },
  { id: "desc" },
];

interface Anchor {
  readonly id: string;
  readonly occurredAt: Date;
}

/**
 * L'ancre et tout ce qui la suit dans l'ordre {@link NEWEST_FIRST}.
 *
 * Par le COUPLE `(occurredAt, id)`, pas par `id <= asOf` : l'`id` est un ULID
 * posé par l'horloge de l'application, `occurredAt` l'instant de l'acte — deux
 * horloges, deux ordres qui peuvent diverger. Seul le couple reproduit l'ordre
 * de lecture, donc seul il découpe l'instantané exactement où la page 1 l'a vu.
 */
function upToAnchor(anchor: Anchor): Prisma.PricingEventWhereInput {
  return {
    OR: [
      { occurredAt: { lt: anchor.occurredAt } },
      { occurredAt: anchor.occurredAt, id: { lte: anchor.id } },
    ],
  };
}

@Injectable()
export class PrismaPricingJournalReader extends PricingJournalReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async forSubject(
    subjectType: string,
    subjectId: string,
    formerSubjectIds: readonly string[] = [],
  ): Promise<JournalEntry[]> {
    const rows = await this.prisma.pricingEvent.findMany({
      where: { subjectType, subjectId: { in: [subjectId, ...formerSubjectIds] } },
      orderBy: { occurredAt: "desc" },
      take: MAX_ENTRIES,
    });
    return entriesFromRows(rows);
  }

  /**
   * `findMany` et `count` sur le MÊME `where` — sujet ET instantané —, lus côte
   * à côte : un acte écrit entre les deux est postérieur à l'ancre, et aucun des
   * deux ne le voit.
   */
  async pageForSubject(request: JournalPageRequest): Promise<JournalPage> {
    const subject = {
      subjectType: request.subjectType,
      subjectId: { in: [request.subjectId, ...(request.formerSubjectIds ?? [])] },
    };
    const anchor = await this.anchorOf(subject, request.asOf);
    if (anchor === null) {
      return { entries: [], total: 0, asOf: null };
    }
    const where = { AND: [subject, upToAnchor(anchor)] };
    const [rows, total] = await Promise.all([
      this.prisma.pricingEvent.findMany({
        where,
        orderBy: NEWEST_FIRST,
        skip: (request.page - 1) * request.pageSize,
        take: request.pageSize,
      }),
      this.prisma.pricingEvent.count({ where }),
    ]);
    return { entries: entriesFromRows(rows), total, asOf: anchor.id };
  }

  /**
   * L'acte ancre : celui que l'appelant désigne, ou le plus récent du sujet.
   * `null` seulement quand le sujet n'a encore aucun acte.
   */
  private async anchorOf(
    subject: { readonly subjectType: string; readonly subjectId: { readonly in: string[] } },
    asOf: string | null,
  ): Promise<Anchor | null> {
    const select = { id: true, occurredAt: true } as const;
    if (asOf === null) {
      return this.prisma.pricingEvent.findFirst({ where: subject, orderBy: NEWEST_FIRST, select });
    }
    const anchor = await this.prisma.pricingEvent.findFirst({
      where: { ...subject, id: asOf },
      select,
    });
    if (anchor === null) {
      throw new UnknownJournalAnchorError(asOf);
    }
    return anchor;
  }

  async recent(limit: number): Promise<JournalEntry[]> {
    const rows = await this.prisma.pricingEvent.findMany({
      orderBy: { occurredAt: "desc" },
      take: Math.min(Math.max(limit, 1), MAX_ENTRIES),
    });
    return entriesFromRows(rows);
  }
}

/**
 * Un acte inconnu **ne lève pas**, à la différence d'une règle illisible.
 *
 * La dissymétrie est voulue : une règle illisible facturerait un prix que
 * personne n'a décidé, alors qu'un acte illisible ne fait rien du tout. Refuser
 * de rendre le journal entier parce qu'une de ses trois cents lignes vient d'une
 * version plus récente reviendrait à perdre l'historique pour protéger de rien.
 * Le verbe inconnu se range en `posed`, la phrase figée, elle, reste exacte.
 *
 * Le **sujet** inconnu, lui, ne se range nulle part : la ligne est écartée. Un
 * verbe approximatif laisse la ligne au bon endroit — même sujet, même phrase.
 * Un sujet deviné l'enverrait ailleurs : son `subjectId` serait lu comme celui
 * d'une règle, et l'écran mènerait à une fiche qui n'est pas la sienne. C'est
 * ce que faisait le repli sur `rule`, pour les barèmes et les mercuriales
 * (corrigé le 2026-09-19). Seule la lecture tous sujets confondus peut
 * rencontrer ce cas : une lecture par sujet filtre en base sur un sujet déjà
 * reconnu à la frontière HTTP.
 */
function entriesFromRows(rows: readonly PricingEventRow[]): JournalEntry[] {
  return rows.flatMap((row) => {
    const subject = pricingSubjectSchema.safeParse(row.subjectType);
    return subject.success ? [entryFromRow(row, subject.data)] : [];
  });
}

function entryFromRow(row: PricingEventRow, subjectType: PricingSubjectType): JournalEntry {
  return {
    id: row.id,
    subjectType,
    subjectId: row.subjectId,
    kind: actOf(row.act),
    actor: row.actor,
    at: row.occurredAt,
    reason: row.reason,
    summary: row.summary,
  };
}

function actOf(value: string): PricingActKind {
  return PRICING_ACTS.find((candidate) => candidate === value) ?? "posed";
}
