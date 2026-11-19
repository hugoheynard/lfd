import type { OrderTimeLimitPayload, OrderTimeLimitView } from "@lfd/pim-contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../journal/__tests__/recording-journal.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";

import { OrderTimeLimit } from "../../domain/entities/order-time-limit.js";
import {
  IncompleteOrderTimeLimitError,
  InvalidOrderTimeLimitScopeError,
  ProductGraceRetiredError,
  RetiredOrderTimeLimitScopeError,
} from "../../domain/errors/order-time-limit-errors.js";
import { LimitScopeNamer } from "../../domain/ports/limit-scope.namer.js";
import { OrderTimeLimitRepository } from "../../domain/ports/order-time-limit.repository.js";
import type { LimitScope } from "../../domain/value-objects/limit-scope.js";
import { SetOrderTimeLimitCommand, SetOrderTimeLimitHandler } from "../set-order-time-limit.js";
import { RecordingRulesEmitter } from "../../domain/ports/__tests__/recording-rules-emitter.js";

function payload(over: Partial<OrderTimeLimitPayload> = {}): OrderTimeLimitPayload {
  return {
    scope: { type: "product", id: "p1" },
    daysBefore: 1,
    time: "18:00",
    graceMinutes: null,
    staffMayExceed: false,
    ...over,
  };
}

interface Doubles {
  readonly handler: SetOrderTimeLimitHandler;
  readonly saved: OrderTimeLimit[];
  readonly minted: string[];
  readonly journal: RecordingJournal;
  /** À chaque émission des règles : combien de règles étaient déjà enregistrées. */
  readonly rules: RecordingRulesEmitter;
}

/**
 * Le port est doublé par un objet qui **implémente l'interface**, pas par un
 * `jest.mock` de module : c'est le contrat qu'on veut éprouver, et un module
 * moqué laisserait dériver le double du port qu'il prétend jouer.
 */
/** Les cibles que le référentiel nomme — un produit ici, le reste inconnu. */
class TableScopeNamer extends LimitScopeNamer {
  nameOf(scope: LimitScope): Promise<string | null> {
    return Promise.resolve(scope.id === "p2" ? "Bûche" : null);
  }
}

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
    saveArchival: () => Promise.resolve(),
    inForce: () => Promise.resolve([] as readonly OrderTimeLimitView[]),
    findById: () => Promise.resolve(existing),
  } satisfies OrderTimeLimitRepository;
  const ids = {
    next: () => {
      const id = `id_${minted.length + 1}`;
      minted.push(id);
      return id;
    },
  };
  const journal = new RecordingJournal();
  const rules = new RecordingRulesEmitter(() => saved.length);
  return {
    handler: new SetOrderTimeLimitHandler(
      limits,
      ids,
      journal,
      new DirectUnitOfWork(),
      new TableScopeNamer(),
      rules,
    ),
    saved,
    minted,
    journal,
    rules,
  };
}

describe("SetOrderTimeLimitHandler", () => {
  /** Lot 2b : l'échelle part vers la plateforme, relue APRÈS l'écriture. */
  it("émet les règles une fois, après avoir enregistré la règle", async () => {
    const { handler, rules } = doubles(null);

    await handler.execute(new SetOrderTimeLimitCommand(payload()));

    expect(rules.emissions).toEqual([1]);
  });

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
  /** Lot B du plan des phrases (2026-09-19) : la portée se fige en mots, nommée. */
  it("nomme la cible de la portée au journal, sous son nom du moment", async () => {
    const { handler, journal } = doubles(null);

    await handler.execute(
      new SetOrderTimeLimitCommand(payload({ scope: { type: "product", id: "p2" } })),
    );

    expect(journal.entries[0]?.payload).toMatchObject({ subjectLabel: "Produit « Bûche »" });
  });

  it("journalise la portée et les trois valeurs", async () => {
    const { handler, journal } = doubles(null);

    await handler.execute(new SetOrderTimeLimitCommand(payload({ graceMinutes: null })));

    expect(journal.types()).toEqual(["order_time_limit.set"]);
    expect(journal.entries[0]?.payload).toEqual({
      subjectLabel: "Produit p1",
      scope: "product:p1",
      daysBefore: 1,
      time: "18:00",
      graceMinutes: null,
      staffMayExceed: false,
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
    ).rejects.toBeInstanceOf(IncompleteOrderTimeLimitError);
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

  /** Régression : reposer la même règle réécrivait la ligne, un fait au journal et l'échelle. */
  it("rejouée à l'identique, n'écrit rien, ne trace rien et n'émet rien", async () => {
    const existing = OrderTimeLimit.set("deja_la", payload({ time: "18:00" }));
    const { handler, saved, journal, rules } = doubles(existing);

    const id = await handler.execute(new SetOrderTimeLimitCommand(payload({ time: "18:00" })));

    expect(id).toBe("deja_la");
    expect(saved).toEqual([]);
    expect(journal.entries).toEqual([]);
    expect(rules.emissions).toEqual([]);
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
    ).rejects.toBeInstanceOf(IncompleteOrderTimeLimitError);
    expect(saved).toHaveLength(0);
  });

  it("refuse aussi de VIDER une règle existante", async () => {
    const existing = OrderTimeLimit.set("deja_la", payload());
    const { handler, saved } = doubles(existing);

    await expect(
      handler.execute(
        new SetOrderTimeLimitCommand(payload({ daysBefore: null, time: null, graceMinutes: null })),
      ),
    ).rejects.toBeInstanceOf(IncompleteOrderTimeLimitError);
    expect(saved).toHaveLength(0);
    // L'agrégat n'a pas bougé non plus : le refus vient de LUI, pas du handler.
    expect(existing.time).toBe("18:00");
  });

  /**
   * Décision de Hugo du 2026-10-21 : « toute la production » se règle au
   * commerce, une famille n'a plus de limite, une déclinaison suit son produit.
   */
  it.each([
    ["global", null],
    ["category", "cat_1"],
    ["variant", "v1"],
  ] as const)("refuse une limite de portée %s, sans trace ni émission", async (type, id) => {
    const { handler, saved, journal, rules } = doubles(null);

    const refusal = handler.execute(new SetOrderTimeLimitCommand(payload({ scope: { type, id } })));

    await expect(refusal).rejects.toBeInstanceOf(RetiredOrderTimeLimitScopeError);
    await expect(refusal).rejects.toThrow(/Réglages › Commandes › Heure limite/u);
    expect(saved).toHaveLength(0);
    expect(journal.entries).toHaveLength(0);
    expect(rules.emissions).toEqual([]);
  });

  /** Une ligne globale résiduelle ne se modifie pas non plus : elle se retire. */
  it("refuse de modifier une règle globale résiduelle", async () => {
    const residual = OrderTimeLimit.reconstitute(
      "vieux",
      payload({ scope: { type: "global", id: null } }),
      null,
    );
    const { handler, saved } = doubles(residual);

    await expect(
      handler.execute(
        new SetOrderTimeLimitCommand(payload({ scope: { type: "global", id: null } })),
      ),
    ).rejects.toBeInstanceOf(RetiredOrderTimeLimitScopeError);
    expect(saved).toHaveLength(0);
  });

  it("refuse une limite de produit sans heure", async () => {
    const { handler } = doubles(null);

    await expect(
      handler.execute(new SetOrderTimeLimitCommand(payload({ time: null }))),
    ).rejects.toBeInstanceOf(IncompleteOrderTimeLimitError);
  });

  /** Point 2 (2026-10-21) : le seul rattrapage est celui de la règle générale. */
  it("refuse un rattrapage sur une limite de produit", async () => {
    const { handler, saved } = doubles(null);

    await expect(
      handler.execute(new SetOrderTimeLimitCommand(payload({ graceMinutes: 60 }))),
    ).rejects.toBeInstanceOf(ProductGraceRetiredError);
    expect(saved).toHaveLength(0);
  });

  /** Une seule ligne par portée : poser une limite là où elle est archivée la remet en vigueur. */
  it("remet en vigueur la limite archivée de la portée qu'on repose, sans en créer une autre", async () => {
    const archived = OrderTimeLimit.reconstitute("id_old", payload(), new Date());
    const { handler, saved, minted, journal } = doubles(archived);

    const id = await handler.execute(new SetOrderTimeLimitCommand(payload()));

    expect(id).toBe("id_old");
    expect(minted).toEqual([]);
    expect(saved[0]?.isArchived).toBe(false);
    expect(journal.types()).toEqual(["order_time_limit.set"]);
  });

  it("remet à zéro le rattrapage résiduel d'un produit qu'on repose", async () => {
    const residual = OrderTimeLimit.reconstitute("vieux", payload({ graceMinutes: 60 }), null);
    const { handler, saved } = doubles(residual);

    await handler.execute(new SetOrderTimeLimitCommand(payload({ graceMinutes: 0 })));

    expect(saved[0]?.graceMinutes).toBeNull();
  });
});
