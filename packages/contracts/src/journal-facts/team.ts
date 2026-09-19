import { z } from "zod";

import {
  staffActionSchema,
  staffOverrideEffectSchema,
  staffResourceSchema,
} from "../staff-access.js";
import { fact, payload, retired, type JournalFactFamily } from "./fact.js";

/**
 * **L'équipe** — l'annuaire staff et ses rôles. Écrits par les handlers de
 * `staff/`, par `journal.append`. Une personne s'y cite par son nom figé, un
 * rôle par son libellé figé : jamais un e-mail, jamais un lien.
 */

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

export const TEAM_FACTS = {
  "staff_user.created": fact(payload({ person: person(), roleLabel: z.string(), ...backfill })),
  "staff_user.invited": fact(
    payload({ person: person(), kind: z.enum(["invitation", "password_reset"]), ...backfill }),
  ),
  "staff_user.password_link_issued": fact(payload({ person: person() })),
  "staff_user.identity_edited": fact(
    payload({
      /** Le nom APRÈS le geste. */
      person: person(),
      /** Le nom d'avant, seulement s'il a changé. */
      previous: person().nullable(),
      /** Les libellés des champs changés — doublon de `changes`, gardé pour les lignes anciennes. */
      fields: z.array(z.string()),
      changes: z.array(
        payload({ field: identityField(), label: z.string(), from: z.string(), to: z.string() }),
      ),
    }),
  ),
  "staff_user.role_changed": fact(
    payload({ person: person(), fromLabel: z.string(), toLabel: z.string() }),
  ),
  "staff_user.overrides_changed": fact(
    payload({
      person: person(),
      added: z.array(overrideEntry()),
      removed: z.array(overrideEntry()),
      changed: z.array(overrideEntry()),
    }),
  ),
  "staff_user.suspended": fact(payload({ person: person() })),
  /** ⚠️ Couvre aussi la PREMIÈRE activation d'une fiche en attente (D7 du plan). */
  "staff_user.reinstated": fact(payload({ person: person() })),
  /**
   * Une fiche ne se supprime plus depuis `530b83a8` (2026-09-18) : le fait
   * s'est écrit entre `ece4c5f6` et ce commit. `staffUserDeletedFact` existe
   * encore, sans appelant (vérifié le 2026-09-19).
   */
  "staff_user.deleted": retired(payload({ person: person(), roleLabel: z.string() })),

  /** Le sujet est la clé du rôle. */
  "staff_role.created": fact(payload({ label: z.string(), grants: z.array(grantEntry()) })),
  "staff_role.updated": fact(
    payload({
      label: z.string(),
      /** Le libellé d'avant, seulement s'il a changé. */
      previousLabel: z.string().nullable(),
      added: z.array(grantEntry()),
      removed: z.array(grantEntry()),
      changed: z.array(grantEntry()),
    }),
  ),
  "staff_role.archived": fact(payload({ label: z.string() })),
  "staff_role.restored": fact(payload({ label: z.string() })),
} as const satisfies JournalFactFamily;
