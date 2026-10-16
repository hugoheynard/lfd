import { Injectable } from "@nestjs/common";

import { OperationReader } from "../../../operations/domain/ports/operation.reader.js";
import { ReferentialOperations, type ReferentialOperation } from "./referential-operations.js";

/**
 * Le référentiel répond à la migration par son port de LECTURE des
 * opérations : des instantanés, traduits dans la forme du canal.
 */
@Injectable()
export class PimReferentialOperations extends ReferentialOperations {
  constructor(private readonly operations: OperationReader) {
    super();
  }

  async list(): Promise<readonly ReferentialOperation[]> {
    return (await this.operations.list()).map((operation) => ({
      key: operation.key,
      name: { ...operation.name },
      lede: operation.lede === null ? null : { ...operation.lede },
      image: operation.image === null ? null : { url: operation.image.url },
      announceFrom: operation.schedule.announceFrom,
      orderFrom: operation.schedule.orderFrom,
      orderUntil: operation.schedule.orderUntil,
      pickupFrom: operation.schedule.pickupFrom.value,
      pickupUntil: operation.schedule.pickupUntil.value,
      audience: operation.audience,
      skus: [...operation.skus],
      archivedAt: operation.archivedAt,
    }));
  }
}
