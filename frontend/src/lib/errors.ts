// Erro com status + corpo no formato FastAPI ({ detail }), usado pela camada local de dados.
// Fields are declared, not constructor parameter properties (erasableSyntaxOnly).
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function fail(status: number, detail: string): never {
  throw new ApiError(status, { detail });
}
