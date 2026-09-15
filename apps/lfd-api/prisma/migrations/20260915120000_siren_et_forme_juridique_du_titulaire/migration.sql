-- Les deux mentions qu'un mandat interentreprises exige et que la base ne
-- portait pas — plan `documentation/comptabilite/plan-mentions-obligatoires-du-mandat.md`
-- (§9, contrat de construction).
--
-- Additive et réversible (§0) : deux colonnes, un index, un remplissage.
-- Aucune suppression, aucun resserrement.
--
-- ## `companies.siren`
--
-- Le SIREN identifie l'ENTREPRISE, là où le SIRET identifie un établissement :
-- plusieurs établissements le partagent, d'où un index NON unique. Vide =
-- inconnu, comme le SIRET.
--
-- 🔴 Le remplissage ne prend PAS `left(siret, 9)` sans condition. La clé de
-- Luhn d'un SIRET (14 chiffres) ne garantit pas celle de ses 9 premiers
-- chiffres : `81245678900021` est un SIRET valide dont le préfixe n'est pas un
-- SIREN valide. L'écrire donnerait une valeur que `Siren.create` refuse au
-- chargement. Le préfixe n'est donc recopié que s'il passe la clé de Luhn et
-- n'est pas `000000000` (Luhn laisse passer les zéros) ; sinon le SIREN reste
-- vide — décision de Hugo, 2026-09-15.
--
-- La clé est calculée sur 9 chiffres, de gauche à droite : les positions
-- paires (2, 4, 6, 8) sont doublées — ce sont celles d'indice impair en partant
-- de la droite, exactement comme `Siren.create` — et un doublement au-delà de 9
-- perd 9. La somme doit être un multiple de 10.
--
-- Retour arrière (vitruve §8.9) : l'ancien binaire corrige un SIRET sans
-- toucher au SIREN. Après un redéploiement, rejouer ce même UPDATE sans la
-- condition `"siren" = ''`, pour recalculer TOUS les SIREN depuis leur SIRET.
--
-- ## `company_bank_accounts.holder_legal_form`
--
-- Civilité ou forme juridique du titulaire du compte. Rien à remplir : on ne
-- sait pas qui est le titulaire, et la société n'en est pas une preuve.

ALTER TABLE "public"."companies"
  ADD COLUMN "siren" TEXT NOT NULL DEFAULT '';

CREATE INDEX "companies_siren_idx" ON "public"."companies"("siren");

ALTER TABLE "public"."company_bank_accounts"
  ADD COLUMN "holder_legal_form" TEXT NOT NULL DEFAULT '';

UPDATE "public"."companies" AS c
SET "siren" = left(c."siret", 9)
WHERE c."siren" = ''
  AND c."siret" ~ '^[0-9]{14}$'
  AND left(c."siret", 9) <> '000000000'
  AND (
    SELECT sum(
      CASE
        WHEN d.position % 2 = 0 THEN
          CASE WHEN d.digit * 2 > 9 THEN d.digit * 2 - 9 ELSE d.digit * 2 END
        ELSE d.digit
      END
    )
    FROM (
      -- 🔴 `ascii(…) - 48` et PAS `::int` (lecteur de migrations, 2026-09-15) :
      -- Postgres ne garantit pas l'ordre d'évaluation d'un `AND`, et ce calcul
      -- peut tourner AVANT le filtre `^[0-9]{14}$`. Un seul SIRET saisi avec une
      -- lettre ou un espace ferait alors lever le cast et annulerait TOUTE la
      -- migration, donc le déploiement. `ascii` ne lève jamais, et une valeur
      -- absurde est ensuite écartée par le filtre, qui reste obligatoire.
      SELECT p AS position, ascii(substr(c."siret", p, 1)) - 48 AS digit
      FROM generate_series(1, 9) AS p
    ) AS d
  ) % 10 = 0;
