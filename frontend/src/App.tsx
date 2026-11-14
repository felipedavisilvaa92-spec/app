import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { setDataShop, initializeShopStock } from "@/lib/api";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Estoque from "@/pages/Estoque";
import Historico from "@/pages/Historico";
import Pedidos from "@/pages/Pedidos";
import Team from "@/pages/Team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function AccessGate() {
  const [user, setUser] = useState<any>(null);
  const [shop, setShop] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async (sessionUser: any) => {
    setUser(sessionUser);
    if (!sessionUser) {
      setShop(null);
      setDataShop(null);
      setLoading(false);
      return;
    }

    const { data, error: shopError } = await supabase.rpc("get_my_shop");
    if (shopError) setError(shopError.message);
    const membership = Array.isArray(data) ? data[0] : data;
    setShop(membership ?? null);
    setDataShop(membership?.shop_id ?? null);
    setLoading(false);
  };

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => refresh(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoading(true);
      void refresh(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const authSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    // Fail explicitly and visibly rather than sending credentials to placeholder values.
    if (!supabaseConfigured) {
      setError("A configuração do Supabase está incompleta. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente de deploy e publique novamente.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    if (!email || !password) {
      setError("Informe o e-mail e a senha para continuar.");
      return;
    }

    setBusy(true);
    try {
      // Invoke Supabase Auth directly from the form submission handler.
      const result = signup
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) {
        setError(result.error.message);
        return;
      }
      if (signup && !result.data.session) {
        setError("Conta criada. Confirme seu e-mail e depois entre para continuar.");
        return;
      }
      await refresh(result.data.user);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Não foi possível conectar ao Supabase.");
    } finally {
      setBusy(false);
    }
  };

  const createShop = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data, error: createError } = await supabase.rpc("create_my_shop", { p_name: name.trim() });
      if (createError) {
        setError(createError.message);
        return;
      }
      await initializeShopStock(data);
      await refresh(user);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Erro ao preparar o estoque da loja.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="grid min-h-svh place-items-center text-muted-foreground">Carregando…</div>;

  if (!user) {
    return (
      <div className="grid min-h-svh place-items-center bg-slate-50 p-4">
        <form onSubmit={authSubmit} noValidate className="w-full max-w-sm space-y-5 rounded-xl border bg-white p-7 shadow-sm">
          <div>
            <h1 className="font-heading text-2xl font-bold">Estoque</h1>
            <p className="text-sm text-muted-foreground">{signup ? "Crie sua conta" : "Entre na sua conta"}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" minLength={6} autoComplete={signup ? "new-password" : "current-password"} />
          </div>
          {error && <div role="alert" aria-live="assertive" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Aguarde…" : signup ? "Criar conta" : "Entrar"}
          </Button>
          <button type="button" className="w-full text-sm underline" onClick={() => { setSignup(!signup); setError(""); }}>
            {signup ? "Já tenho conta — entrar" : "Criar uma conta"}
          </button>
        </form>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="grid min-h-svh place-items-center bg-slate-50 p-4">
        <form onSubmit={createShop} className="w-full max-w-md space-y-5 rounded-xl border bg-white p-7 shadow-sm">
          <h1 className="font-heading text-2xl font-bold">Criar Minha Loja</h1>
          <p className="text-sm text-muted-foreground">Seu e-mail ainda não está autorizado em outra loja. Crie uma loja para começar.</p>
          <div className="space-y-2">
            <Label htmlFor="shop-name">Nome da Loja</Label>
            <Input id="shop-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
          </div>
          {error && <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Criando…" : "Criar loja como Dono"}</Button>
          <Button type="button" variant="outline" className="w-full" onClick={() => void supabase.auth.signOut()}>Sair</Button>
        </form>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<Layout userEmail={user.email} isOwner={shop.role === "owner"} shopName={shop.shop_name} />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/estoque" element={<Estoque />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/historico" element={<Historico />} />
        <Route path="/equipe" element={shop.role === "owner" ? <Team /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return <AccessGate />;
}
