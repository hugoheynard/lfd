import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { OperationOverrideView, ReceivedOperationView } from "@lfd/contracts";

import { effectiveOperation } from "../../domain/effective-operation.js";
import type { CatalogOperationOverrideState } from "../../domain/entities/catalog-operation-override.js";
import {
  ReceivedOperationsReader,
  type ReceivedOperation,
} from "../../domain/ports/received-operations.reader.js";
import { ListReceivedOperationsQuery } from "./list-received-operations.query.js";

/**
 * **Ce que la réception voit des opérations** : ce que le référentiel a dit,
 * ce qu'on en a décidé ici, et ce qui s'appliquera — `effective`, calculé par
 * le domaine (`effectiveOperation`) et jamais par l'écran. Deux écrans qui
 * recombineraient chacun `min` et intersection finiraient par ne plus dire la
 * même chose que la boutique.
 */
@QueryHandler(ListReceivedOperationsQuery)
export class ListReceivedOperationsHandler implements IQueryHandler<
  ListReceivedOperationsQuery,
  ReceivedOperationView[]
> {
  constructor(private readonly operations: ReceivedOperationsReader) {}

  async execute(): Promise<ReceivedOperationView[]> {
    return (await this.operations.list()).map(toView);
  }
}

function toView({ received, withdrawnAt, override }: ReceivedOperation): ReceivedOperationView {
  const effective = effectiveOperation(received, override?.restriction ?? null);
  return {
    key: received.key,
    name: received.name,
    lede: received.lede,
    image: received.image,
    announceFrom: received.announceFrom.toISOString(),
    orderFrom: received.orderFrom === null ? null : received.orderFrom.toISOString(),
    orderUntil: received.orderUntil.toISOString(),
    pickupFrom: received.pickupFrom,
    pickupUntil: received.pickupUntil,
    audience: received.audience,
    skus: received.skus,
    receivedAt: received.receivedAt.toISOString(),
    withdrawn: withdrawnAt !== null,
    withdrawnAt: withdrawnAt === null ? null : withdrawnAt.toISOString(),
    override: override === null ? null : overrideView(override),
    effective: {
      isHidden: effective.isHidden,
      orderUntil: effective.orderUntil.toISOString(),
      audience: effective.audience,
      skus: effective.skus,
    },
  };
}

function overrideView(state: CatalogOperationOverrideState): OperationOverrideView {
  const { restriction } = state;
  return {
    isHidden: restriction.isHidden,
    orderUntil: restriction.orderUntil === null ? null : restriction.orderUntil.toISOString(),
    audience: restriction.audience,
    hiddenSkus: restriction.hiddenSkus,
    decidedBy: state.decidedBy,
    decidedAt: state.decidedAt.toISOString(),
  };
}
