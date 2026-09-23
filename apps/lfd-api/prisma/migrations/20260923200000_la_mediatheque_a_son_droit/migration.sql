-- LA MÉDIATHÈQUE A SON DROIT, ET LA COMMUNICATION SON RÔLE
--
-- La bibliothèque était murée par `pim_catalog` : qui lisait le catalogue
-- pouvait supprimer du fonds. Cela décrivait la réalité tant qu'elle vivait
-- dans le référentiel ; elle en est sortie le 2026-09-23, et l'emprunt ne dit
-- plus rien de vrai.
--
-- 🔴 CE DÉTACHEMENT RETIRE UN ACCÈS, et c'est la décision de Hugo : seuls
-- `admin` et `communication` obtiennent `media_library`. Un commercial qui
-- édite une fiche ne pourra donc plus y choisir d'image — illustrer est le
-- travail de la communication. C'est un RESSERREMENT, pas un élargissement, et
-- il faut le lire comme tel avant de promouvoir vers `main`.
--
-- ⚠️ Ce qui N'EST PAS fait ici, délibérément : aucun backfill des dérogations
-- individuelles. Le précédent (2026-09-01, §2) en posait un parce que
-- l'éclatement de `pim_catalog` devait RECONDUIRE les accès ; ici on veut
-- l'inverse. Une dérogation `pim_catalog` ne donne donc PAS la médiathèque, et
-- c'est le but.
--
-- Plan : documentation/mediatheque/plan-les-six-de-la-mediatheque.md (lot 5)

-- ── 1. LES VALEURS D'ENUM ──────────────────────────────────────────────────
--
-- `ADD VALUE` est additif et irréversible : une valeur d'enum ne se retire pas
-- sans recréer le type. C'est sans conséquence ici — personne ne la porte
-- encore.
ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'media_library';
ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'communication';
