import { z } from "zod";

import {
  staffActionSchema,
  staffOverrideEffectSchema,
  staffResourceSchema,
} from "../staff-access.js";
import { fact, payload, retired, subjectLabel, type JournalFactFamily } from "./fact.js";

/**
 * **L'équipe** — l'annuaire staff et ses rôles. Écrits par les handlers de
 * `staff/`, par `journal.append`. Une personne s'y cite par son nom figé, un
 * rôle par son libellé figé : jamais un e-mail, jamais un lien.
 *
 * Lot B du plan des phrases (2026-09-19) : chaque fait porte le nom de son
 * sujet en `subjectLabel` (D6) — « Prénom Nom » pour une fiche, le libellé pour
 * un rôle. Les formes d'avant restent dans `history`.
 */

/**
 * Ajoute le libellé du sujet à une charge, et garde la forme d'avant en
 * historique : toutes les charges de l'équipe ont changé de la même façon.
 */
function labelled<S extends z.ZodRawShape>(shape: S) {
  return fact(payload({ subjectLabel: subjectLabel(), ...shape }), [payload(shape)]);
}

const person = () => payload({ firstName: z.string(), lastName: z.string() });

/** Un droit, avec le libellé de sa ressource figé à l'écriture. */
const grant = {
  resource: staffResourceSchema,
  resourceLabel: z.string(),
  action: staffActionSchema,
};
const grantEntry = () => payload(grant);
const overrideEntry = () => payload({ ...grant, effect: staffOverrideEffectSchema });

/**
 * La reprise de l'annuaire (`20260918160000_reprise_du_journal_de_l_annuaire`)
 * a écrit des faits de création et d'invitation marqués comme tels. Le code
 * ne les écrit jamais ; ils sont en base.
 */
const backfill = {
  backfilled: z.literal(true).optional(),
  source: z.string().optional(),
};

const identityField = () => z.enum(["firstName", "lastName", "email", "phone", "jobTitle"]);

/** Un champ d'identité changé : sa clé, son libellé figé, l'avant et l'après. */
const identityChange = () =>
  payload({ field: identityField(), label: z.string(), from: z.string(), to: z.string() });

export const TEAM_FACTS = {
  "staff_user.created": labelled({ person: person(), roleLabel: z.string(), ...backfill }),
  "staff_user.invited": labelled({
    person: person(),
    kind: z.enum(["invitation", "password_reset"]),
    ...backfill,
  }),
  "staff_user.password_link_issued": labelled({ person: person() }),
  "staff_user.identity_edited": fact(
    payload({
      subjectLabel: subjectLabel(),
      /** Le nom APRÈS le geste. */
      person: person(),
      /** Le nom d'avant, seulement s'il a changé. */
      previous: person().nullable(),
      changes: z.array(identityChange()),
    }),
    [
      // Avant le lot B : sans libellé, avec `changes`, et `fields` qui le doublait.
      payload({
        person: person(),
        previous: person().nullable(),
        fields: z.array(z.string()),
        changes: z.array(identityChange()),
      }),
      // Avant `changes` (2026-09-18) : les seuls libellés des champs changés.
      payload({ person: person(), previous: person().nullable(), fields: z.array(z.string()) }),
    ],
  ),
  "staff_user.role_changed": labelled({
    person: person(),
    fromLabel: z.string(),
    toLabel: z.string(),
  }),
  "staff_user.overrides_changed": labelled({
    person: person(),
    added: z.array(overrideEntry()),
    removed: z.array(overrideEntry()),
    changed: z.array(overrideEntry()),
  }),
  "staff_user.suspended": labelled({ person: person() }),
  /**
   * La **première** activation d'une fiche — de `pending` ou `invited` vers
   * `active` (D7 du plan des phrases, 2026-09-19). Avant ce type, elle
   * s'écrivait `reinstated`.
   */
  "staff_user.activated": fact(payload({ subjectLabel: subjectLabel(), person: person() })),
  /**
   * Le **rétablissement** d'une fiche suspendue. ⚠️ Les lignes écrites avant
   * le 2026-09-19 couvrent AUSSI la première activation (D7) : leur phrase dit
   * « a activé ou rétabli l'accès ».
   */
  "staff_user.reinstated": labelled({ person: person() }),
  /**
   * Une fiche ne se supprime plus depuis `530b83a8` (2026-09-18) : le fait
   * s'est écrit entre `ece4c5f6` et ce commit. `staffUserDeletedFact` existe
   * encore, sans appelant (vérifié le 2026-09-19).
   */
  "staff_user.deleted": retired(payload({ person: person(), roleLabel: z.string() })),

  /** Le sujet est la clé du rôle ; son libellé du moment est `subjectLabel`. */
  "staff_role.created": labelled({ label: z.string(), grants: z.array(grantEntry()) }),
  "staff_role.updated": labelled({
    label: z.string(),
    /** Le libellé d'avant, seulement s'il a changé. */
    previousLabel: z.string().nullable(),
    added: z.array(grantEntry()),
    removed: z.array(grantEntry()),
    changed: z.array(grantEntry()),
  }),
  "staff_role.archived": labelled({ label: z.string() }),
  "staff_role.restored": labelled({ label: z.string() }),
} as const satisfies JournalFactFamily;
