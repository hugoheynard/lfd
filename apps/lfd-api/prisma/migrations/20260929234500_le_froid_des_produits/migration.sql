-- Le froid des produits — lot 4 bis, tranche (A), du plan de préparation de
-- tournée (v2-2) : « demande le froid » est une propriété de la FICHE du
-- référentiel, publiée dans le catalogue B2B (fil v12) et relayée à la
-- livraison.
--
-- **Additif** : deux colonnes NOT NULL DEFAULT false. Une fiche existante
-- n'est pas froide tant que personne ne l'a dit ; un article du miroir reçu
-- avant la v12 non plus.
--
-- Retour arrière (seulement tant qu'aucun envoi v12 n'a été accepté : le code
-- v11 ne relit pas un envoi v12 en attente) :
--   ALTER TABLE "public"."catalog_items" DROP COLUMN "requires_cold";
--   ALTER TABLE "pim"."product" DROP COLUMN "requires_cold";
--
-- Plan : documentation/livraisons/plan-preparation-de-tournee.md (lot 4 bis, v2-2)

-- ── 1. LA FICHE DU RÉFÉRENTIEL ─────────────────────────────────────────────
ALTER TABLE "pim"."product" ADD COLUMN "requires_cold" BOOLEAN NOT NULL DEFAULT false;

-- ── 2. LE MIROIR DES ARTICLES ──────────────────────────────────────────────
ALTER TABLE "public"."catalog_items" ADD COLUMN "requires_cold" BOOLEAN NOT NULL DEFAULT false;
