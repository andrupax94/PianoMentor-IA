-- description: Migración del modo y la mano de práctica en la sesión (B-032.3).
-- context: `mode` (observe/one_hand/two_hands) y `hand` (left/right/both) se persisten
-- para que el agente (B-032.6) decida con el mismo dato que la evaluación. El
-- selector que los escribe es B-032.4; aquí solo se añaden las columnas con sus
-- valores por defecto (observe / both) para conservar el comportamiento actual.

ALTER TABLE sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'observe';
ALTER TABLE sessions ADD COLUMN hand TEXT NOT NULL DEFAULT 'both';