-- LES LIMITES ONT UNE CLIENTÈLE — `pro` ou `public`
--
-- Plan : documentation/comptabilite/plan-limites-de-prix.md §3.
--
-- Additive, un seul déploiement : rien n'est retiré qui soit lu. Toutes les
-- limites existantes deviennent `pro`, et c'est leur sens réel — elles ne se
-- sont jamais appliquées au public. Le type est l'enum EXISTANT de la
-- commande, pas un second typage des mêmes valeurs.
ALTER TABLE "public"."price_floors"
  ADD COLUMN "clientele" "public"."OrderClientele" NOT NULL DEFAULT 'pro';

-- 🔴 La contrainte gagne la clientèle, dans l'ordre CRÉER → SUPPRIMER : à aucun
-- instant la table n'est sans garantie. L'ancienne (posée par
-- `20260909190000_plancher_date`, la dernière à la toucher) est plus stricte
-- que la nouvelle ; tant que toutes les lignes sont `pro`, les deux disent la
-- même chose, donc la création ne peut pas échouer sur une donnée que
-- l'ancienne acceptait.
ALTER TABLE "public"."price_floors"
  ADD CONSTRAINT "price_floors_no_overlap_by_clientele"
  EXCLUDE USING gist (
    "clientele" WITH =,
    "scope_type" WITH =,
    coalesce("scope_id", '') WITH =,
    tstzrange("valid_from", "valid_to", '[)') WITH &&
  )
  WHERE ("archived_at" IS NULL);

ALTER TABLE "public"."price_floors" DROP CONSTRAINT "price_floors_no_overlap";

-- Retour arrière : recréer `price_floors_no_overlap` (il échouera si une limite
-- publique chevauche une pro sur la même portée — archiver les publiques
-- d'abord), supprimer `price_floors_no_overlap_by_clientele`, puis la colonne.
