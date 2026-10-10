-- description: Añade la columna tempo a pieces (B-005.4).
-- context: Persistir el tempo inicial (BPM) que el motor normalizado ya calcula.

-- El tempo (BPM inicial) lo aporta MidiService.inspect_file desde B-005.1.
-- Se añade como columna nueva sin tocar la migración 0001, que ya está aplicada
-- en las bases de datos existentes.
ALTER TABLE pieces ADD COLUMN tempo REAL;
