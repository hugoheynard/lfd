import type { CustomerAudience } from "@lfd/contracts";

import type { CustomerRequest, RequestAuthor } from "../../../domain/customer-request.js";
import { ContactSenderAudience } from "../../../domain/ports/contact-sender-audience.js";
import { CustomerRequestRepository } from "../../../domain/ports/customer-request.repository.js";
import { CustomerRequestRetention } from "../../../domain/ports/customer-request.retention.js";
import {
  type ReportableOrder,
  ReportableOrderReader,
} from "../../../domain/ports/reportable-order.reader.js";
import { RequestAuthorDirectory } from "../../../domain/ports/request-author.directory.js";
import {
  type RequestPhotoObject,
  RequestPhotoStore,
} from "../../../domain/ports/request-photo.store.js";
import { RequestReasonRepository } from "../../../domain/ports/request-reason.repository.js";
import type { RequestReason } from "../../../domain/request-reason.js";
import {
  StaffDirectory,
  type StaffIdentity,
} from "../../../../account/domain/ports/staff-directory.js";

/** Les motifs en mémoire, tels que le port d'écriture les rend. */
export class MemoryReasons extends RequestReasonRepository {
  readonly saved: RequestReason[] = [];
  private readonly byId = new Map<string, RequestReason>();

  constructor(...reasons: RequestReason[]) {
    super();
    for (const reason of reasons) {
      this.byId.set(reason.id, reason);
    }
  }

  load(id: string): Promise<RequestReason | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  save(reason: RequestReason): Promise<void> {
    this.byId.set(reason.id, reason);
    this.saved.push(reason);
    return Promise.resolve();
  }
}

/** Les demandes en mémoire ; `log` reçoit « save » à chaque enregistrement. */
export class MemoryRequests extends CustomerRequestRepository {
  readonly saved: CustomerRequest[] = [];
  private readonly byId = new Map<string, CustomerRequest>();

  constructor(
    requests: readonly CustomerRequest[] = [],
    private readonly log: string[] = [],
  ) {
    super();
    for (const request of requests) {
      this.byId.set(request.id, request);
    }
  }

  load(id: string): Promise<CustomerRequest | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  save(request: CustomerRequest): Promise<void> {
    this.byId.set(request.id, request);
    this.saved.push(request);
    this.log.push(`save ${request.id}`);
    return Promise.resolve();
  }
}

/** Le stockage des photos, en mémoire ; `log` reçoit chaque geste dans l'ordre. */
export class MemoryPhotoStore extends RequestPhotoStore {
  readonly objects = new Map<string, RequestPhotoObject>();

  constructor(private readonly log: string[] = []) {
    super();
  }

  save(key: string, photo: RequestPhotoObject): Promise<void> {
    this.objects.set(key, photo);
    this.log.push(`store ${key}`);
    return Promise.resolve();
  }

  read(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    return found === undefined ? Promise.reject(new Error(key)) : Promise.resolve(found.bytes);
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    this.log.push(`delete ${key}`);
    return Promise.resolve();
  }
}

/** Les commandes que ce client peut voir, et elles seules. */
export class VisibleOrders extends ReportableOrderReader {
  constructor(private readonly visible: Readonly<Record<string, ReportableOrder>>) {
    super();
  }

  visibleTo(orderId: string): Promise<ReportableOrder | null> {
    return Promise.resolve(this.visible[orderId] ?? null);
  }
}

/** Les comptes connus. */
export class Authors extends RequestAuthorDirectory {
  constructor(private readonly known: Readonly<Record<string, RequestAuthor>>) {
    super();
  }

  of(userId: string): Promise<RequestAuthor | null> {
    return Promise.resolve(this.known[userId] ?? null);
  }
}

/** Le public déduit : `b2b` pour la société `c_active`, `b2c` sinon. */
export class FixedAudiences extends ContactSenderAudience {
  readonly asked: (string | null)[] = [];

  of(companyId: string | null): Promise<CustomerAudience> {
    this.asked.push(companyId);
    return Promise.resolve(companyId === "c_active" ? "b2b" : "b2c");
  }
}

/** Une conservation qui rend des lots d'ids donnés, et note ce qu'on lui demande. */
export class ScriptedRetention extends CustomerRequestRetention {
  readonly calls: { readonly before: Date; readonly limit: number }[] = [];

  constructor(private readonly batches: (readonly string[])[]) {
    super();
  }

  dueBefore(before: Date, limit: number): Promise<readonly string[]> {
    this.calls.push({ before, limit });
    return Promise.resolve(this.batches.shift() ?? []);
  }
}

/** L'annuaire qui connaît (ou pas) l'auteur d'un geste. */
export class Directory extends StaffDirectory {
  constructor(private readonly identity: StaffIdentity | null) {
    super();
  }

  identify(): Promise<StaffIdentity | null> {
    return Promise.resolve(this.identity);
  }
}
