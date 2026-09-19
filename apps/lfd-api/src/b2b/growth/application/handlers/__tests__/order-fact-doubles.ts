import type { ActivityActorType } from "../../../domain/activity-event.js";
import { ActorNamer, type ActorIdentity } from "../../../domain/ports/actor-namer.js";
import { CustomerNamer } from "../../../domain/ports/customer-namer.js";

/**
 * Les annuaires que lisent les abonnés `order.*`, doublés à la main : une
 * table de noms, et tout le reste inconnu. `renamed` change un nom APRÈS coup,
 * pour montrer que le fait déjà écrit ne bouge pas.
 */
export class TableCustomers extends CustomerNamer {
  constructor(private readonly names: Map<string, string>) {
    super();
  }

  nameOf(userId: string): Promise<string | null> {
    return Promise.resolve(this.names.get(userId) ?? null);
  }

  renamed(userId: string, name: string): void {
    this.names.set(userId, name);
  }
}

/** Un annuaire client en panne : la lecture lève. */
export class BrokenCustomers extends CustomerNamer {
  nameOf(): Promise<string | null> {
    return Promise.reject(new Error("annuaire client indisponible"));
  }
}

/** L'annuaire staff : un nom par id de fiche, `null` pour les autres. */
export class TableActors extends ActorNamer {
  constructor(private readonly names: Map<string, string>) {
    super();
  }

  describe(type: ActivityActorType, id: string | null): Promise<ActorIdentity> {
    const name = type === "staff" && id !== null ? (this.names.get(id) ?? null) : null;
    return Promise.resolve({ name, role: name === null ? null : "Atelier" });
  }
}
