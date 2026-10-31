-- ⛔ PÉRIMÉ depuis le lot L12 (2026-10-30, migration
-- 20261031150000_le_resserrement_des_promotions). Ce retour arrière remettait
-- `promotions_source` à `legacy` et/ou rejouait `reprise_des_promotions()` :
-- le CHECK n'admet plus que `promotions`, la reprise est neutralisée, et le
-- code ne sait plus servir l'ancien chemin. Il ne se joue plus : la garde
-- ci-dessous l'arrête avant toute écriture. Gardé pour l'histoire.
DO $$ BEGIN
  RAISE EXCEPTION 'retour arrière périmé depuis L12 (20261031150000) : ne pas le jouer';
END $$;

-- RETOUR ARRIÈRE de 20261031120000_la_reprise_des_promotions
-- (documentation/promotions/plan-promotions-par-audience-et-acheminement.md,
-- § 13.4 « Retour arrière »).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. Il se joue À LA MAIN, une fois,
-- par l'URL DIRECTE. La migration reste inscrite « appliquée » : ne pas la
-- résoudre.
--
-- AVANT LA BASCULE (L8), aucun prix n'est en jeu : le calcul lit l'ancien
-- chemin, et ni `price_rules` ni `pickup_addresses` n'ont été touchées. Défaire
-- la reprise = ARCHIVER les promotions reprises — jamais de `DELETE` : leurs
-- actes sont au journal tarifaire, et une promotion effacée laisserait des
-- actes sans sujet. Rejouer ensuite `SELECT public.reprise_des_promotions();`
-- les DÉSARCHIVE (son `DO UPDATE` recopie `archived_at` de la source) ou
-- recrée ce qui manque, sans écrire de nouvel acte.
--
-- Ne touche JAMAIS une promotion saisie à l'écran (`legacy_source IS NULL`).
-- La ligne `promotion_settings` reste à `legacy`, la fonction reste en place :
-- toutes deux sont inertes tant que rien ne les lit.
--
-- APRÈS LA BASCULE, ce fichier ne suffit pas : remettre d'abord
-- `promotions_source` à `legacy` (§ 13.5) ; et toute promotion posée ou
-- modifiée à l'écran depuis est perdue pour l'ancien chemin — le journal
-- (`pricing_events`, sujet `promotion`) les liste, à reposer à la main.

SET lock_timeout = '5s';

BEGIN;

UPDATE public.promotions
   SET archived_at = CURRENT_TIMESTAMP,
       archived_by = 'system:reprise-promotions',
       archive_reason = 'retour arrière de la reprise'
 WHERE legacy_source IS NOT NULL
   AND archived_at IS NULL;

COMMIT;
