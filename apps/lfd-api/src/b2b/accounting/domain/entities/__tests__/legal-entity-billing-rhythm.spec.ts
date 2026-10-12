import {
  BillingRhythmChangePendingError,
  InvalidBillingRhythmError,
} from "../../errors/billing-rhythm-errors.js";
import { BillingRhythm } from "../../value-objects/billing-rhythm.js";
import { LegalAddress } from "../../value-objects/legal-address.js";
import { Siren } from "../../value-objects/siren.js";
import { LegalEntity } from "../legal-entity.js";

// Les dates sont le SUJET : elles ne sont comparées qu'entre elles (la prise
// d'effet se calcule depuis l'instant du réglage), jamais à l'horloge.
/** Un lundi de l'heure d'été, en milieu de mois. */
const AT = new Date("2026-10-12T10:00:00.000Z");
/** La prochaine clôture du mensuel au 1er : 1er novembre 00h00 Paris (heure d'hiver). */
const NEXT_FIRST = new Date("2026-10-31T23:00:00.000Z");
/** Après la prise d'effet : un mercredi. */
const LATER = new Date("2026-11-04T10:00:00.000Z");
/** Le lundi qui suit `LATER`, 00h00 Paris. */
const MONDAY_AFTER_LATER = new Date("2026-11-08T23:00:00.000Z");

const MONTHLY_FIRST = BillingRhythm.monthly(1);
const WEEKLY_MONDAY = BillingRhythm.weekly(1);
const SEMIMONTHLY = BillingRhythm.semimonthly(1, 16);

function declared(): LegalEntity {
  return LegalEntity.declare({
    id: "01JBXY000000000000000000LE",
    name: "La Folie Coffee",
    legalForm: "SAS",
    siren: Siren.create("552100554"),
    address: LegalAddress.create({
      line1: "12 rue des Lilas",
      line2: "",
      postalCode: "75011",
      city: "Paris",
      countryCode: "FR",
    }),
    rcs: "Paris B 552 100 554",
    shareCapitalCents: 1_000_000,
    vatNumber: "FR40552100554",
  });
}

describe("LegalEntity — le rythme de facturation", () => {
  it("naît mensuelle au 1er, sans rien de programmé", () => {
    const entity = declared();
    expect(entity.billingRhythmAt(AT).equals(MONTHLY_FIRST)).toBe(true);
    expect(entity.billingRhythm.scheduled).toBeNull();
  });

  it("programme le nouveau rythme à la prochaine clôture de l'ANCIEN", () => {
    const entity = declared();

    const change = entity.changeBillingRhythm(WEEKLY_MONDAY, AT, false);

    expect(change).toEqual({ from: MONTHLY_FIRST, to: WEEKLY_MONDAY, effectiveAt: NEXT_FIRST });
    // La période en cours n'est pas coupée : le mensuel fait foi jusqu'à sa clôture.
    expect(entity.billingRhythmAt(AT).equals(MONTHLY_FIRST)).toBe(true);
    expect(entity.billingRhythmAt(new Date(NEXT_FIRST.getTime() - 1)).equals(MONTHLY_FIRST)).toBe(
      true,
    );
    expect(entity.billingRhythmAt(NEXT_FIRST).equals(WEEKLY_MONDAY)).toBe(true);
  });

  it("ne change rien quand le rythme demandé est celui en vigueur", () => {
    const entity = declared();
    const before = entity.toPersistence();

    expect(entity.changeBillingRhythm(BillingRhythm.monthly(1), AT, false)).toBeNull();
    expect(entity.toPersistence()).toEqual(before);
  });

  it("refuse un second changement tant que la clôture de prise d'effet n'est pas facturée", () => {
    const entity = declared();
    entity.changeBillingRhythm(WEEKLY_MONDAY, AT, false);
    const before = entity.toPersistence();

    expect(() => entity.changeBillingRhythm(SEMIMONTHLY, AT, false)).toThrow(
      BillingRhythmChangePendingError,
    );
    expect(() => entity.changeBillingRhythm(SEMIMONTHLY, AT, false)).toThrow(/1 novembre 2026/);
    expect(entity.toPersistence()).toEqual(before);
  });

  it("refuse encore APRÈS la prise d'effet si la facture n'a pas tenté la clôture", () => {
    const entity = declared();
    entity.changeBillingRhythm(WEEKLY_MONDAY, AT, false);

    expect(() => entity.changeBillingRhythm(MONTHLY_FIRST, LATER, false)).toThrow(
      BillingRhythmChangePendingError,
    );
  });

  it("dans la fenêtre 23h55-minuit, une clôture facturée ouvre un changement après elle", () => {
    const entity = declared();
    entity.changeBillingRhythm(WEEKLY_MONDAY, AT, false);
    const eve = new Date(NEXT_FIRST.getTime() - 60_000);

    const change = entity.changeBillingRhythm(SEMIMONTHLY, eve, true);

    // Le hebdomadaire part bien du 1er novembre : le suivant attend SA clôture.
    expect(change).toEqual({
      from: WEEKLY_MONDAY,
      to: SEMIMONTHLY,
      effectiveAt: new Date("2026-11-01T23:00:00.000Z"),
    });
  });

  it("revenir au rythme en vigueur ANNULE le programmé", () => {
    const entity = declared();
    entity.changeBillingRhythm(WEEKLY_MONDAY, AT, false);

    const change = entity.changeBillingRhythm(MONTHLY_FIRST, AT, false);

    expect(change).toEqual({ from: MONTHLY_FIRST, to: MONTHLY_FIRST, effectiveAt: null });
    expect(entity.billingRhythm.scheduled).toBeNull();
    expect(entity.billingRhythmAt(NEXT_FIRST).equals(MONTHLY_FIRST)).toBe(true);
  });

  it("redemander le rythme déjà programmé n'est pas un fait", () => {
    const entity = declared();
    entity.changeBillingRhythm(WEEKLY_MONDAY, AT, false);

    expect(entity.changeBillingRhythm(BillingRhythm.weekly(1), AT, false)).toBeNull();
  });

  it("après la prise d'effet, l'ancien programmé est le rythme de départ", () => {
    const entity = declared();
    entity.changeBillingRhythm(WEEKLY_MONDAY, AT, false);

    const change = entity.changeBillingRhythm(MONTHLY_FIRST, LATER, true);

    // Le hebdomadaire fait foi depuis le 1er novembre : le mensuel ne revient
    // qu'à SA prochaine clôture, le lundi suivant.
    expect(change).toEqual({
      from: WEEKLY_MONDAY,
      to: MONTHLY_FIRST,
      effectiveAt: MONDAY_AFTER_LATER,
    });
    expect(entity.toPersistence()).toMatchObject({
      billingRhythmKind: "weekly",
      billingRhythmDays: [1],
      nextBillingRhythmKind: "monthly",
      nextBillingRhythmDays: [1],
      nextBillingRhythmEffectiveAt: MONDAY_AFTER_LATER,
    });
  });
});

describe("LegalEntity — le rythme à la relecture", () => {
  it("fait l'aller-retour avec un rythme programmé", () => {
    const entity = declared();
    entity.changeBillingRhythm(SEMIMONTHLY, AT, false);
    const written = entity.toPersistence();

    expect(written).toMatchObject({
      billingRhythmKind: "monthly",
      billingRhythmDays: [1],
      nextBillingRhythmKind: "semimonthly",
      nextBillingRhythmDays: [1, 16],
      nextBillingRhythmEffectiveAt: NEXT_FIRST,
    });
    expect(LegalEntity.reconstitute(written).toPersistence()).toEqual(written);
  });

  it("écrit « rien de programmé » en genre et instant nuls, jours vides", () => {
    expect(declared().toPersistence()).toMatchObject({
      nextBillingRhythmKind: null,
      nextBillingRhythmDays: [],
      nextBillingRhythmEffectiveAt: null,
    });
  });

  it("refuse une ligne dont le rythme est abîmé", () => {
    const written = declared().toPersistence();
    expect(() => LegalEntity.reconstitute({ ...written, billingRhythmDays: [29] })).toThrow(
      InvalidBillingRhythmError,
    );
    expect(() =>
      LegalEntity.reconstitute({
        ...written,
        nextBillingRhythmKind: "weekly",
        nextBillingRhythmDays: [1, 2],
        nextBillingRhythmEffectiveAt: NEXT_FIRST,
      }),
    ).toThrow(InvalidBillingRhythmError);
  });
});
