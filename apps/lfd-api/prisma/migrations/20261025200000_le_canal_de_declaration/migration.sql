-- Plan P1 (documentation/b2b/plan-auto-acquisition-pro.md, § 5) : par qui une
-- société a été déclarée — le client lui-même (porte pro) ou le staff.
--
-- STRICTEMENT ADDITIVE : un type et une colonne NULLABLE. Retour arrière :
-- DROP COLUMN puis DROP TYPE ; il ne coûte que le rattrapage, rejouable.
--
-- POURQUOI NULLABLE, sans défaut : le canal ne se trouvait que dans la charge
-- du fait `company.declared` du journal, écrit par un abonné best-effort. Une
-- société dont le fait n'y est jamais arrivé n'a pas de canal connu ; un défaut
-- `self` ou `staff` l'inventerait.
--
-- LE RATTRAPAGE lit `growth.activity_events` depuis `public.companies`. Ce
-- n'est pas une frontière franchie :
--   · `growth` et `account` sont deux contextes du MÊME bloc `b2b`, et la
--     matrice de CLAUDE.md § 3 ne règle que les blocs ;
--   · `lint:cross-schema-join` et `lint:prisma-model-ownership` tiennent le CODE
--     qui tourne (`src/**/*.ts`) — ils ne lisent pas les migrations, et c'est
--     voulu : une lecture faite une fois, ici, ne crée aucune dépendance à
--     l'exécution. Après ce passage, Comptes clients lit sa propre colonne.
--   · précédent : `20260918190000_conversion_des_auteurs_staff` réécrit des
--     tables de `pim` depuis `public` dans la même migration.
--
-- Seules les valeurs EXACTES `self` et `staff` sont reprises : la projection
-- d'activation lisait « tout sauf `staff` » comme `self`, ce qui ferait d'une
-- charge vide un client inscrit seul. Le plus ancien fait l'emporte (la clé
-- d'idempotence du journal n'en admet qu'un par société).
--
-- IDEMPOTENTE : ne touche que les lignes encore à NULL.

CREATE TYPE "public"."company_declaration_channel" AS ENUM ('self', 'staff');

ALTER TABLE "public"."companies"
  ADD COLUMN "declared_via" "public"."company_declaration_channel";

UPDATE "public"."companies" AS c
SET "declared_via" = (e."payload" ->> 'via')::"public"."company_declaration_channel"
FROM (
  SELECT DISTINCT ON ("subject_id") "subject_id", "payload"
  FROM "growth"."activity_events"
  WHERE "type" = 'company.declared'
    AND "subject_type" = 'company'
    AND "payload" ->> 'via' IN ('self', 'staff')
  ORDER BY "subject_id", "occurred_at" ASC
) AS e
WHERE e."subject_id" = c."id"
  AND c."declared_via" IS NULL;
