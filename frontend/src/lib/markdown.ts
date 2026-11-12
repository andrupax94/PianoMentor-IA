// description: Conversor mínimo de Markdown a HTML estilizado con las clases de Stitch.
// context: Genera HTML con clases Tailwind que el runtime no puede ver dinámicamente,
// pero sí detecta Tailwind porque los literales viven en este fichero escaneado.

export function markdownToHtml(source: string): string {
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  let inCode = false;
  let inList: "ul" | "ol" | null = null;
  let skippedFirstH1 = false;

  function closeList() {
    if (inList === "ul") out.push("</ul>");
    if (inList === "ol") out.push("</ol>");
    inList = null;
  }

  for (const rawLine of lines) {
    const line = rawLine;

    if (line.trim().startsWith("```")) {
      closeList();
      if (inCode) {
        out.push("</div></div>");
        inCode = false;
      } else {
        const lang = line.trim().replace(/^```/, "").trim() || "bash";
        out.push(
          `<div class="rounded-xl overflow-hidden bg-surface-container-lowest border border-outline-variant/30 shadow-xl my-6">` +
          `<div class="flex items-center gap-2 px-4 py-2.5 bg-surface-container-low border-b border-outline-variant/30 text-xs text-on-surface-variant font-mono">` +
          `<span class="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>` +
          `<span class="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>` +
          `<span class="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>` +
          `<span class="ml-2 font-medium text-white/70">${lang}</span>` +
          `</div>` +
          `<div class="p-4 font-mono text-sm overflow-x-auto text-on-surface leading-relaxed space-y-1">`
        );
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      out.push(`<p class="whitespace-pre-wrap">${escapeHtml(line)}</p>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      // El primer # del documento ya lo pinta el componente (título de página).
      if (level === 1 && !skippedFirstH1) {
        skippedFirstH1 = true;
        continue;
      }
      if (level === 2) {
        const numbered = heading[2].match(/^(\d+)\.\s+(.*)$/);
        if (numbered) {
          out.push(
            `<h2 class="text-2xl font-bold text-white flex items-center gap-3 mt-10 mb-3">` +
            `<span class="flex items-center justify-center w-7 h-7 rounded-lg bg-surface-container-high border border-primary/30 text-primary font-mono text-sm font-bold">${numbered[1]}</span>` +
            `<span>${inline(numbered[2])}</span></h2>`
          );
        } else {
          out.push(
            `<h2 class="text-2xl font-bold text-white mt-10 mb-3">${inline(heading[2])}</h2>`
          );
        }
        continue;
      }
      out.push(
        `<h${level} class="text-xl font-semibold text-white mt-8 mb-3">${inline(heading[2])}</h${level}>`
      );
      continue;
    }

    const ulItem = line.match(/^\s*[-*]\s+(.*)$/);
    if (ulItem) {
      if (inList !== "ul") {
        closeList();
        out.push(`<ul class="mt-4 space-y-2.5 text-sm md:text-base">`);
        inList = "ul";
      }
      out.push(
        `<li class="flex items-start gap-3">` +
        `<span class="w-1.5 h-1.5 rounded-full bg-primary mt-2.5 flex-shrink-0"></span>` +
        `<span class="text-on-surface/85 leading-relaxed">${inline(ulItem[1])}</span></li>`
      );
      continue;
    }

    const olItem = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (olItem) {
      if (inList !== "ol") {
        closeList();
        out.push(`<ol class="mt-4 space-y-2.5 text-sm md:text-base">`);
        inList = "ol";
      }
      out.push(
        `<li class="flex items-start gap-3">` +
        `<span class="text-primary font-mono text-sm font-bold mt-0.5 flex-shrink-0">${olItem[1]}.</span>` +
        `<span class="text-on-surface/85 leading-relaxed">${inline(olItem[2])}</span></li>`
      );
      continue;
    }

    if (line.trim() === "") {
      closeList();
      continue;
    }

    closeList();
    out.push(`<p class="text-base text-on-surface/85 leading-relaxed">${inline(line)}</p>`);
  }

  closeList();
  if (inCode) out.push("</div></div>");
  return out.join("\n");
}

function inline(text: string): string {
  let result = escapeHtml(text);
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a class="text-primary hover:underline font-medium" href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  result = result.replace(
    /`([^`]+)`/g,
    '<code class="font-mono text-xs text-primary bg-surface-container px-1.5 py-0.5 rounded">$1</code>'
  );
  return result;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
