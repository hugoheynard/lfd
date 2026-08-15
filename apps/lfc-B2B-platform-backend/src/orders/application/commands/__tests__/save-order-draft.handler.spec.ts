import {
  orderDraftPayloadSchema,
  type OrderDraftPayload,
  type OrderDraftView,
} from "@lfd/contracts";

import { OrderCompanyNotFoundError } from "../../../domain/errors/order-errors.js";
import { OrderDraftRepository } from "../../../domain/ports/order-draft.repository.js";
import {
  OrderGuardReader,
  type OrderCompanyStatus,
  type OrderRole,
} from "../../../domain/ports/order-guard.reader.js";
import { SaveOrderDraftCommand } from "../save-order-draft.command.js";
import { SaveOrderDraftHandler } from "../save-order-draft.handler.js";

/** Un brouillon **vide** : aucune ligne, aucun acheteur — l'état le plus courant. */
const EMPTY: OrderDraftPayload = orderDraftPayloadSchema.parse({});

function guard(status: OrderCompanyStatus | null): OrderGuardReader {
  return {
    roleOf: (): Promise<OrderRole | null> => Promise.resolve(null),
    companyStatusOf: (): Promise<OrderCompanyStatus | null> => Promise.resolve(status),
    settlesOnAccount: (): Promise<boolean> => Promise.resolve(false),
  };
}

function repository(): OrderDraftRepository & { saved: OrderDraftView | null } {
  const store = {
    saved: null as OrderDraftView | null,
    find: (): Promise<OrderDraftView | null> => Promise.resolve(store.saved),
    save: (
      companyId: string,
      payload: OrderDraftPayload,
      savedByStaffId: string | null,
    ): Promise<OrderDraftView> => {
      store.saved = { ...payload, companyId, savedAt: "2026-08-15T09:00:00.000Z", savedByStaffId };
      return Promise.resolve(store.saved);
    },
    discard: (): Promise<void> => Promise.resolve(),
  };
  return store;
}

describe("SaveOrderDraftHandler", () => {
  it("garde un brouillon vide, sans ligne ni acheteur", async () => {
    // Un brouillon n'est pas une commande incomplète : exiger une ligne
    // reviendrait à interdire d'interrompre un appel au milieu, ce que cette
    // fonctionnalité existe précisément pour permettre.
    const drafts = repository();
    const handler = new SaveOrderDraftHandler(drafts, guard("active"));

    const view = await handler.execute(new SaveOrderDraftCommand("cmp_1", "staff_1", EMPTY));

    expect(view.lines).toEqual([]);
    expect(view.buyerUserId).toBeNull();
    expect(view.savedByStaffId).toBe("staff_1");
  });

  it("garde le brouillon d'un compte en attente", async () => {
    // Le statut ne conditionne PAS la mise de côté : un dossier qu'on est en
    // train d'ouvrir est exactement celui pour lequel on prépare une commande.
    const drafts = repository();
    const handler = new SaveOrderDraftHandler(drafts, guard("pending"));

    await handler.execute(new SaveOrderDraftCommand("cmp_1", "staff_1", EMPTY));

    expect(drafts.saved).not.toBeNull();
  });

  it("refuse une société inconnue", async () => {
    const handler = new SaveOrderDraftHandler(repository(), guard(null));

    await expect(
      handler.execute(new SaveOrderDraftCommand("cmp_absent", "staff_1", EMPTY)),
    ).rejects.toBeInstanceOf(OrderCompanyNotFoundError);
  });
});
