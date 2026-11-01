import { Inject, Injectable } from "@nestjs/common";

import {
  POST_DEPLOY_OPERATIONS,
  type PostDeployOperation,
} from "../../../platform/post-deploy/post-deploy-operation.js";
import { UnknownPostDeployOperationError } from "../domain/post-deploy-errors.js";

/**
 * **Les opérations de cette image**, dans l'ordre que la racine leur donne —
 * qui est l'ordre d'affichage et l'ordre de dépendance (§ 7.1).
 */
@Injectable()
export class PostDeployCatalogue {
  constructor(
    @Inject(POST_DEPLOY_OPERATIONS) private readonly operations: readonly PostDeployOperation[],
  ) {}

  all(): readonly PostDeployOperation[] {
    return this.operations;
  }

  /** @throws {UnknownPostDeployOperationError} aucune opération sous cette clé. */
  find(key: string): PostDeployOperation {
    const operation = this.operations.find((candidate) => candidate.key === key);
    if (operation === undefined) {
      throw new UnknownPostDeployOperationError(key);
    }
    return operation;
  }
}
