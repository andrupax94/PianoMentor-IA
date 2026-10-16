-- description: Añade la portada (ruta pública) a pieces (B-027.3).
-- context: Retratos de dominio público del corpus servidos por el frontend en /assets/covers/<slug>.jpg.

-- cover: ruta pública de la portada de la pieza; NULL si no tiene. El catálogo
-- la aporta por pieza (catalog.json) y el loader la persiste; las subidas de
-- usuario quedan sin portada hasta que exista una generada.
ALTER TABLE pieces ADD COLUMN cover TEXT;
