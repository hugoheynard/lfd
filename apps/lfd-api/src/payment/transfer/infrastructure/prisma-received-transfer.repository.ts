import { Injectable } from "@nestjs/common";

import { isUniqueViolation } from "../../../platform/database/json-columns.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ReceivedTransfer } from "../domain/entities/received-transfer.js";
import { SubjectAlreadySettledByTransferError } from "../domain/errors/received-transfer-errors.js";
import { ReceivedTransferRepository } from "../domain/ports/received-transfer.repository.js";
import { dayColumn } from "./transfer-day.js";

/**
 * Écrit le virement et ses parts en un `create` imbriqué. L'unique
 * `(subject_type, subject_id)` est le filet d'un sujet réglé deux fois ;
 * le chemin, c'est le jugement de l'appelant sous ses propres verrous.
 */
@Injectable()
export class PrismaReceivedTransferRepository extends ReceivedTransferRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async add(transfer: ReceivedTransfer): Promise<void> {
    const state = transfer.toState();
    try {
      await this.prisma.transferReceived.create({
        data: {
          id: state.id,
          receivedInto: state.receivedInto,
          payerRef: state.payerRef,
          amountCents: state.amountCents,
          receivedOn: dayColumn(state.receivedOn),
          reference: state.reference,
          recordedAt: state.recordedAt,
          recordedByStaffId: state.recordedBy,
          allocations: {
            create: state.parts.map((part) => ({
              subjectType: part.subject.type,
              subjectId: part.subject.id,
              amountCents: part.amountCents,
            })),
          },
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new SubjectAlreadySettledByTransferError(state.id);
      }
      throw error;
    }
  }
}
