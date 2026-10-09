<!-- description: Instrucciones persistentes del entorno: terminal PowerShell 7.6, UTF-8 sin BOM y reglas del proyecto. -->
<!-- context: Leer antes de crear o sobrescribir archivos desde herramientas. -->

# Instrucciones persistentes de PianoMentor AI

## Terminal y codificación de archivos

- La terminal de las herramientas es PowerShell 7.6.6 (`pwsh.exe`, edición Core). Verificar con `$PSVersionTable.PSVersion` antes de apoyarse en un comportamiento concreto de versión.
- Requisito del proyecto: todo archivo de texto se guarda en **UTF-8 sin BOM**.
- En 7.6.6, `Set-Content -Encoding UTF8`, `Out-File -Encoding utf8` y la redirección `>` escriben UTF-8 sin BOM. Comprobado midiendo: en un fichero con `á` los primeros bytes son `195,161`; un BOM empezaría por `239,187,191`.
- Si se quiere garantía explícita, escribir UTF-8 sin BOM mediante .NET:

```powershell
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
```

- Al capturar la salida de un comando nativo (por ejemplo `gh`) para analizarla con otra herramienta, **no** usar `comando | python`: PowerShell transcodifica por la codificación de consola y destruye los caracteres no ASCII, que llegan como `?`. Capturar con redirección de `cmd`, que es passthrough de bytes puros:

```powershell
cmd /c "gh issue view 4 --json body --jq .body > %TEMP%\salida.json"
```

- Después de crear JSON, comprobar que Python puede leerlo con `encoding="utf-8"`.
- En Windows PowerShell 5.1 estas garantías no valían: `>` escribía UTF-16 con BOM y `@($json | ConvertFrom-Json)` anidaba el array. No asumir 5.1; si se detecta, tratar los ficheros con el método .NET y evitar los pipes entre comandos nativos.

## Proyecto

- Leer `README.md` antes de modificar la arquitectura o el comportamiento.
- Usar `PLAN.md` como fuente de verdad para cronograma y aceptación.
- Usar `ARCHITECTURE.md` como fuente de verdad para estructura, capas y contratos técnicos.
- Mantener el motor musical determinista separado de FastAPI, Next.js y el LLM.
