// description: Tests del cliente HTTP con fetch simulado: éxito y error 400.
// context: Criterio de B-004.3; valida el contrato sin tocar el backend.

import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, uploadPiece } from "./api-client";

const PIECE_RESPONSE = {
  id: "abc123",
  filename: "fur_elise.mid",
  stored_filename: "abc123",
  size_bytes: 1234,
  extension: ".mid",
  status: "uploaded",
  source: "upload",
  deduplicated: false,
  metadata: {
    tracks: 1,
    duration_seconds: null,
    tempo: null,
    notes_count: null,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadPiece", () => {
  it("devuelve los metadatos cuando el backend responde 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(PIECE_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array([1, 2, 3])], "fur_elise.mid");
    const piece = await uploadPiece(file);

    expect(piece).toEqual(PIECE_RESPONSE);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/pieces$/);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);

    const form = init.body as FormData;
    const sent = form.get("file") as File;
    expect(sent.name).toBe("fur_elise.mid");
  });

  it("entrega el code y message originales del backend en un 400", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: { code: "invalid_extension", message: "Extensiones permitidas: .mid, .midi" },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array([1])], "notas.txt");

    await expect(uploadPiece(file)).rejects.toMatchObject({
      name: "ApiError",
      code: "invalid_extension",
      message: "Extensiones permitidas: .mid, .midi",
      status: 400,
    });
    await expect(uploadPiece(file)).rejects.toBeInstanceOf(ApiError);
  });

  it("convierte la caída del servicio en un error controlado", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array([1])], "fur_elise.mid");

    await expect(uploadPiece(file)).rejects.toMatchObject({
      code: "network_error",
      status: null,
    });
  });
});
