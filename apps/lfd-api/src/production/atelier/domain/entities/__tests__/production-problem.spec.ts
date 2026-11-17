import { PROBLEM_REASON_MAX, ProductionProblem } from "../production-problem.js";
import {
  InvalidProblemOutputError,
  InvalidProblemReasonError,
} from "../../errors/problem-errors.js";

/** Le problème d'une ligne (plan `fournil/plan-niveaux-de-suivi.md`, § 3.2). Instants recopiés. */
const AT = new Date("2026-11-17T09:00:00.000Z");
const LATER = new Date("2026-11-17T10:00:00.000Z");
const IDENTITY = { id: "pb_1", serviceDay: "2026-11-18", sku: "CRO" };
const MARK = { at: AT, staffId: "staff-1", name: "Marie Dupont" };

function reported(produced = 80, reason: string | null = null): ProductionProblem {
  return ProductionProblem.report(IDENTITY, { expected: 120, produced, reason, reported: MARK });
}

describe("ProductionProblem", () => {
  it("le premier rouge est ouvert, en version 1, la raison rognée", () => {
    expect(reported(80, "  four en panne ").state).toEqual({
      ...IDENTITY,
      expected: 120,
      produced: 80,
      reason: "four en panne",
      reported: MARK,
      resolved: null,
      version: 1,
    });
  });

  it("une raison vide n'est pas une raison", () => {
    expect(reported(80, "   ").state.reason).toBeNull();
  });

  it("refuse un sorti négatif ou fractionnaire", () => {
    expect(() => reported(-1)).toThrow(InvalidProblemOutputError);
    expect(() => reported(1.5)).toThrow(InvalidProblemOutputError);
  });

  it("refuse une raison trop longue", () => {
    expect(() => reported(80, "x".repeat(PROBLEM_REASON_MAX + 1))).toThrow(
      InvalidProblemReasonError,
    );
  });

  it("un second rouge le remplace, monte la version et le rouvre", () => {
    const problem = reported(80);
    problem.resolve({ at: AT, staffId: "chef", name: null });

    problem.reportAgain({
      expected: 120,
      produced: 100,
      reason: null,
      reported: { ...MARK, at: LATER },
    });

    expect(problem.state).toMatchObject({ produced: 100, version: 2, resolved: null });
    expect(problem.state.reported.at).toBe(LATER);
  });

  it("traité une fois ; la seconde fois ne change rien et le dit", () => {
    const problem = reported(80);
    const chef = { at: LATER, staffId: "chef", name: "Le chef" };

    expect(problem.resolve(chef)).toBe(true);
    expect(problem.resolve({ ...chef, staffId: "autre" })).toBe(false);
    expect(problem.state.resolved).toEqual(chef);
    expect(problem.state.produced).toBe(80);
  });
});
