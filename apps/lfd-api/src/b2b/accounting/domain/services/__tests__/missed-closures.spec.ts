import { BillingRhythm } from "../../value-objects/billing-rhythm.js";
import { BillingRhythmSetting } from "../../value-objects/billing-rhythm-setting.js";
import { missedClosures, missedClosuresMessage } from "../missed-closures.js";

const MONTHLY = BillingRhythmSetting.initial();
const WEEKLY = BillingRhythmSetting.of(BillingRhythm.weekly(1), null);

/**
 * Les 1ers juillet → octobre 2026 à 00h00 de Paris. Les instants ne sont
 * comparés qu'entre eux, jamais au mur.
 */
const JUL = new Date("2026-06-30T22:00:00.000Z");
const AUG = new Date("2026-07-31T22:00:00.000Z");
const SEP = new Date("2026-08-31T22:00:00.000Z");
const OCT = new Date("2026-09-30T22:00:00.000Z");
const FLOOR = new Date("2026-05-10T08:00:00.000Z");

function coverage(
  attemptedClosures: readonly Date[],
  lastLiveBatchClosesAt: Date | null = null,
  floorAt: Date | null = FLOOR,
) {
  return { floorAt, attemptedClosures, lastLiveBatchClosesAt };
}

describe("les clôtures manquées (R4b)", () => {
  it("aucune tentative jamais : rien n'est manqué, même loin du plancher", () => {
    expect(missedClosures(OCT, MONTHLY, coverage([]))).toEqual([]);
  });

  it("une clôture sans tentative entre la première et la courante est manquée", () => {
    expect(missedClosures(OCT, MONTHLY, coverage([JUL, SEP]))).toEqual([AUG]);
    expect(missedClosures(OCT, MONTHLY, coverage([JUL]))).toEqual([AUG, SEP]);
  });

  it("toutes tentées, quelle qu'en soit l'issue : rien", () => {
    expect(missedClosures(OCT, MONTHLY, coverage([JUL, AUG, SEP]))).toEqual([]);
  });

  it("un lot vivant couvre les clôtures jusqu'à la sienne", () => {
    expect(missedClosures(OCT, MONTHLY, coverage([JUL], SEP))).toEqual([]);
    expect(missedClosures(OCT, MONTHLY, coverage([JUL], AUG))).toEqual([SEP]);
  });

  it("avant le plancher, rien n'est manqué", () => {
    expect(missedClosures(OCT, MONTHLY, coverage([JUL], null, SEP))).toEqual([]);
  });

  it("au rythme de l'entité : les lundis sans tentative", () => {
    const monday5 = new Date("2026-10-04T22:00:00.000Z");
    const monday12 = new Date("2026-10-11T22:00:00.000Z");
    const monday19 = new Date("2026-10-18T22:00:00.000Z");

    expect(missedClosures(monday19, WEEKLY, coverage([monday5]))).toEqual([monday12]);
  });

  it("le message nomme chaque clôture et le geste de sortie", () => {
    expect(missedClosuresMessage([AUG])).toContain("la période close le 1er août 2026");
    const many = missedClosuresMessage([AUG, SEP]);
    expect(many).toContain("le 1er août 2026, le 1er septembre 2026");
    expect(many).toContain("« Préparer le lot »");
  });
});
