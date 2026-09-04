import type { OrderTimeLimitPayload, OrderTimeLimitView } from "@lfd/pim-contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import type { WriteTicket } from "../../../journal/pim-journal.js";

import { OrderTimeLimit } from "../../domain/entities/order-time-limit.js";
import {
  EmptyOrderTimeLimitError,
  GlobalOrderTimeLimitStillNeededError,
  InvalidOrderTimeLimitScopeError,
  OrderTimeLimitNotFoundError,
} from "../../domain/errors/order-time-limit-errors.js";
import { OrderTimeLimitRepository } from "../../domain/ports/order-time-limit.repository.js";
import type { LimitScope } from "../../domain/value-objects/limit-scope.js";
import {
  RemoveOrderTimeLimitCommand,
  RemoveOrderTimeLimitHandler,
} from "../remove-order-time-limit.js";
import { SetOrderTimeLimitCommand, SetOrderTimeLimitHandler } from "../set-order-time-limit.js";

function payload(over: Partial<OrderTimeLimitPayload> = {}): OrderTimeLimitPayload {
  return {
    scope: { type: "global", id: null },
    daysBefore: 1,
    time: "18:00",
    graceMinutes: null,
    ...over,
  };
}

interface Doubles {
  readonly handler: SetOrderTimeLimitHandler;
  readonly saved: OrderTimeLimit[];
  readonly minted: string[];
  readonly journal: RecordingJournal;
}

/**
 * Le port est doublé par un objet qui **implémente l'interface**, pas par un
 * `jest.mock` de module : c'est le contrat qu'on veut éprouver, et un module
 * moqué laisserait dériver le double du port qu'il prétend jouer.
 */
function doubles(existing: OrderTimeLimit | null): Doubles {
  const saved: OrderTimeLimit[] = [];
  const minted: string[] = [];
  const limits = {
    list: () => Promise.resolve([] as readonly OrderTimeLimitView[]),
    findByScope: (_scope: LimitScope) => Promise.resolve(existing),
    save: (limit: OrderTimeLimit, _ticket: WriteTicket) => {
      saved.push(limit);
      return Promise.resolve();
    },
    remove: () => Promise.resolve(),
  } satisfies OrderTimeLimitRepository;
  const ids = {
    next: () => {
      const id = `id_${minted.length + 1}`;
      minted.push(id);
      return id;
    },
  };
  const journal = new RecordingJournal();
  return {
    handler: new SetOrderTimeLimitHandler(limits, ids, journal, new DirectUnitOfWork()),
    saved,
    minted,
    journal,
  };
}

describe("SetOrderTimeLimitHandler", () => {
  it("crée la règle quand la portée est libre, avec un identifiant frappé par la commande", async () => {
    const { handler, saved, minted } = doubles(null);

    const id = await handler.execute(new SetOrderTimeLimitCommand(payload()));

    expect(id).toBe("id_1");
    expect(minted).toEqual(["id_1"]);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.time).toBe("18:00");
  });

  /**
   * La trace porte la portée ET les trois valeurs, `null` compris : « qui a
   * changé ça » ne se répond qu'en sachant ce que ça valait, et « ce rang ne se
   * prononce pas » est une décision, pas un vide.
   */
  it("journalise la portée et les trois valeurs", async () => {
    const { handler, journal } = doubles(null);

    await handler.execute(new SetOrderTimeLimitCommand(payload({ graceMinutes: null })));

    expect(journal.types()).toEqual(["order_time_limit.set"]);
    expect(journal.entries[0]?.payload).toEqual({
      scope: "global:",
      daysBefore: 1,
      time: "18:00",
      graceMinutes: null,
    });
  });

  /**
   * Journaliser un fait qu'on rejette ensuite laisserait dans le journal une
   * décision qui n'a jamais eu lieu — pire qu'une absence de trace. D'où
   * l'ordre : l'agrégat refuse AVANT que la trace parte.
   */
  it("ne laisse aucune trace quand la règle est refusée", async () => {
    const { handler, journal } = doubles(null);

    await expect(
      handler.execute(
        new SetOrderTimeLimitCommand(payload({ daysBefore: null, time: null, graceMinutes: null })),
      ),
    ).rejects.toBeInstanceOf(EmptyOrderTimeLimitError);
    expect(journal.entries).toHaveLength(0);
  });

  /**
   * **Remplacer garde l'identifiant.** Sans ça, un simple changement d'heure
   * ferait disparaître la ligne et en créerait une autre sous les yeux de qui la
   * regardait — et toute trace accrochée à l'ancien identifiant deviendrait
   * orpheline.
   */
  it("remplace sans frapper d'identifiant quand la portée est déjà servie", async () => {
    const existing = OrderTimeLimit.set("deja_la", payload({ time: "18:00" }));
    const { handler, saved, minted } = doubles(existing);

    const id = await handler.execute(new SetOrderTimeLimitCommand(payload({ time: "16:00" })));

    expect(id).toBe("deja_la");
    expect(minted).toEqual([]);
    expect(saved[0]?.time).toBe("16:00");
  });

  /**
   * Une portée qui se contredit est refusée **avant** toute lecture : interroger
   * la base avec une question qui n'en est pas une n'aurait produit qu'un
   * `null` trompeur, suivi d'une création.
   */
  it("refuse une portée incohérente sans rien lire ni écrire", async () => {
    const { handler, saved } = doubles(null);

    await expect(
      handler.execute(
        new SetOrderTimeLimitCommand(payload({ scope: { type: "global", id: "patisserie" } })),
      ),
    ).rejects.toBeInstanceOf(InvalidOrderTimeLimitScopeError);
    expect(saved).toHaveLength(0);
  });

  /**
   * Une ligne muette se lirait, à l'écran, comme « une règle existe ici » alors
   * qu'elle laisserait tout hériter. Pour ne rien dire, on supprime — c'est le
   * même geste, et il est lisible.
   */
  it("refuse une règle dont les trois réglages sont absents", async () => {
    const { handler, saved } = doubles(null);

    await expect(
      handler.execute(
        new SetOrderTimeLimitCommand(payload({ daysBefore: null, time: null, graceMinutes: null })),
      ),
    ).rejects.toBeInstanceOf(EmptyOrderTimeLimitError);
    expect(saved).toHaveLength(0);
  });

  it("refuse aussi de VIDER une règle existante", async () => {
    const existing = OrderTimeLimit.set("deja_la", payload());
    const { handler, saved } = doubles(existing);

    await expect(
      handler.execute(
        new SetOrderTimeLimitCommand(payload({ daysBefore: null, time: null, graceMinutes: null })),
      ),
    ).rejects.toBeInstanceOf(EmptyOrderTimeLimitError);
    expect(saved).toHaveLength(0);
    // L'agrégat n'a pas bougé non plus : le refus vient de LUI, pas du handler.
    expect(existing.time).toBe("18:00");
  });
});

describe("RemoveOrderTimeLimitHandler", () => {
  function view(over: Partial<OrderTimeLimitView> = {}): OrderTimeLimitView {
    return {
      id: "id_global",
      scope: { type: "global", id: null },
      scopeLabel: null,
      daysBefore: 1,
      time: "18:00",
      graceMinutes: null,
      ...over,
    };
  }

  interface RemoveDoubles {
    readonly handler: RemoveOrderTimeLimitHandler;
    readonly removed: string[];
    readonly journal: RecordingJournal;
  }

  function removeDoubles(rules: readonly OrderTimeLimitView[]): RemoveDoubles {
    const removed: string[] = [];
    const limits = {
      list: () => Promise.resolve(rules),
      findByScope: () => Promise.resolve(null),
      save: () => Promise.resolve(),
      remove: (id: string, _ticket: WriteTicket) => {
        removed.push(id);
        return Promise.resolve();
      },
    } satisfies OrderTimeLimitRepository;
    const journal = new RecordingJournal();
    return {
      handler: new RemoveOrderTimeLimitHandler(limits, journal, new DirectUnitOfWork()),
      removed,
      journal,
    };
  }

  it("délègue la suppression au port", async () => {
    const { handler, removed, journal } = removeDoubles([view({ id: "id_1" })]);

    await handler.execute(new RemoveOrderTimeLimitCommand("id_1"));

    expect(removed).toEqual(["id_1"]);
    expect(journal.types()).toEqual(["order_time_limit.removed"]);
  });

  /**
   * Régression : le fait ne portait qu'un `payload: {}`, alors que son JSDoc
   * promettait d'y verser les trois valeurs. Après la suppression, le journal
   * est le SEUL endroit où la règle a existé — un fait vide n'atteste que d'une
   * suppression sans objet.
   */
  it("verse dans le journal ce que la règle disait avant de la retirer", async () => {
    const { handler, journal } = removeDoubles([
      view({
        id: "id_1",
        scope: { type: "category", id: "cat_1" },
        time: "16:00",
        graceMinutes: 30,
      }),
    ]);

    await handler.execute(new RemoveOrderTimeLimitCommand("id_1"));

    expect(journal.entries[0]?.payload).toEqual({
      scope: "category:cat_1",
      daysBefore: 1,
      time: "16:00",
      graceMinutes: 30,
    });
  });

  /**
   * 🔴 Le verrou. L'héritage est champ par champ : une famille qui ne pose que
   * l'heure emprunte son délai au global, et la résolution rend `null` dès qu'un
   * des deux manque. Retirer le global la rendrait MUETTE — pas plus permissive
   * — pendant que l'écran continuerait de l'afficher.
   */
  it("refuse de retirer le rang global quand une règle inférieure en dépend", async () => {
    const { handler, removed, journal } = removeDoubles([
      view(),
      view({
        id: "id_cat",
        scope: { type: "category", id: "cat_1" },
        scopeLabel: "Viennoiserie",
        daysBefore: null,
        time: "16:00",
      }),
    ]);

    await expect(handler.execute(new RemoveOrderTimeLimitCommand("id_global"))).rejects.toThrow(
      GlobalOrderTimeLimitStillNeededError,
    );
    // Ni écriture, ni trace : un fait journalisé pour une décision refusée
    // laisserait dans le journal quelque chose qui n'a jamais eu lieu.
    expect(removed).toEqual([]);
    expect(journal.types()).toEqual([]);
  });

  /** Le refus NOMME la règle en cause : il est lu par du personnel sans le code sous les yeux. */
  it("nomme les règles qui deviendraient muettes", async () => {
    const { handler } = removeDoubles([
      view(),
      view({
        id: "id_cat",
        scope: { type: "category", id: "cat_1" },
        scopeLabel: "Viennoiserie",
        time: null,
      }),
    ]);

    await expect(handler.execute(new RemoveOrderTimeLimitCommand("id_global"))).rejects.toThrow(
      /Viennoiserie/u,
    );
  });

  it("laisse retirer le global quand chaque autre règle se suffit à elle-même", async () => {
    // Délai ET heure : celle-là ne doit rien au rang du dessus.
    const { handler, removed } = removeDoubles([
      view(),
      view({
        id: "id_cat",
        scope: { type: "category", id: "cat_1" },
        scopeLabel: "Pain",
        daysBefore: 2,
        time: "14:00",
      }),
    ]);

    await handler.execute(new RemoveOrderTimeLimitCommand("id_global"));

    expect(removed).toEqual(["id_global"]);
  });

  it("laisse retirer un rang global seul de son espèce", async () => {
    // Il n'y a rien à rendre muet, et « je n'oppose plus de limite » reste un
    // état légitime — c'est le défaut écrit dans la garde.
    const { handler, removed } = removeDoubles([view()]);

    await handler.execute(new RemoveOrderTimeLimitCommand("id_global"));

    expect(removed).toEqual(["id_global"]);
  });

  it("refuse un identifiant que personne ne porte", async () => {
    const { handler, journal } = removeDoubles([view()]);

    await expect(handler.execute(new RemoveOrderTimeLimitCommand("id_absent"))).rejects.toThrow(
      OrderTimeLimitNotFoundError,
    );
    expect(journal.types()).toEqual([]);
  });
});
