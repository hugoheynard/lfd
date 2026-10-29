-- Régression R17 : la fin que la clôture calcule n'était pas persistée.
--
-- Depuis le 2026-09-09, clore une mercuriale / une règle / un barème / un
-- engagement calcule `valid_to` dans le domaine (`closingWindowAt`), mais les
-- quatre dépôts n'écrivaient que les colonnes de cycle de vie. Les décisions
-- closes depuis gardent leur fin d'origine : elles chevauchent toute période
-- future dans `archivedOverlapping`, et une mercuriale qui a facturé refuse
-- toute nouvelle pose chez son client (`PricedPeriodIsSealedError`).
--
-- Ce rattrapage écrit la fin que l'agrégat aurait écrite, cas par cas, comme
-- `closingWindowAt` :
--   · la fin est l'instant où elle a cessé d'agir : `LEAST(paused_at,
--     archived_at)` (une pause antérieure à la clôture l'a arrêtée là) ;
--   · rien quand cette fin ne dépasse pas `valid_from` — elle n'a jamais agi,
--     et borner donnerait une plage vide ou renversée ;
--   · rien quand la fenêtre était déjà terminée à la clôture — la repousser la
--     ressusciterait.
--
-- Additif et sans risque pour la relecture datée : elle exclut déjà, par
-- `archived_at`, toute décision rangée avant l'instant relu ; seule la plage
-- postérieure à la clôture est rendue. Aucune contrainte d'exclusion ne voit
-- ces lignes (elles sont partielles sur `archived_at IS NULL`), et une plage
-- qui RÉTRÉCIT ne peut rien recouvrir de plus.
--
-- Rejouable : une seconde passe ne trouve plus rien (`valid_to > archived_at`
-- est faux une fois borné).

UPDATE public.company_mercuriales
SET valid_to = LEAST(paused_at, archived_at)
WHERE archived_at IS NOT NULL
  AND LEAST(paused_at, archived_at) > valid_from
  AND (valid_to IS NULL OR valid_to > archived_at);

UPDATE public.price_rules
SET valid_to = LEAST(paused_at, archived_at)
WHERE archived_at IS NOT NULL
  AND LEAST(paused_at, archived_at) > valid_from
  AND (valid_to IS NULL OR valid_to > archived_at);

UPDATE public.volume_ladders
SET valid_to = LEAST(paused_at, archived_at)
WHERE archived_at IS NOT NULL
  AND LEAST(paused_at, archived_at) > valid_from
  AND (valid_to IS NULL OR valid_to > archived_at);

-- Un engagement n'a pas de pause : sa clôture borne à `archived_at`.
UPDATE public.volume_commitments
SET valid_to = archived_at
WHERE archived_at IS NOT NULL
  AND archived_at > valid_from
  AND valid_to > archived_at;
