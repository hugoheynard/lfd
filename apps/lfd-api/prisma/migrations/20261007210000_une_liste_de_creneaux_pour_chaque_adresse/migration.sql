-- UNE LISTE DE CRÉNEAUX POUR CHAQUE ADRESSE — plan
-- `documentation/livraisons/clientele/plan-retrait-slots.md`, S1.
--
-- Les consignes d'une adresse (`addresses.delivery_specs`, jsonb) portent
-- l'ancien créneau unique `slots` et, depuis CA3b, la liste `slotList`. Le code
-- qui suit cette migration ne lit plus que `slotList` : chaque adresse qui n'a
-- que `slots` reçoit ici la liste qui en dérive, à l'identique de ce que
-- `slotsFor` en lisait (un créneau nul → liste vide ; un jour nul reste nul,
-- lu comme une liste vide).
--
-- Additive : `slots` reste en base. Une adresse qui a déjà sa liste n'est pas
-- touchée — la liste fait foi, `slots` n'en était que le reflet. Un
-- `slotList: null` explicite est remplacé par la liste dérivée.
UPDATE addresses
SET delivery_specs = jsonb_set(
  delivery_specs,
  '{slotList}',
  CASE delivery_specs->'slots'->>'mode'
    WHEN 'everyday' THEN jsonb_build_object(
      'mode', 'everyday',
      'slots', CASE WHEN jsonb_typeof(delivery_specs->'slots'->'slot') = 'object'
                    THEN jsonb_build_array(delivery_specs->'slots'->'slot')
                    ELSE '[]'::jsonb END)
    WHEN 'perDay' THEN jsonb_build_object(
      'mode', 'perDay',
      'byDay', (SELECT jsonb_object_agg(d.key,
                  CASE WHEN jsonb_typeof(d.value) = 'object'
                       THEN jsonb_build_array(d.value) ELSE 'null'::jsonb END)
                FROM jsonb_each(delivery_specs->'slots'->'byDay') AS d))
  END)
WHERE delivery_specs IS NOT NULL
  AND delivery_specs ? 'slots'
  AND (NOT delivery_specs ? 'slotList' OR jsonb_typeof(delivery_specs->'slotList') = 'null')
  AND delivery_specs->'slots'->>'mode' IN ('everyday', 'perDay');

-- Le garde : une forme que l'UPDATE ne sait pas convertir fait échouer le
-- DÉPLOIEMENT, avant qu'un lecteur ne la rencontre (un carnet en 500, ou un
-- livreur privé de la note et du GPS). Des consignes qui valent le `null` JSON
-- ne sont pas des objets : ni converties, ni comptées.
DO $$
DECLARE left_over integer;
BEGIN
  SELECT count(*) INTO left_over FROM addresses
  WHERE jsonb_typeof(delivery_specs) = 'object'
    AND (NOT delivery_specs ? 'slotList' OR jsonb_typeof(delivery_specs->'slotList') <> 'object');
  IF left_over > 0 THEN
    RAISE EXCEPTION '% adresse(s) gardent des consignes sans liste de créneaux : forme inconnue, à corriger avant de déployer', left_over;
  END IF;
END $$;
