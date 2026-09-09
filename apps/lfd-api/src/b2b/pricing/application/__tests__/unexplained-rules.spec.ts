import type { PriceRuleView } from "@lfd/contracts";

import type { JournalEntry } from "../../domain/ports/pricing-journal.reader.js";
import { suspendedAt } from "../suspension-window.js";
import { unexplainedRules } from "../unexplained-rules.js";

/**
 * **L'autre moitié de « pourquoi ce prix »** : ce qui n'a jamais atteint le
 * moteur, donc ce que la trace figée ne pouvait pas garder (R25, lot 4).
 *
 * Les dates sont absolues et ne se comparent **qu'entre elles** — rien ici ne
 * regarde l'horloge, donc rien n'y vieillit (exception écrite au §5 de
 * `CLAUDE.md`).
 */
const COMMANDE = new Date("2026-03-10T09:00:00.000Z");
const AVANT = new Date("2026-03-01T09:00:00.000Z");
const APRES = new Date("2026-03-20T09:00:00.000Z");

function rule(over: Partial<PriceRuleView> = {}): PriceRuleView {
  return {
    id: "promo",
    stage: "promotion",
    scope: { type: "global", id: null },
    audience: { type: "all", id: null },
    minQuantity: null,
    effect: { nature: "alter", direction: "decrease", mode: "percent", value: 1_000 },
    label: "Promo de rentrée",
    stacksOverMercuriale: false,
    validFrom: AVANT.toISOString(),
    validTo: null,
    createdBy: "auth0|staff",
    createdAt: AVANT.toISOString(),
    status: "active",
    pausedAt: null,
    pausedBy: null,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    ...over,
  };
}

function act(kind: JournalEntry["kind"], at: Date): JournalEntry {
  return {
    id: `act_${kind}_${String(at.getTime())}`,
    subjectType: "rule",
    subjectId: "promo",
    kind,
    actor: "auth0|staff",
    at,
    reason: null,
    summary: "",
  };
}

describe("suspendedAt — l'intervalle que la reprise efface", () => {
  /**
   * 🔴 Le cas qui justifie tout ce fichier. `resume()` remet `pausedAt` à
   * `null` : la règle d'aujourd'hui dirait « en vigueur le 10 ». Sur l'écran du
   * litige, ce ne serait pas une réponse manquante mais une réponse FAUSSE.
   */
  it("voit une suspension que la règle d'aujourd'hui ne sait plus dire", () => {
    const journal = [act("resumed", APRES), act("paused", AVANT), act("posed", AVANT)];

    expect(suspendedAt(journal, COMMANDE)).toBe(true);
  });

  it("ne voit rien quand la reprise précède la commande", () => {
    const journal = [act("resumed", AVANT), act("paused", AVANT), act("posed", AVANT)];

    expect(suspendedAt(journal, COMMANDE)).toBe(false);
  });

  it("ignore une suspension POSTÉRIEURE à la commande", () => {
    // Une promotion suspendue le 20 s'appliquait le 10. C'est exactement ce que
    // `isSuspended` sait déjà faire, et qu'on ne doit pas défaire ici.
    expect(suspendedAt([act("paused", APRES), act("posed", AVANT)], COMMANDE)).toBe(false);
  });

  it("ne déduit rien d'un journal sans pause", () => {
    expect(suspendedAt([act("posed", AVANT)], COMMANDE)).toBe(false);
  });
});

describe("unexplainedRules", () => {
  it("écarte ce que la trace explique déjà", () => {
    // Une règle qui a agi, ou que le moteur a regardée puis écartée, est déjà
    // sur l'écran. La répéter ici la montrerait deux fois, avec deux
    // vocabulaires.
    const found = unexplainedRules([rule()], new Set(["promo"]), "cmp_1", new Set());

    expect(found).toEqual([]);
  });

  it("nomme la suspension avant l'audience — un fait daté prime une déduction", () => {
    const found = unexplainedRules(
      [rule({ audience: { type: "company", id: "cmp_autre" } })],
      new Set(),
      "cmp_1",
      new Set(["promo"]),
    );

    expect(found[0]?.cause).toBe("suspended");
  });

  it("dit qu'une règle visait un AUTRE client", () => {
    const found = unexplainedRules(
      [rule({ audience: { type: "company", id: "cmp_autre" } })],
      new Set(),
      "cmp_1",
      new Set(),
    );

    expect(found[0]).toMatchObject({ ruleId: "promo", cause: "out_of_audience" });
  });

  /**
   * `null` n'est pas « aucune raison » : c'est « on ne sait pas ». Une règle de
   * segment ne se juge pas — le segment du client n'est pas figé sur la
   * commande, et le lire aujourd'hui reconstruirait une appartenance qui a pu
   * changer.
   */
  it("s'abstient sur une règle de segment", () => {
    const found = unexplainedRules(
      [rule({ audience: { type: "segment", id: "seg_boulangerie" } })],
      new Set(),
      "cmp_1",
      new Set(),
    );

    expect(found[0]?.cause).toBeNull();
  });

  /**
   * Le cas qui mérite qu'on ouvre le dossier : elle visait tout le monde, elle
   * était en vigueur, et elle n'a rien produit. L'écran ne doit pas inventer une
   * raison — il doit montrer qu'il n'en a pas.
   */
  it("s'abstient aussi quand une règle ouverte à tous aurait dû agir", () => {
    const found = unexplainedRules([rule()], new Set(), "cmp_1", new Set());

    expect(found[0]?.cause).toBeNull();
  });
});
