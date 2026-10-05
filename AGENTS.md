# Instrucciones persistentes de PianoMentor AI

## Terminal y codificación de archivos

- La terminal de las herramientas puede ejecutarse como Windows PowerShell 5.1 aunque el usuario tenga PowerShell 7.6 instalado.
- No asumir que `pwsh` puede ejecutarse desde esta sesión. Puede aparecer en `PATH` pero fallar con `Acceso denegado` si proviene de `WindowsApps`.
- Para crear o sobrescribir archivos UTF-8, no usar directamente `Set-Content -Encoding UTF8` ni `Out-File -Encoding UTF8`, porque pueden generar BOM en esta terminal.
- Usar siempre escritura UTF-8 sin BOM mediante .NET:

```powershell
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
```

- Después de crear JSON, comprobar que Python puede leerlo con `encoding="utf-8"`.
- No pedir al usuario que cambie su instalación de PowerShell para resolver esta limitación del entorno de herramientas.

## Proyecto

- Leer `README.md` antes de modificar la arquitectura o el comportamiento.
- Usar `PLAN.md` como fuente de verdad para cronograma y aceptación.
- Usar `ARCHITECTURE.md` como fuente de verdad para estructura, capas y contratos técnicos.
- Mantener el motor musical determinista separado de FastAPI, Next.js y el LLM.
