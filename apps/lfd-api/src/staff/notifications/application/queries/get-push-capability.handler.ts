import type { PushCapability } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffPushSender } from "../../domain/ports/staff-push.js";
import { GetPushCapabilityQuery } from "./get-push-capability.query.js";

/**
 * La clé publique VAPID, ou `null` si l'envoi n'est pas configuré. Publique par
 * construction : elle voyage dans chaque abonnement et sert au service de push
 * à vérifier notre signature.
 */
@QueryHandler(GetPushCapabilityQuery)
export class GetPushCapabilityHandler implements IQueryHandler<
  GetPushCapabilityQuery,
  PushCapability
> {
  constructor(private readonly sender: StaffPushSender) {}

  execute(): Promise<PushCapability> {
    return Promise.resolve({ publicKey: this.sender.publicKey() });
  }
}
