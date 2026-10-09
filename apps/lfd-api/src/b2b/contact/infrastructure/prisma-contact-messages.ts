import type { ContactMessageStatus, ContactMessageView, CustomerAudience } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ContactMessage } from "../domain/contact-message.js";
import { ContactMessageReader } from "../domain/ports/contact-message.reader.js";
import { ContactMessageRepository } from "../domain/ports/contact-message.repository.js";
import { ContactAudienceUnreadableError } from "./contact-audience-unreadable.error.js";

interface MessageRow {
  readonly id: string;
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly priority: "low" | "medium" | "urgent";
  readonly audience: "b2b" | "b2c" | "both";
  readonly authorName: string;
  readonly authorEmail: string;
  readonly authorPhone: string;
  readonly body: string;
  readonly userId: string | null;
  readonly companyId: string | null;
  readonly receivedAt: Date;
  readonly handledAt: Date | null;
  readonly handledByStaffId: string | null;
  readonly handledByName: string | null;
  readonly anonymizedAt: Date | null;
}

/** Un message est écrit depuis un espace, jamais depuis « les deux » : la base l'a mal gardé. */
function audienceOfRow(row: MessageRow): CustomerAudience {
  if (row.audience === "both") {
    throw new ContactAudienceUnreadableError(row.id);
  }
  return row.audience;
}

function toDomain(row: MessageRow): ContactMessage {
  const handled =
    row.handledAt === null
      ? null
      : {
          at: row.handledAt,
          by: { staffUserId: row.handledByStaffId ?? "", name: row.handledByName ?? "", role: "" },
        };
  return ContactMessage.rehydrate({
    id: row.id,
    subjectId: row.subjectId,
    subjectLabel: row.subjectLabel,
    priority: row.priority,
    audience: audienceOfRow(row),
    author: { name: row.authorName, email: row.authorEmail, phone: row.authorPhone },
    body: row.body,
    userId: row.userId,
    companyId: row.companyId,
    receivedAt: row.receivedAt,
    handling: handled,
    anonymizedAt: row.anonymizedAt,
  });
}

function toView(row: MessageRow): ContactMessageView {
  return {
    id: row.id,
    subjectId: row.subjectId,
    subjectLabel: row.subjectLabel,
    priority: row.priority,
    audience: audienceOfRow(row),
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    authorPhone: row.authorPhone,
    message: row.body,
    userId: row.userId,
    companyId: row.companyId,
    receivedAt: row.receivedAt.toISOString(),
    handledAt: row.handledAt?.toISOString() ?? null,
    // Un agent que l'annuaire ne connaissait pas a été figé sans nom : on ne l'invente pas.
    handledBy: row.handledByName === null || row.handledByName === "" ? null : row.handledByName,
    anonymizedAt: row.anonymizedAt?.toISOString() ?? null,
  };
}

/**
 * Adaptateur Prisma de l'écriture des messages. `save` crée le message reçu,
 * ou n'écrit que son traitement : le reste d'un message ne change jamais après
 * sa réception (l'anonymisation passe par son propre port).
 */
@Injectable()
export class PrismaContactMessageRepository extends ContactMessageRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<ContactMessage | null> {
    const row = await this.prisma.contactMessage.findUnique({ where: { id } });
    return row === null ? null : toDomain(row);
  }

  async save(message: ContactMessage): Promise<void> {
    const state = message.toPersistence();
    const handling = {
      handledAt: state.handling?.at ?? null,
      handledByStaffId: state.handling?.by.staffUserId ?? null,
      handledByName: state.handling?.by.name ?? null,
    };
    await this.prisma.contactMessage.upsert({
      where: { id: state.id },
      create: {
        id: state.id,
        subjectId: state.subjectId,
        subjectLabel: state.subjectLabel,
        priority: state.priority,
        audience: state.audience,
        authorName: state.author.name,
        authorEmail: state.author.email,
        authorPhone: state.author.phone,
        body: state.body,
        userId: state.userId,
        companyId: state.companyId,
        receivedAt: state.receivedAt,
        ...handling,
      },
      update: handling,
    });
  }
}

/** Adaptateur Prisma de la liste des messages. */
@Injectable()
export class PrismaContactMessageReader extends ContactMessageReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(status: ContactMessageStatus, limit: number): Promise<ContactMessageView[]> {
    const rows = await this.prisma.contactMessage.findMany({
      where: status === "pending" ? { handledAt: null } : { handledAt: { not: null } },
      // À traiter : urgent d'abord (l'énumération est déclarée dans l'ordre
      // croissant, cf. `contact.prisma`), puis le plus ancien.
      orderBy:
        status === "pending"
          ? [{ priority: "desc" }, { receivedAt: "asc" }]
          : [{ handledAt: "desc" }],
      take: limit,
    });
    return rows.map(toView);
  }
}
