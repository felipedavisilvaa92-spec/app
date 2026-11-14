import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { supabase } from "@/lib/supabase";
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
  const [user,setUser]=useState<any>(null),[shop,setShop]=useState<any>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[signup,setSignup]=useState(false),[name,setName]=useState(""),[busy,setBusy]=useState(false);
  const refresh=async(sessionUser:any)=>{setUser(sessionUser); if(!sessionUser){setShop(null);setDataShop(null);setLoading(false);return;} const {data,error}=await supabase.rpc("get_my_shop"); if(error)setError(error.message); const membership=Array.isArray(data)?data[0]:data; setShop(membership??null); setDataShop(membership?.shop_id??null); setLoading(false);};
  useEffect(()=>{supabase.auth.getSession().then(({data})=>refresh(data.session?.user??null));const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{setLoading(true);void refresh(session?.user??null);});return()=>subscription.unsubscribe();},[]);
  const authSubmit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError("");const form=new FormData(e.currentTarget as HTMLFormElement);const email=String(form.get("email")).trim().toLowerCase(),password=String(form.get("password"));const result=signup?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});setBusy(false);if(result.error){setError(result.error.message);return;}if(signup&&!result.data.session){setError("Confirme seu e-mail e depois entre para continuar.");return;}await refresh(result.data.user);};
  const createShop=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError("");const {data,error}=await supabase.rpc("create_my_shop",{p_name:name.trim()});if(error){setError(error.message);setBusy(false);return;}try{await initializeShopStock(data);await refresh(user);}catch(err){setError(err instanceof Error?err.message:"Erro ao preparar estoque.");}setBusy(false);};
  if(loading)return <div className="grid min-h-svh place-items-center text-muted-foreground">Carregando…</div>;
  if(!user)return <div className="grid min-h-svh place-items-center bg-slate-50 p-4"><form onSubmit={authSubmit} className="w-full max-w-sm space-y-5 rounded-xl border bg-white p-7 shadow-sm"><div><h1 className="font-heading text-2xl font-bold">Estoque</h1><p className="text-sm text-muted-foreground">{signup?"Crie sua conta":"Entre na sua conta"}</p></div><div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div><div className="space-y-2"><Label htmlFor="password">Senha</Label><Input id="password" name="password" type="password" required minLength={6} autoComplete={signup?"new-password":"current-password"}/></div>{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}<Button className="w-full" disabled={busy}>{busy?"Aguarde…":signup?"Criar conta":"Entrar"}</Button><button type="button" className="w-full text-sm underline" onClick={()=>{setSignup(!signup);setError("")}}>{signup?"Já tenho conta — entrar":"Criar uma conta"}</button></form></div>;
  if(!shop)return <div className="grid min-h-svh place-items-center bg-slate-50 p-4"><form onSubmit={createShop} className="w-full max-w-md space-y-5 rounded-xl border bg-white p-7 shadow-sm"><h1 className="font-heading text-2xl font-bold">Criar Minha Loja</h1><p className="text-sm text-muted-foreground">Seu e-mail ainda não está autorizado em outra loja. Crie uma loja para começar.</p><div className="space-y-2"><Label htmlFor="shop-name">Nome da Loja</Label><Input id="shop-name" value={name} onChange={e=>setName(e.target.value)} required maxLength={120}/></div>{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}<Button className="w-full" disabled={busy}>{busy?"Criando…":"Criar loja como Dono"}</Button><Button type="button" variant="outline" className="w-full" onClick={()=>supabase.auth.signOut()}>Sair</Button></form></div>;
  return <Routes><Route element={<Layout userEmail={user.email} isOwner={shop.role==="owner"} shopName={shop.shop_name}/>}><Route path="/" element={<Dashboard/>}/><Route path="/estoque" element={<Estoque/>}/><Route path="/pedidos" element={<Pedidos/>}/><Route path="/historico" element={<Historico/>}/><Route path="/equipe" element={shop.role==="owner"?<Team/>:<Navigate to="/" replace/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Route></Routes>;
}
export default function App(){return <AccessGate/>;}
