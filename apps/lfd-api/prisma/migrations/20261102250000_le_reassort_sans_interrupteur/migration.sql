-- LE RÉASSORT SANS INTERRUPTEUR — retrait de la colonne morte
-- `public.order_cutoff_settings.resupply_subject_to_cutoff`.
--
-- Ordre explicite de Hugo, le 2026-11-02 : « oui je veux supprimer cette
-- colonne » (dette de code du réassort,
-- `documentation/reassort-boutiques/reste-a-faire.md` § 4).
--
-- L'interrupteur « réassort soumis à l'heure limite » n'est ni lu ni écrit
-- depuis le lot R3a (2026-10-21) : `resupply_cutoff_time` l'a remplacé.
-- Aucune valeur n'est perdue qui serve encore. Les faits passés du journal
-- (`order_cutoff_settings.updated`) gardent leur `resupplySubjectToCutoff` :
-- ils sont dans `jsonb`, pas dans cette colonne.
--
-- Retour arrière : `prisma/rollback/20261102250000_le_reassort_sans_interrupteur.sql`.

SET lock_timeout = '5s';

ALTER TABLE public.order_cutoff_settings
  DROP COLUMN IF EXISTS resupply_subject_to_cutoff;
