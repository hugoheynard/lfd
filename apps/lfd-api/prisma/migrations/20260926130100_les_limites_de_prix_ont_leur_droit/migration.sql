-- LES LIMITES DE PRIX ONT LEUR DROIT — `lfc_price_limits`
--
-- Plan : documentation/comptabilite/plan-limites-de-prix.md §5.
--
-- Les gestes sur les limites (poser, confirmer, retirer, porte dynamique
-- comprise) ne sont plus couverts par `b2b_pricing` : ils passent à la
-- comptabilité. Le commercial ne pose plus ses propres limites.
--
-- 🔴 SEULE dans sa migration, et c'est une contrainte de Postgres : une valeur
-- d'enum ne s'EMPLOIE pas dans la transaction qui l'ajoute. Les droits sont
-- dans la suivante (`20260926130200_les_limites_de_prix_sont_accordees`).
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'lfc_price_limits' BEFORE 'b2b_alerts';
