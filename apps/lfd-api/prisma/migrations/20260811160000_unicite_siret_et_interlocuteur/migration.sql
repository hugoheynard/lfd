-- Deux unicités que seule la base peut tenir.
--
-- 1. Le SIRET. La vérification applicative lit puis écrit : deux commerciaux qui
--    ouvrent le même client en même temps passent tous deux le contrôle, et
--    rien ne s'en apercevra jamais ensuite — la vérification n'existe qu'à la
--    création. L'index est PARTIEL parce que le SIRET est facultatif à
--    l'ouverture (le commercial est chez son client, sans les papiers) : les
--    chaînes vides ne sont pas des doublons, ce sont des absences.
--
-- 2. L'interlocuteur. Une personne, une adresse, un rôle : deux lignes pour la
--    même boîte e-mail donneraient deux rôles à la même personne dans la même
--    société, et l'accès ouvert depuis l'une contredirait celui affiché sur
--    l'autre. Normalisé en minuscules — `Jean@X.fr` et `jean@x.fr` sont la même
--    boîte, et c'est déjà ainsi qu'on rapproche un contact de son compte.

-- Avant d'exiger l'unicité : un SIRET tout à zéro n'est pas un SIRET (sa clé de
-- contrôle est fausse), c'est un marqueur d'« inconnu » qui date d'avant le
-- modèle où l'absence se représente par une chaîne vide. On le remet donc à sa
-- vraie valeur — vide — plutôt que d'exclure une seconde sentinelle de l'index
-- et de la traîner pour toujours.
UPDATE "public"."companies" SET "siret" = '' WHERE "siret" = '00000000000000';

CREATE UNIQUE INDEX "companies_siret_unique_when_known"
  ON "public"."companies" ("siret")
  WHERE "siret" <> '';

CREATE UNIQUE INDEX "company_contacts_one_per_email"
  ON "public"."company_contacts" ("company_id", lower("email"));
