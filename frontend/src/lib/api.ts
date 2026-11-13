// Camada de dados tipada. Sem servidor: cada chamada é atendida pelo banco local
// (src/lib/localdb.ts), que grava tudo no LocalStorage deste navegador. As páginas
// continuam usando apiGet/apiPost/... com os mesmos caminhos de antes.
import { handle } from "@/lib/localdb";

export { ApiError } from "@/lib/errors";

type JsonBody = unknown;

async function request<T>(method: string, path: string, body?: JsonBody): Promise<T> {
  // async: erros viram Promise rejeitada, como num fetch — onError do react-query segue funcionando
  return handle(method, path, body) as T;
}

export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: JsonBody) => request<T>("POST", path, body ?? null);
export const apiPut = <T>(path: string, body?: JsonBody) => request<T>("PUT", path, body ?? null);
export const apiPatch = <T>(path: string, body?: JsonBody) => request<T>("PATCH", path, body ?? null);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);
