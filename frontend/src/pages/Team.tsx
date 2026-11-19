import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

type AuthorizedEmail = {
  id: string;
  email: string;
  created_at: string;
};

export default function Team() {
  const [emails, setEmails] = useState<AuthorizedEmail[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error: loadError } = await supabase
      .from("authorized_emails")
      .select("id,email,created_at")
      .order("email");

    if (loadError) throw loadError;
    setEmails(data ?? []);
  };

  useEffect(() => {
    void load().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os e-mails autorizados.");
    });
  }, []);

  const authorize = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Informe um e-mail válido.");
      setBusy(false);
      return;
    }

    try {
      const { error: authorizeError } = await supabase.rpc("authorize_shop_email", {
        p_email: normalizedEmail,
      });
      if (authorizeError) throw authorizeError;

      setEmail("");
      await load();
      setSuccess("E-mail autorizado com sucesso.");
    } catch (authorizeError) {
      setError(authorizeError instanceof Error ? authorizeError.message : "Não foi possível autorizar este e-mail.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError("");
    setSuccess("");
    try {
      const { error: removeError } = await supabase.from("authorized_emails").delete().eq("id", id);
      if (removeError) throw removeError;
      await load();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Não foi possível remover este e-mail.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">Equipe / Acessos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Somente e-mails autorizados podem entrar nesta loja.</p>
      </div>

      <form onSubmit={authorize} className="space-y-3 rounded-xl border bg-white p-5">
        <div className="space-y-2">
          <Label htmlFor="authorized-email">E-mail da pessoa</Label>
          <Input
            id="authorized-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="pessoa@exemplo.com"
          />
        </div>
        {error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        {success && <p role="status" className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">{success}</p>}
        <Button type="submit" disabled={busy}>{busy ? "Autorizando…" : "Autorizar E-mail"}</Button>
      </form>

      <section className="divide-y rounded-xl border bg-white">
        {emails.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 p-4">
            <span>{item.email}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void remove(item.id)}>Remover</Button>
          </div>
        ))}
        {emails.length === 0 && <p className="p-5 text-sm text-muted-foreground">Nenhum e-mail autorizado ainda.</p>}
      </section>
    </div>
  );
}
