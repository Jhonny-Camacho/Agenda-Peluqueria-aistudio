import { useEffect, useMemo, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, FormEvent, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { esES } from '@clerk/localizations';
import {
  Activity, ArrowLeft, ArrowRight, Bell, CalendarDays, Check, CheckCircle2,
  CircleAlert, Clock3, LockKeyhole, LogOut, Package, Plus, Scissors, ShieldCheck,
  Sparkles, Trash2, Users, Volume2, VolumeX, X,
} from 'lucide-react';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import {
  useHealthCheck, useListServices, useListStylists, useGetAvailability, useCreatePublicBooking,
  useGetStaffSession, useGetDashboard, useListAppointments, useCreateStaffBooking,
  useUpdateAppointment, useListBlocks, useCreateBlock, useDeleteBlock, useListInventory,
  useCreateInventoryItem, useUpdateInventoryItem, useListTeam, useAddTeamMember,
  useRemoveTeamMember, useListStaffStylists, useUpdateStylistSchedule,
  getHealthCheckQueryKey, getListServicesQueryKey, getListStylistsQueryKey,
  getGetAvailabilityQueryKey, getGetStaffSessionQueryKey, getGetDashboardQueryKey,
  getListAppointmentsQueryKey, getListBlocksQueryKey, getListInventoryQueryKey,
  getListTeamQueryKey, getListStaffStylistsQueryKey,
} from '@workspace/api-client-react';
import type {
  Appointment, InventoryItem, InventoryItemInput, Stylist, TeamMember, WorkHour,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15000 } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) || import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k';
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date());
const money = (n: number) => new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(n);
const humanDate = (date: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Intl.DateTimeFormat('es-BO', { ...options, timeZone: 'America/La_Paz' }).format(new Date(`${date}T12:00:00Z`));
const statusName = (status: string) => ({ pending: 'Pendiente', attended: 'Atendida', cancelled: 'Cancelada' } as Record<string, string>)[status] || status;
const sourceName = (source: string) => ({ online: 'Reserva web', whatsapp: 'WhatsApp', phone: 'Teléfono', walkin: 'En el local' } as Record<string, string>)[source] || source;

function Button({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return <button className={`btn ${className}`} {...props}>{children}</button>;
}
function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="block"><span className="field-label">{label}</span><input className="field" {...props} /></label>;
}
function SelectField({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return <label className="block"><span className="field-label">{label}</span><select className="field" {...props}>{children}</select></label>;
}
function Brand({ small = false }: { small?: boolean }) {
  return <div className="flex items-center gap-3"><div className="brand-mark"><Scissors size={19} strokeWidth={1.8} /></div><div><div className={`serif font-semibold tracking-tight ${small ? 'text-[17px]' : 'text-[20px]'}`}>Casa Oliva</div>{!small && <div className="text-[10px] uppercase tracking-[.18em] text-[#9eaa9e]">Peluquería de barrio</div>}</div></div>;
}
function Message({ kind = 'error', children, onRetry }: { kind?: 'error' | 'empty' | 'success'; children: ReactNode; onRetry?: () => void }) {
  const Icon = kind === 'success' ? CheckCircle2 : kind === 'empty' ? Sparkles : CircleAlert;
  return <div className={`panel flex items-center gap-3 p-5 ${kind === 'error' ? 'text-[#8f423d]' : 'text-[#536c59]'}`} role={kind === 'error' ? 'alert' : 'status'} data-testid={`state-${kind}`}>
    <Icon size={19} /><div className="flex-1 text-sm">{children}</div>{onRetry && <Button className="btn-outline" onClick={onRetry}>Reintentar</Button>}
  </div>;
}
function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3" aria-label="Cargando"><div className="h-6 w-40 animate-pulse rounded bg-[#e8e4da]" />{Array.from({ length: rows }, (_, i) => <div key={i} className="h-[66px] animate-pulse rounded-xl bg-[#ece8de]" />)}</div>;
}
function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return <div className="overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><section className="dialog" role="dialog" aria-modal="true" aria-label={title}>
    <div className="mb-5 flex items-start justify-between gap-4"><div><div className="text-[10px] uppercase tracking-[.18em] text-[#879188]">Casa Oliva · equipo</div><h2 className="serif mt-1 text-[26px] text-[#294338]">{title}</h2></div><button data-testid="button-close-dialog" onClick={close} className="rounded-full p-2 text-[#738076] hover:bg-[#eee9df]" aria-label="Cerrar"><X size={18} /></button></div>{children}
  </section></div>;
}
function Toast({ text, close }: { text: string; close: () => void }) {
  useEffect(() => { const t = window.setTimeout(close, 4200); return () => window.clearTimeout(t); }, [text, close]);
  return <div className="fixed bottom-5 right-5 z-[80] flex max-w-[calc(100vw-40px)] items-center gap-3 rounded-xl bg-[#28463a] px-4 py-3 text-sm font-medium text-[#fff9ee] shadow-xl" role="status" data-testid="status-toast"><CheckCircle2 size={17} />{text}<button onClick={close} aria-label="Cerrar aviso"><X size={15} /></button></div>;
}

function PublicHome() {
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const servicesQuery = useListServices({ query: { queryKey: getListServicesQueryKey() } });
  const stylistsQuery = useListStylists({ query: { queryKey: getListStylistsQueryKey() } });
  const services = servicesQuery.data ?? [];
  const stylists = stylistsQuery.data ?? [];
  const [serviceId, setServiceId] = useState('');
  const [stylistId, setStylistId] = useState('');
  const [date, setDate] = useState(today());
  const [slot, setSlot] = useState('');
  const [submitted, setSubmitted] = useState<Appointment | null>(null);
  const [error, setError] = useState('');
  const service = services.find(s => s.id === Number(serviceId));
  const stylist = stylists.find(s => s.id === Number(stylistId));
  const availParams = { date, serviceId: Number(serviceId), stylistId: Number(stylistId) };
  const availability = useGetAvailability(availParams, { query: { enabled: !!(serviceId && stylistId && date), queryKey: getGetAvailabilityQueryKey(availParams) } });
  const booking = useCreatePublicBooking();
  const q = useQueryClient();
  const pending = servicesQuery.isLoading || stylistsQuery.isLoading;
  const failed = servicesQuery.isError || stylistsQuery.isError;
  const book = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError('');
    const form = new FormData(e.currentTarget);
    booking.mutate({ data: { clientName: String(form.get('name')), phone: String(form.get('phone')), serviceId: Number(serviceId), stylistId: Number(stylistId), date, startTime: slot } }, {
      onSuccess: result => { setSubmitted(result); void q.invalidateQueries({ queryKey: getGetAvailabilityQueryKey() }); },
      onError: () => setError('No hemos podido confirmar esta cita. El horario puede haberse ocupado; vuelve a elegir otro.'),
    });
  };
  if (submitted) return <div className="min-h-[100dvh] bg-[#f6f2e8] px-5 py-12"><div className="mx-auto max-w-[760px]">
    <Brand /><div className="panel mt-12 overflow-hidden"><div className="bg-[#28463a] px-8 py-10 text-[#fff8e9] sm:px-12"><div className="mb-5 grid h-12 w-12 place-items-center rounded-full bg-[#d4a36e] text-[#28463a]"><Check size={24} /></div><div className="text-xs uppercase tracking-[.2em] text-[#d8c5a9]">Reserva confirmada</div><h1 className="serif mt-3 text-4xl">Te esperamos, {submitted.clientName.split(' ')[0]}.</h1><p className="mt-3 max-w-md text-sm leading-6 text-[#d5ded5]">Tu cita está guardada. Hemos reservado este momento solo para ti.</p></div><div className="grid gap-5 p-8 sm:grid-cols-3"><div><div className="field-label">Servicio</div><div className="font-semibold">{submitted.serviceName}</div></div><div><div className="field-label">Con</div><div className="font-semibold">{submitted.stylistName}</div></div><div><div className="field-label">Día y hora</div><div className="font-semibold">{humanDate(submitted.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {submitted.startTime}</div></div></div></div>
    <Link href="/" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#496454]"><ArrowLeft size={16} />Volver a la peluquería</Link></div></div>;
  return <main className="min-h-[100dvh] bg-[#f6f2e8] text-[#263d34]">
    <header className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-5 sm:px-10"><Brand /><div className="flex items-center gap-3"><span className="hidden items-center gap-2 text-xs text-[#758277] sm:flex"><span className={`h-2 w-2 rounded-full ${health.isError ? 'bg-[#c66b57]' : 'bg-[#76a17b]'}`} />Reserva online disponible</span><Link href="/agenda" className="btn btn-outline !py-2 !text-xs">Área del equipo <ArrowRight size={14} /></Link></div></header>
    <section className="mx-auto grid max-w-[1280px] gap-10 px-5 pb-16 pt-4 lg:grid-cols-[.95fr_1.05fr] lg:items-center lg:px-10 lg:pt-10">
      <div className="fade-in pb-3"><div className="mb-5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] text-[#a5754f]"><span className="h-px w-8 bg-[#c29568]" />Tu pausa, a tu manera</div><h1 className="serif max-w-[610px] text-[48px] leading-[1.07] tracking-[-.035em] text-[#294338] sm:text-[64px]">Un buen día<br />empieza <i className="font-medium text-[#bb8059]">por el pelo.</i></h1><p className="mt-6 max-w-[450px] text-[15px] leading-7 text-[#68766c]">Un espacio de confianza, manos expertas y tiempo para ti. Elige tu momento y nosotros nos ocupamos del resto.</p><div className="mt-8 flex items-center gap-3 text-xs text-[#66766c]"><div className="flex -space-x-2"><span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#f6f2e8] bg-[#d8b394] text-[10px] font-bold">CO</span><span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#f6f2e8] bg-[#95a98e] text-[10px] font-bold text-white">+</span></div><span>Un equipo pequeño, que ya te conoce.</span></div></div>
      <div className="panel fade-in p-5 sm:p-8" style={{ animationDelay: '80ms' }}><div className="mb-6 flex items-start justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.2em] text-[#ad7a55]">Reserva en 1 minuto</div><h2 className="serif mt-1 text-2xl text-[#294338]">Busca tu cita</h2></div><div className="rounded-full bg-[#f2e9db] p-3 text-[#a77952]"><CalendarDays size={19} /></div></div>
        {pending ? <Skeleton rows={4} /> : failed ? <Message onRetry={() => { void servicesQuery.refetch(); void stylistsQuery.refetch(); }}>No pudimos cargar los servicios ahora mismo.</Message> : services.length === 0 ? <Message kind="empty">Estamos preparando nuestra carta de servicios. Vuelve pronto.</Message> : <form onSubmit={book} className="space-y-4">
          <SelectField label="¿Qué te apetece?" value={serviceId} required data-testid="select-service" onChange={e => { setServiceId(e.target.value); setSlot(''); }}><option value="">Selecciona un servicio</option>{services.filter(x => x.active).map(x => <option key={x.id} value={x.id}>{x.name} · {x.durationMinutes} min · {money(x.price)}</option>)}</SelectField>
          {service && <p className="-mt-2 text-xs leading-5 text-[#7d887d]">{service.description}</p>}
          <SelectField label="¿Con quién?" value={stylistId} required data-testid="select-stylist" onChange={e => { setStylistId(e.target.value); setSlot(''); }}><option value="">Elige peluquero/a</option>{stylists.filter(x => x.active).map(x => <option key={x.id} value={x.id}>{x.name} · {x.title}</option>)}</SelectField>
          <Field label="Elige el día" type="date" value={date} min={today()} required data-testid="input-booking-date" onChange={e => { setDate(e.target.value); setSlot(''); }} />
          {serviceId && stylistId && date && <div><div className="field-label">Horarios disponibles</div>{availability.isLoading ? <div className="flex gap-2">{[1,2,3,4].map(x => <div key={x} className="h-9 w-16 animate-pulse rounded-lg bg-[#ece8de]" />)}</div> : availability.isError ? <div className="text-xs text-[#994d43]">No se han podido consultar los horarios. Inténtalo de nuevo.</div> : availability.data?.slots.length ? <div className="flex flex-wrap gap-2">{availability.data.slots.map(s => <button type="button" key={s.startTime} onClick={() => setSlot(s.startTime)} data-testid={`slot-${s.startTime}`} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${slot === s.startTime ? 'border-[#28463a] bg-[#28463a] text-white' : 'border-[#ddd8cc] bg-[#fffdf9] text-[#40574a] hover:border-[#9cab94]'}`}>{s.startTime}</button>)}</div> : <div className="rounded-lg bg-[#f4eee3] p-3 text-xs text-[#788176]">No hay horarios libres ese día. Prueba otra fecha.</div>}</div>}
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Tu nombre" name="name" required minLength={2} maxLength={120} placeholder="Nombre y apellidos" data-testid="input-client-name" /><Field label="Teléfono" name="phone" type="tel" required minLength={6} maxLength={40} placeholder="+591 700 00001" data-testid="input-client-phone" /></div>
          {error && <p className="text-sm text-[#a3463d]" role="alert" data-testid="status-booking-error">{error}</p>}
          <Button type="submit" className="btn-primary w-full !py-3.5" disabled={!slot || booking.isPending} data-testid="button-confirm-booking">{booking.isPending ? 'Confirmando tu cita…' : <>Confirmar reserva <ArrowRight size={16} /></>}</Button>
          <p className="text-center text-[11px] text-[#858d81]">Sin cuenta, sin compromiso. Te confirmamos al instante.</p>
        </form>}
      </div>
    </section>
    <section className="border-y border-[#e4ded2] bg-[#eee8dc]"><div className="mx-auto grid max-w-[1280px] gap-7 px-5 py-8 sm:grid-cols-3 sm:px-10"><div className="flex items-center gap-3"><Scissors size={18} className="text-[#a77952]" /><div><div className="font-semibold text-[#304a3c]">A tu ritmo</div><div className="text-xs text-[#768075]">Tiempo dedicado, sin prisas.</div></div></div><div className="flex items-center gap-3"><ShieldCheck size={18} className="text-[#a77952]" /><div><div className="font-semibold text-[#304a3c]">Reserva segura</div><div className="text-xs text-[#768075]">Tu cita queda confirmada al momento.</div></div></div><div className="flex items-center gap-3"><Clock3 size={18} className="text-[#a77952]" /><div><div className="font-semibold text-[#304a3c]">Estamos cerca</div><div className="text-xs text-[#768075]">Una peluquería de barrio, para ti.</div></div></div></div></section>
    <footer className="mx-auto flex max-w-[1280px] flex-wrap justify-between gap-4 px-5 py-7 text-xs text-[#7e897e] sm:px-10"><span>Casa Oliva · Peluquería con calma</span><span>Reserva sin crear una cuenta</span></footer>
  </main>;
}

function StaffShell({ member, children }: { member: TeamMember; children: ReactNode }) {
  const [path] = useLocation();
  const { signOut } = useClerk();
  const nav = [{ href: '/agenda', label: 'Agenda del día', icon: CalendarDays }, { href: '/inventario', label: 'Inventario', icon: Package }, { href: '/equipo', label: 'Equipo', icon: Users }];
  return <div className="shell-grid bg-[#f6f2e8]">
    <aside className="sidebar sticky top-0 flex h-[100dvh] flex-col bg-[#1e392e] px-5 py-6 text-[#f8f3e8]"><div className="px-2"><Brand /></div><div className="mt-9 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-[#89998d]">Espacio de trabajo</div><nav className="mt-3 space-y-1">{nav.map(n => <Link key={n.href} href={n.href} className={`nav-link ${path === n.href ? 'active' : ''}`} data-testid={`link-${n.href.slice(1)}`}><n.icon size={17} />{n.label}{path === n.href && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#d5a36f]" />}</Link>)}</nav><div className="mt-auto rounded-xl border border-[#466051] bg-[#29483b] p-4"><div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[.16em] text-[#b5c2b5]"><Activity size={13} />Equipo conectado</div><div className="text-sm font-semibold">{member.name}</div><div className="mt-1 text-xs text-[#b8c6bb]">{member.role === 'owner' ? 'Dueño' : 'Operario/a'}</div><button onClick={() => void signOut({ redirectUrl: '/' })} data-testid="button-sign-out" className="mt-4 flex items-center gap-2 text-xs text-[#d5dfd4] hover:text-white"><LogOut size={14} />Cerrar sesión</button></div><div className="mt-5 flex items-center gap-2 px-2 text-[10px] text-[#9eaea1]"><span className="h-2 w-2 rounded-full bg-[#a5c799]" />Datos sincronizados</div></aside>
    <div className="min-w-0"><header className="flex h-[70px] items-center justify-between border-b border-[#e4ded2] bg-[#fbf8f0] px-5 sm:px-9"><div className="flex items-center gap-2 text-xs text-[#748176]"><span>Casa Oliva</span><span>/</span><span className="font-semibold text-[#2c4438]">{nav.find(n => n.href === path)?.label}</span></div><span className="flex items-center gap-2 rounded-full bg-[#edf1e8] px-3 py-1.5 text-[11px] font-semibold text-[#56705b]"><span className="h-1.5 w-1.5 rounded-full bg-[#77a076]" />En línea</span></header><main className="app-content mx-auto max-w-[1420px] p-6 sm:p-9">{children}</main></div>
    <nav className="mobile-nav fixed inset-x-0 bottom-0 z-30 hidden justify-around border-t border-[#d9d6ca] bg-[#fbf8f0] px-2 py-2">{nav.map(n => <Link key={n.href} href={n.href} className={`flex min-w-[80px] flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-semibold ${path === n.href ? 'text-[#28463a]' : 'text-[#879188]'}`} data-testid={`mobile-link-${n.href.slice(1)}`}><n.icon size={19} />{n.label.split(' ')[0]}</Link>)}</nav>
  </div>;
}
function AuthGate({ children }: { children: (member: TeamMember) => ReactNode }) {
  const auth = useAuth();
  const [, setLocation] = useLocation();
  const session = useGetStaffSession({ query: { enabled: auth.isLoaded && !!auth.isSignedIn, queryKey: getGetStaffSessionQueryKey(), retry: false, staleTime: 0, refetchOnMount: 'always' } });
  if (!auth.isLoaded || (auth.isSignedIn && (session.isLoading || session.isFetching))) return <div className="min-h-[100dvh] bg-[#f6f2e8] p-6"><div className="mx-auto max-w-3xl"><Brand /><div className="panel mt-10 p-7"><Skeleton rows={4} /></div></div></div>;
  if (!auth.isSignedIn) return <div className="min-h-[100dvh] bg-[#f6f2e8] px-6 py-16"><div className="mx-auto max-w-lg text-center"><div className="flex justify-center"><Brand /></div><div className="panel mt-10 p-8"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#f1e8d9] text-[#9a714e]"><LockKeyhole size={21} /></div><h1 className="serif mt-5 text-3xl text-[#294338]">Solo para el equipo</h1><p className="mt-2 text-sm leading-6 text-[#748176]">Inicia sesión para consultar y gestionar la agenda de Casa Oliva.</p><Link href="/sign-in" className="btn btn-primary mt-6">Iniciar sesión <ArrowRight size={15} /></Link></div><Link href="/" className="mt-6 inline-block text-xs text-[#6b7d70]">Volver a la página de reservas</Link></div></div>;
  if (session.isError || !session.data) return <div className="min-h-[100dvh] bg-[#f6f2e8] px-6 py-16"><div className="mx-auto max-w-lg"><div className="panel p-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#f5e6df] text-[#a3463d]"><ShieldCheck size={22} /></div><h1 className="serif mt-5 text-3xl text-[#294338]">Acceso no autorizado</h1><p className="mt-3 text-sm leading-6 text-[#748176]">Tu cuenta ha iniciado sesión, pero no forma parte del equipo de Casa Oliva. No tienes permisos para acceder a estos datos.</p><p className="mt-2 text-xs text-[#8b9288]">Si crees que es un error, contacta con la persona propietaria.</p><button onClick={() => void auth.signOut(() => setLocation('/'))} className="btn btn-outline mt-6">Cerrar sesión</button></div></div></div>;
  return <>{children(session.data)}</>;
}
function StaffRoute({ page }: { page: 'agenda' | 'inventario' | 'equipo' }) {
  return <AuthGate>{member => <StaffShell member={member}>{page === 'agenda' ? <AgendaPage /> : page === 'inventario' ? <InventoryPage member={member} /> : <TeamPage member={member} />}</StaffShell>}</AuthGate>;
}
function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#a97853]">{eyebrow}</div><h1 className="serif text-[34px] leading-tight tracking-[-.025em] text-[#294338] sm:text-[40px]">{title}</h1><p className="mt-2 text-sm text-[#778277]">{subtitle}</p></div>{action}</div>;
}
function AgendaPage() {
  const [date, setDate] = useState(today());
  const [stylistFilter, setStylistFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [alerts, setAlerts] = useState(() => {
    try {
      return localStorage.getItem('salon-alerts') !== 'off';
    } catch {
      return true;
    }
  });
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState('');
  const [newCount, setNewCount] = useState(0);
  const previousIds = useRef<Set<number> | null>(null);
  const queryClient = useQueryClient();
  useEffect(() => {
    try {
      localStorage.setItem('salon-alerts', alerts ? 'on' : 'off');
    } catch {
      // Browser storage is optional; the alert still works for this session.
    }
  }, [alerts]);
  const params = { date };
  const filterParams = { date, ...(stylistFilter ? { stylistId: Number(stylistFilter) } : {}) };
  const dashboard = useGetDashboard(params, { query: { queryKey: getGetDashboardQueryKey(params), refetchInterval: 15000 } });
  const appointments = useListAppointments(filterParams, { query: { queryKey: getListAppointmentsQueryKey(filterParams), refetchInterval: 15000 } });
  const stylists = useListStaffStylists({ query: { queryKey: getListStaffStylistsQueryKey() } });
  const update = useUpdateAppointment();
  const listed = appointments.data ?? dashboard.data?.appointments ?? [];
  useEffect(() => {
    const online = (appointments.data ?? []).filter(a => a.source === 'online').map(a => a.id);
    if (previousIds.current) {
      const added = online.filter(id => !previousIds.current?.has(id));
      if (added.length) {
        setNewCount(n => n + added.length);
        setToast(added.length === 1 ? 'Ha llegado una nueva reserva online' : `Han llegado ${added.length} nuevas reservas online`);
        if (alerts) {
          try { const Ctx = window.AudioContext; const ctx = new Ctx(); const oscillator = ctx.createOscillator(); const gain = ctx.createGain(); oscillator.connect(gain); gain.connect(ctx.destination); oscillator.frequency.value = 740; gain.gain.value = .08; oscillator.start(); oscillator.stop(ctx.currentTime + .16); oscillator.onended = () => void ctx.close(); } catch { /* El aviso visual sigue disponible si el navegador no permite audio. */ }
        }
      }
    }
    previousIds.current = new Set(online);
  }, [appointments.data, alerts]);
  const changeStatus = (a: Appointment, status: 'attended' | 'cancelled' | 'pending') => update.mutate({ id: a.id, data: { status } }, {
    onSuccess: () => { setToast(`Cita marcada como ${statusName(status).toLowerCase()}`); void queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); },
    onError: () => setToast('No se pudo actualizar el estado de la cita'),
  });
  const visible = useMemo(() => listed.filter(a => statusFilter === 'all' || a.status === statusFilter), [listed, statusFilter]);
  const metrics = dashboard.data;
  const goDay = (delta: number) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + delta); setDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); };
  return <><PageHeading eyebrow="Planifica con calma" title="Agenda del día" subtitle="Todas las citas, en un vistazo. El equipo listo para recibir." action={<Button className="btn-primary" onClick={() => setModal(true)} data-testid="button-add-appointment"><Plus size={16} />Añadir cita</Button>} />
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#eae5d9] p-3"><div className="flex items-center gap-2"><button onClick={() => goDay(-1)} className="rounded-lg p-2 hover:bg-[#ded8ca]" aria-label="Día anterior" data-testid="button-previous-day"><ArrowLeft size={17} /></button><label className="relative"><span className="sr-only">Fecha de agenda</span><input type="date" className="field !w-auto !border-transparent !bg-transparent !py-2 font-semibold" value={date} onChange={e => setDate(e.target.value)} data-testid="input-agenda-date" /></label><button onClick={() => goDay(1)} className="rounded-lg p-2 hover:bg-[#ded8ca]" aria-label="Día siguiente" data-testid="button-next-day"><ArrowRight size={17} /></button><span className="hidden border-l border-[#d2cbbc] pl-4 text-sm font-semibold capitalize text-[#40574a] sm:block">{humanDate(date)}</span></div>
      <div className="flex flex-wrap items-center gap-2"><select className="field !w-auto !py-2 text-xs" value={stylistFilter} onChange={e => setStylistFilter(e.target.value)} data-testid="select-filter-stylist"><option value="">Todo el equipo</option>{(stylists.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button onClick={() => { setAlerts(!alerts); setToast(!alerts ? 'Avisos de nuevas reservas activados' : 'Avisos desactivados'); }} className={`btn !px-3 !py-2 ${alerts ? 'btn-primary' : 'btn-outline'}`} aria-pressed={alerts} data-testid="button-toggle-alerts">{alerts ? <Volume2 size={15} /> : <VolumeX size={15} />}{alerts ? 'Avisos activos' : 'Activar avisos'}</button></div></div>
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      { label: 'Citas de hoy', number: metrics?.totalAppointments, icon: CalendarDays, tint: 'bg-[#e8efe6] text-[#58735a]' },
      { label: 'Por atender', number: metrics?.pendingAppointments, icon: Clock3, tint: 'bg-[#f4ecdc] text-[#987245]' },
      { label: 'Atendidas', number: metrics?.attendedAppointments, icon: CheckCircle2, tint: 'bg-[#e4eee8] text-[#47765d]' },
      { label: 'Nuevas online', number: metrics?.newOnlineBookings, icon: Bell, tint: 'bg-[#f3e5dc] text-[#ad7256]' },
    ].map((item, i) => <div className="panel flex items-center gap-4 p-4" key={item.label} data-testid={`metric-${i}`}><div className={`grid h-10 w-10 place-items-center rounded-xl ${item.tint}`}><item.icon size={18} /></div><div><div className="text-[11px] font-semibold text-[#788277]">{item.label}</div><div className="mt-0.5 text-[24px] font-bold leading-none text-[#2a4338]">{dashboard.isLoading ? '—' : item.number ?? 0}</div></div></div>)}</div>
    {newCount > 0 && <div className="mb-4 flex items-center justify-between rounded-xl border border-[#ead4b5] bg-[#f7efdf] p-3 text-sm text-[#785c36]" data-testid="status-new-booking"><span className="flex items-center gap-2"><Bell size={16} />{newCount} {newCount === 1 ? 'nueva reserva detectada' : 'nuevas reservas detectadas'} desde que abriste la agenda.</span><button className="text-xs font-bold underline" onClick={() => setNewCount(0)}>Entendido</button></div>}
    <section className="panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eee9df] px-5 py-4 sm:px-6"><div><h2 className="serif text-[21px] text-[#294338]">Citas · <span className="capitalize">{humanDate(date, { weekday:'short', day:'numeric', month:'long' })}</span></h2><div className="mt-1 text-xs text-[#879087]">{visible.length} {visible.length === 1 ? 'cita visible' : 'citas visibles'} · Actualización cada 15 s</div></div><select className="field !w-auto !py-2 text-xs" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} data-testid="select-filter-status"><option value="all">Todos los estados</option><option value="pending">Pendientes</option><option value="attended">Atendidas</option><option value="cancelled">Canceladas</option></select></div>
      {appointments.isLoading ? <div className="p-5"><Skeleton rows={4} /></div> : appointments.isError ? <div className="p-5"><Message onRetry={() => void appointments.refetch()}>No se ha podido cargar la agenda de este día.</Message></div> : visible.length === 0 ? <div className="p-8"><Message kind="empty">{listed.length ? 'No hay citas con este filtro.' : 'Todavía no hay citas para este día. Puedes añadir una por teléfono, WhatsApp o en persona.'}</Message></div> :
        <div>{visible.slice().sort((a,b) => a.startTime.localeCompare(b.startTime)).map(a => <AppointmentRow key={a.id} appointment={a} onStatus={changeStatus} busy={update.isPending} />)}</div>}
    </section>
    {modal && <StaffBookingModal date={date} stylists={stylists.data ?? []} close={() => setModal(false)} notify={setToast} />}
    {toast && <Toast text={toast} close={() => setToast('')} />}
  </>;
}
function AppointmentRow({ appointment: a, onStatus, busy }: { appointment: Appointment; onStatus: (a: Appointment, status: 'attended'|'cancelled'|'pending') => void; busy: boolean }) {
  return <article className="table-row grid gap-3 px-5 py-4 sm:grid-cols-[86px_minmax(0,1fr)_160px_150px] sm:items-center sm:px-6" data-testid={`appointment-${a.id}`}>
    <div className="flex items-center gap-2 sm:block"><span className="text-[19px] font-bold tracking-tight text-[#30493c]">{a.startTime}</span><span className="text-xs text-[#8a9188] sm:mt-0.5 sm:block">{a.endTime}</span></div>
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><div className="font-semibold text-[#30493c]" data-testid={`text-client-${a.id}`}>{a.clientName}</div><span className={`tag status-${a.status}`} data-testid={`status-appointment-${a.id}`}>{statusName(a.status)}</span></div><div className="mt-1 text-xs text-[#788277]">{a.serviceName} <span className="mx-1 text-[#c4bfb1]">·</span> {a.stylistName}</div></div>
    <div className="flex items-center gap-2 text-[11px] text-[#7b877c]"><span className={`h-1.5 w-1.5 rounded-full ${a.source === 'online' ? 'bg-[#bd8a5d]' : 'bg-[#7b9b79]'}`} />{sourceName(a.source)}</div>
    <div className="flex gap-2 sm:justify-end">{a.status === 'pending' ? <><Button className="btn-secondary !px-3 !py-2 !text-[11px]" disabled={busy} onClick={() => onStatus(a,'attended')} data-testid={`button-attend-${a.id}`}><Check size={14} />Atendida</Button><Button className="btn-outline !px-3 !py-2 !text-[11px]" disabled={busy} onClick={() => onStatus(a,'cancelled')} data-testid={`button-cancel-${a.id}`}>Cancelar</Button></> : a.status === 'cancelled' ? <Button className="btn-outline !px-3 !py-2 !text-[11px]" disabled={busy} onClick={() => onStatus(a,'pending')} data-testid={`button-restore-${a.id}`}>Reabrir cita</Button> : <span className="text-xs text-[#789079]">Cita completada</span>}</div>
  </article>;
}
function StaffBookingModal({ date, stylists, close, notify }: { date: string; stylists: Stylist[]; close: () => void; notify: (s:string) => void }) {
  const q = useQueryClient();
  const services = useListServices({ query: { queryKey: getListServicesQueryKey() } });
  const create = useCreateStaffBooking();
  const [error,setError] = useState('');
  const [serviceId,setServiceId] = useState('');
  const [stylistId,setStylistId] = useState('');
  const [bookDate,setBookDate] = useState(date);
  const availParams = { date: bookDate, serviceId: Number(serviceId), stylistId: Number(stylistId) };
  const avail = useGetAvailability(availParams,{query:{enabled:!!(bookDate&&serviceId&&stylistId),queryKey:getGetAvailabilityQueryKey(availParams)}});
  const submit = (e:FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError(''); const d = new FormData(e.currentTarget);
    create.mutate({data:{clientName:String(d.get('client')),phone:String(d.get('phone')),serviceId:Number(serviceId),stylistId:Number(stylistId),date:bookDate,startTime:String(d.get('time')),source:String(d.get('source')) as 'whatsapp'|'phone'|'walkin'}},{
      onSuccess:()=>{void q.invalidateQueries({queryKey:getListAppointmentsQueryKey()});void q.invalidateQueries({queryKey:getGetDashboardQueryKey()});close();notify('Cita añadida a la agenda');},
      onError:()=>setError('No se pudo guardar la cita. Revisa el horario y vuelve a intentarlo.'),
    });
  };
  return <Modal title="Añadir una cita" close={close}><form onSubmit={submit} className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Nombre del cliente" name="client" required minLength={2} placeholder="Nombre y apellidos" data-testid="input-manual-client" /><Field label="Teléfono" name="phone" type="tel" required minLength={6} placeholder="+591 700 00001" data-testid="input-manual-phone" /></div>
    <SelectField label="Servicio" required value={serviceId} onChange={e=>setServiceId(e.target.value)} data-testid="select-manual-service"><option value="">Selecciona un servicio</option>{(services.data??[]).filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name} · {s.durationMinutes} min</option>)}</SelectField>
    <SelectField label="Peluquero/a" required value={stylistId} onChange={e=>setStylistId(e.target.value)} data-testid="select-manual-stylist"><option value="">Selecciona a alguien</option>{stylists.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</SelectField>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Fecha" type="date" required value={bookDate} onChange={e=>setBookDate(e.target.value)} data-testid="input-manual-date" /><SelectField label="Origen" name="source" data-testid="select-manual-source"><option value="phone">Teléfono</option><option value="whatsapp">WhatsApp</option><option value="walkin">En el local</option></SelectField></div>
    {serviceId&&stylistId&&<SelectField label="Hora disponible" name="time" required data-testid="select-manual-time"><option value="">Selecciona hora</option>{(avail.data?.slots??[]).map(s=><option key={s.startTime} value={s.startTime}>{s.startTime}</option>)}</SelectField>}
    {avail.isError&&<p className="text-sm text-[#a3463d]">No se pudo consultar la disponibilidad.</p>}{error&&<p className="text-sm text-[#a3463d]" role="alert">{error}</p>}
    <div className="flex justify-end gap-2 pt-2"><Button type="button" className="btn-outline" onClick={close}>Volver</Button><Button type="submit" className="btn-primary" disabled={create.isPending} data-testid="button-save-manual">{create.isPending?'Guardando…':'Guardar cita'}</Button></div>
  </form></Modal>;
}

function InventoryPage({ member }: { member: TeamMember }) {
  const owner = member.role === 'owner';
  const query = useListInventory({ query: { queryKey: getListInventoryQueryKey() } });
  const q = useQueryClient();
  const create = useCreateInventoryItem();
  const update = useUpdateInventoryItem();
  const [edit,setEdit] = useState<InventoryItem|null>(null);
  const [adding,setAdding] = useState(false);
  const [toast,setToast] = useState('');
  const [search,setSearch] = useState('');
  const items = query.data ?? [];
  const filtered = items.filter(x=>`${x.name} ${x.sku}`.toLowerCase().includes(search.toLowerCase()));
  const save = (e:FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const form=new FormData(e.currentTarget);
    const data:InventoryItemInput={name:String(form.get('name')),sku:String(form.get('sku')),stock:Number(form.get('stock')),minimumStock:Number(form.get('minimumStock')),price:Number(form.get('price'))};
    const done=()=>{void q.invalidateQueries({queryKey:getListInventoryQueryKey()});setAdding(false);setEdit(null);setToast(edit?'Producto actualizado':'Producto añadido al inventario');};
    if(edit) update.mutate({id:edit.id,data},{onSuccess:done,onError:()=>setToast('No se pudo actualizar el producto')});
    else create.mutate({data},{onSuccess:done,onError:()=>setToast('No se pudo crear el producto')});
  };
  return <><PageHeading eyebrow="Lo que nos hace falta" title="Inventario" subtitle="Control sencillo del producto y el stock de la peluquería." action={owner?<Button className="btn-primary" onClick={()=>setAdding(true)} data-testid="button-add-product"><Plus size={16}/>Añadir producto</Button>:<span className="tag bg-[#edf1e8] text-[#5b725d]"><LockKeyhole size={13}/>Solo lectura</span>} />
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="text-sm text-[#748176]">{items.length} productos en el inventario</div><input className="field !w-full sm:!w-[260px]" placeholder="Buscar por nombre o SKU" value={search} onChange={e=>setSearch(e.target.value)} data-testid="input-search-inventory" /></div>
    {query.isLoading?<Skeleton rows={5}/>:query.isError?<Message onRetry={()=>void query.refetch()}>No se ha podido cargar el inventario.</Message>:items.length===0?<Message kind="empty">Todavía no hay productos en el inventario.{owner&&' Añade el primero para empezar.'}</Message>:filtered.length===0?<Message kind="empty">No encontramos productos con esa búsqueda.</Message>:
      <div className="panel overflow-hidden"><div className="hidden grid-cols-[minmax(220px,1.5fr)_1fr_110px_120px_110px_80px] gap-3 bg-[#f0ece2] px-5 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-[#788277] md:grid"><span>Producto</span><span>SKU</span><span>Stock</span><span>Precio</span><span>Actualizado</span><span></span></div>{filtered.map(item=><article key={item.id} className="table-row grid gap-2 px-5 py-4 md:grid-cols-[minmax(220px,1.5fr)_1fr_110px_120px_110px_80px] md:items-center" data-testid={`inventory-item-${item.id}`}><div><div className="font-semibold text-[#30493c]">{item.name}</div><div className="mt-1 text-xs text-[#879087] md:hidden">SKU {item.sku||'—'} · Actualizado {new Date(item.updatedAt).toLocaleDateString('es-ES')}</div></div><div className="hidden text-sm text-[#788277] md:block">{item.sku||'—'}</div><div className="flex items-center gap-2"><span className={`text-sm font-bold ${item.stock<=item.minimumStock?'text-[#a3463d]':'text-[#48634e]'}`}>{item.stock}</span><span className="text-[10px] text-[#92988d]">mín. {item.minimumStock}</span>{item.stock<=item.minimumStock&&<span className="tag status-cancelled">Reponer</span>}</div><div className="text-sm font-semibold text-[#44594b]">{money(item.price)}</div><div className="hidden text-xs text-[#92988d] md:block">{new Date(item.updatedAt).toLocaleDateString('es-ES')}</div><div>{owner&&<Button className="btn-outline !px-3 !py-2 !text-xs" onClick={()=>setEdit(item)} data-testid={`button-edit-product-${item.id}`}>Editar</Button>}</div></article>)}</div>}
    {(adding||edit)&&<Modal title={edit?'Editar producto':'Nuevo producto'} close={()=>{setAdding(false);setEdit(null);}}><form onSubmit={save} className="space-y-4"><Field label="Nombre del producto" name="name" required minLength={2} defaultValue={edit?.name??''} placeholder="Champú hidratante" data-testid="input-product-name" /><div className="grid gap-3 sm:grid-cols-2"><Field label="SKU" name="sku" defaultValue={edit?.sku??''} placeholder="CO-001" data-testid="input-product-sku" /><Field label="Precio de venta (€)" name="price" type="number" min="0" step="0.01" required defaultValue={edit?.price??''} data-testid="input-product-price" /></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Unidades disponibles" name="stock" type="number" min="0" step="1" required defaultValue={edit?.stock??''} data-testid="input-product-stock" /><Field label="Avisar cuando queden" name="minimumStock" type="number" min="0" step="1" required defaultValue={edit?.minimumStock??''} data-testid="input-product-minimum" /></div><div className="flex justify-end gap-2 pt-2"><Button type="button" className="btn-outline" onClick={()=>{setAdding(false);setEdit(null);}}>Cancelar</Button><Button className="btn-primary" disabled={create.isPending||update.isPending} data-testid="button-save-product">{create.isPending||update.isPending?'Guardando…':'Guardar producto'}</Button></div></form></Modal>}
    {toast&&<Toast text={toast} close={()=>setToast('')}/>}
  </>;
}

function TeamPage({ member }: { member: TeamMember }) {
  const owner=member.role==='owner';
  const q=useQueryClient();
  const team=useListTeam({query:{queryKey:getListTeamQueryKey()}});
  const stylists=useListStaffStylists({query:{queryKey:getListStaffStylistsQueryKey()}});
  const blockParams={date:today()};
  const blocks=useListBlocks(blockParams,{query:{queryKey:getListBlocksQueryKey(blockParams)}});
  const add=useAddTeamMember(); const remove=useRemoveTeamMember(); const updateHours=useUpdateStylistSchedule();
  const createBlock=useCreateBlock(); const deleteBlock=useDeleteBlock();
  const [addOpen,setAddOpen]=useState(false); const [blockOpen,setBlockOpen]=useState(false); const [scheduleId,setScheduleId]=useState<number|null>(null);
  const [toast,setToast]=useState('');
  const refresh=()=>{void q.invalidateQueries({queryKey:getListTeamQueryKey()});void q.invalidateQueries({queryKey:getListStaffStylistsQueryKey()});void q.invalidateQueries({queryKey:getListBlocksQueryKey()});};
  const removeMember=(m:TeamMember)=>{if(!window.confirm(`¿Dar de baja a ${m.name} del equipo?`))return;remove.mutate({id:m.id},{onSuccess:()=>{refresh();setToast(`${m.name} ya no forma parte del equipo`);},onError:()=>setToast('No se pudo dar de baja a esta persona')});};
  return <><PageHeading eyebrow="Personas y horarios" title="Equipo" subtitle="Cada persona con su ritmo, su agenda y sus pausas." action={owner?<Button className="btn-primary" onClick={()=>setAddOpen(true)} data-testid="button-add-team-member"><Plus size={16}/>Añadir persona</Button>:<span className="tag bg-[#edf1e8] text-[#5b725d]"><LockKeyhole size={13}/>Permisos de consulta</span>} />
    <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
      <section className="panel overflow-hidden"><div className="border-b border-[#eee9df] px-5 py-4"><h2 className="serif text-xl text-[#294338]">El equipo</h2><p className="mt-1 text-xs text-[#879087]">Personas con acceso al espacio</p></div>{team.isLoading?<div className="p-5"><Skeleton rows={3}/></div>:team.isError?<div className="p-5"><Message onRetry={()=>void team.refetch()}>No se ha podido cargar la lista del equipo.</Message></div>:!(team.data??[]).length?<div className="p-5"><Message kind="empty">El equipo todavía no tiene miembros.</Message></div>:(team.data??[]).map(m=><div key={m.id} className="table-row flex items-center gap-3 px-5 py-4" data-testid={`team-member-${m.id}`}><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e7ede5] text-sm font-bold text-[#58705a]">{m.name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()}</div><div className="min-w-0 flex-1"><div className="font-semibold text-[#30493c]">{m.name}{m.id===member.id&&<span className="ml-2 text-[10px] font-medium text-[#879087]">Tú</span>}</div><div className="truncate text-xs text-[#879087]">{m.email}</div></div><span className="tag bg-[#f0ece2] text-[#6b756a]">{m.role==='owner'?'Dueño':'Operario/a'}</span>{owner&&m.id!==member.id&&<button aria-label={`Dar de baja a ${m.name}`} onClick={()=>removeMember(m)} className="rounded-lg p-2 text-[#a5645c] hover:bg-[#f5e8e3]" data-testid={`button-remove-member-${m.id}`}><Trash2 size={16}/></button>}</div>)}</section>
      <section className="panel p-5"><div className="mb-4 flex items-start justify-between"><div><h2 className="serif text-xl text-[#294338]">Pausas de hoy</h2><p className="mt-1 text-xs text-[#879087]">Bloqueos que ya están en la agenda</p></div>{owner&&<Button className="btn-secondary !px-3 !py-2 !text-xs" onClick={()=>setBlockOpen(true)} data-testid="button-add-block"><Plus size={14}/>Bloquear</Button>}</div>{blocks.isLoading?<Skeleton rows={2}/>:blocks.isError?<Message onRetry={()=>void blocks.refetch()}>No se han podido cargar los bloqueos.</Message>:!(blocks.data??[]).length?<div className="rounded-xl bg-[#f3efe5] p-4 text-xs leading-5 text-[#7c867c]">No hay bloqueos registrados para hoy.</div>:(blocks.data??[]).map(b=><div key={b.id} className="mb-2 flex items-center gap-3 rounded-xl bg-[#f3efe5] p-3" data-testid={`time-block-${b.id}`}><div className="text-xs font-bold text-[#96714d]">{b.startTime}<br/>{b.endTime}</div><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-[#344b3e]">{b.stylistName}</div><div className="truncate text-xs text-[#839084]">{b.reason}</div></div>{owner&&<button className="p-1.5 text-[#9a6c59]" aria-label="Eliminar bloqueo" onClick={()=>{if(window.confirm('¿Eliminar este bloqueo?'))deleteBlock.mutate({id:b.id},{onSuccess:()=>{refresh();setToast('Bloqueo eliminado');},onError:()=>setToast('No se pudo eliminar el bloqueo')});}} data-testid={`button-delete-block-${b.id}`}><Trash2 size={15}/></button>}</div>)}</section>
    </div>
    <section className="panel mt-6 overflow-hidden"><div className="border-b border-[#eee9df] px-5 py-4"><h2 className="serif text-xl text-[#294338]">Horarios habituales</h2><p className="mt-1 text-xs text-[#879087]">Disponibilidad semanal por peluquero/a</p></div>{stylists.isLoading?<div className="p-5"><Skeleton rows={3}/></div>:stylists.isError?<div className="p-5"><Message onRetry={()=>void stylists.refetch()}>No se han podido cargar los horarios.</Message></div>:!(stylists.data??[]).length?<div className="p-5"><Message kind="empty">No hay peluqueros activos para mostrar.</Message></div>:(stylists.data??[]).map(s=><StylistSchedule key={s.id} stylist={s} owner={owner} editing={scheduleId===s.id} toggle={()=>setScheduleId(scheduleId===s.id?null:s.id)} saving={updateHours.isPending} save={(hours)=>updateHours.mutate({id:s.id,data:{workHours:hours}},{onSuccess:()=>{refresh();setScheduleId(null);setToast(`Horario de ${s.name} actualizado`);},onError:()=>setToast('No se pudo guardar el horario')})}/>)}</section>
    {addOpen&&<Modal title="Añadir operario/a" close={()=>setAddOpen(false)}><form className="space-y-4" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);add.mutate({data:{name:String(f.get('name')),email:String(f.get('email')),role:'operator'}},{onSuccess:()=>{refresh();setAddOpen(false);setToast('Operario/a añadido/a al equipo');},onError:()=>setToast('No se pudo añadir a esta persona')});}}><Field label="Nombre" name="name" required minLength={2} placeholder="Nombre y apellidos" data-testid="input-team-name"/><Field label="Correo electrónico" name="email" type="email" required placeholder="persona@correo.bo" data-testid="input-team-email"/><p className="text-xs leading-5 text-[#879087]">La persona podrá consultar la agenda y registrar citas. Los permisos de dueño quedan reservados para la cuenta principal.</p><div className="flex justify-end gap-2"><Button type="button" className="btn-outline" onClick={()=>setAddOpen(false)}>Cancelar</Button><Button className="btn-primary" disabled={add.isPending} data-testid="button-save-team">{add.isPending?'Añadiendo…':'Añadir operario/a'}</Button></div></form></Modal>}
    {blockOpen&&<Modal title="Bloquear un horario" close={()=>setBlockOpen(false)}><form className="space-y-4" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);createBlock.mutate({data:{stylistId:Number(f.get('stylist')),date:String(f.get('date')),startTime:String(f.get('start')),endTime:String(f.get('end')),reason:String(f.get('reason'))}},{onSuccess:()=>{refresh();setBlockOpen(false);setToast('Bloqueo añadido a la agenda');},onError:()=>setToast('No se pudo añadir el bloqueo')});}}><SelectField label="Peluquero/a" name="stylist" required data-testid="select-block-stylist"><option value="">Elige a una persona</option>{(stylists.data??[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</SelectField><Field label="Fecha" name="date" type="date" required defaultValue={today()} data-testid="input-block-date"/><div className="grid grid-cols-2 gap-3"><Field label="Desde" name="start" type="time" required data-testid="input-block-start"/><Field label="Hasta" name="end" type="time" required data-testid="input-block-end"/></div><Field label="Motivo" name="reason" maxLength={120} placeholder="Comida, cita personal…" data-testid="input-block-reason"/><div className="flex justify-end gap-2"><Button type="button" className="btn-outline" onClick={()=>setBlockOpen(false)}>Cancelar</Button><Button className="btn-primary" disabled={createBlock.isPending} data-testid="button-save-block">{createBlock.isPending?'Guardando…':'Añadir bloqueo'}</Button></div></form></Modal>}
    {toast&&<Toast text={toast} close={()=>setToast('')}/>}
  </>;
}
const weekdays=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
function StylistSchedule({stylist,owner,editing,toggle,saving,save}:{stylist:Stylist;owner:boolean;editing:boolean;toggle:()=>void;saving:boolean;save:(h:WorkHour[])=>void}){
  const [hours,setHours]=useState<WorkHour[]>(stylist.workHours);
  useEffect(()=>setHours(stylist.workHours),[stylist.workHours]);
  const byDay=(day:number)=>hours.find(h=>h.weekday===day);
  const setDay=(day:number,part:'start'|'end',value:string)=>setHours(curr=>{const found=curr.find(h=>h.weekday===day);if(found)return curr.map(h=>h.weekday===day?{...h,[part]:value}:h);return [...curr,{weekday:day,start:part==='start'?value:'09:00',end:part==='end'?value:'17:00'}].sort((a,b)=>a.weekday-b.weekday);});
  return <div className="table-row px-5 py-4" data-testid={`schedule-stylist-${stylist.id}`}><div className="flex flex-wrap items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-[#e9eee5] text-sm font-bold text-[#59715b]">{stylist.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</div><div className="min-w-0 flex-1"><div className="font-semibold text-[#30493c]">{stylist.name}</div><div className="text-xs text-[#879087]">{stylist.title}</div></div><span className={`tag ${stylist.active?'bg-[#e7efe7] text-[#55735b]':'bg-[#f3e9e3] text-[#996554]'}`}>{stylist.active?'Activo/a':'Inactivo/a'}</span>{owner&&<Button className="btn-outline !px-3 !py-2 !text-xs" onClick={toggle} data-testid={`button-edit-schedule-${stylist.id}`}>{editing?'Cerrar':'Editar horario'}</Button>}</div>
    {editing&&owner&&<div className="mt-4 rounded-xl bg-[#f5f1e8] p-4"><div className="space-y-2">{weekdays.map((day,i)=>{const h=byDay(i);return <div key={day} className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2"><label className="flex items-center gap-2 text-xs font-semibold text-[#52665a]"><input type="checkbox" checked={!!h} onChange={e=>{if(e.target.checked)setHours(curr=>[...curr,{weekday:i,start:'09:00',end:'17:00'}].sort((a,b)=>a.weekday-b.weekday));else setHours(curr=>curr.filter(x=>x.weekday!==i));}} data-testid={`checkbox-workday-${stylist.id}-${i}`}/>{day}</label>{h?<><input className="field !px-2 !py-1.5 text-xs" type="time" value={h.start} onChange={e=>setDay(i,'start',e.target.value)} aria-label={`${day} desde`} data-testid={`input-start-${stylist.id}-${i}`}/><input className="field !px-2 !py-1.5 text-xs" type="time" value={h.end} onChange={e=>setDay(i,'end',e.target.value)} aria-label={`${day} hasta`} data-testid={`input-end-${stylist.id}-${i}`}/></>:<span className="col-span-2 text-xs text-[#9aa096]">Descanso</span>}</div>})}</div><div className="mt-4 flex justify-end"><Button className="btn-primary !py-2" disabled={saving} onClick={()=>save(hours)} data-testid={`button-save-schedule-${stylist.id}`}>{saving?'Guardando…':'Guardar horario'}</Button></div></div>}
  </div>;
}

function AuthPages() {
  const appearance = {
    theme: 'simple' as const,
    cssLayerName: 'clerk',
    variables: { colorPrimary: '#28463a', colorForeground: '#294338', colorMutedForeground: '#718075', colorBackground: '#fbf8f0', colorInput: '#fffdf9', colorInputForeground: '#294338', colorDanger: '#a3463d', colorNeutral: '#647468', fontFamily: 'DM Sans, sans-serif', borderRadius: '12px' },
    options: { logoPlacement: 'inside' as const, logoImageUrl: `${window.location.origin}${basePath}/logo.svg`, logoLinkUrl: `${basePath}/`, socialButtonsPlacement: 'top' as const, socialButtonsVariant: 'blockButton' as const },
    elements: { cardBox: 'bg-[#fbf8f0] shadow-xl border border-[#e5dfd2] w-[440px] max-w-full', headerTitle: 'text-[#294338]', headerSubtitle: 'text-[#647468]', formFieldLabel: 'text-[#40574a]', formFieldInput: 'bg-[#fffdf9] border-[#d9d6ca] text-[#294338]', footerActionText: 'text-[#647468]', footerActionLink: 'text-[#28463a]', socialButtonsBlockButtonText: 'text-[#294338]', dividerText: 'text-[#718075]' },
  };
  return <div className="flex min-h-[100dvh] items-center justify-center bg-[#f1ece1] px-4 py-10"><div className="w-full max-w-[980px] overflow-hidden rounded-[24px] border border-[#e3ddcf] bg-[#fbf8f0] shadow-[0_25px_90px_rgba(32,53,41,.12)] md:grid md:grid-cols-[.8fr_1.2fr]"><aside className="hidden min-h-[640px] flex-col justify-between bg-[#1e392e] p-9 text-[#f8f3e8] md:flex"><Brand/><div><div className="mb-4 text-[10px] uppercase tracking-[.22em] text-[#d5a36f]">Casa Oliva · desde siempre</div><h1 className="serif text-[38px] leading-tight">Una buena relación empieza por la confianza.</h1><p className="mt-4 max-w-[280px] text-sm leading-6 text-[#c0cec1]">Acceso reservado a quienes cuidan de nuestra peluquería cada día.</p></div><div className="text-xs text-[#9caa9d]">Un equipo pequeño. Un cuidado cercano.</div></aside><div className="flex justify-center p-5 sm:p-9"><Switch><Route path="/sign-in/*?"><SignIn routing="path" path={`${basePath}/sign-in`} appearance={appearance} /></Route><Route path="/sign-up/*?"><SignUp routing="path" path={`${basePath}/sign-up`} appearance={appearance} /></Route></Switch></div></div></div>;
}
function Router() {
  return <Switch>
    <Route path="/"><HomeRedirect/></Route>
    <Route path="/agenda"><StaffRoute page="agenda"/></Route>
    <Route path="/inventario"><StaffRoute page="inventario"/></Route>
    <Route path="/equipo"><StaffRoute page="equipo"/></Route>
    <Route path="/sign-in/*?"><AuthPages/></Route>
    <Route path="/sign-up/*?"><AuthPages/></Route>
    <Route component={NotFound}/>
  </Switch>;
}
function HomeRedirect() {
  const auth = useAuth();
  if (!auth.isLoaded) {
    return <div className="min-h-[100dvh] bg-[#f6f2e8] p-6"><div className="mx-auto max-w-3xl"><Brand/><div className="panel mt-10 p-7"><Skeleton rows={3}/></div></div></div>;
  }
  return auth.isSignedIn ? <Redirect to="/agenda"/> : <PublicHome/>;
}
function ErrorFallback({resetError}:{error:Error;resetError:()=>void}) {
  return <div className="grid min-h-[100dvh] place-items-center bg-[#f6f2e8] p-6"><div className="panel max-w-md p-8 text-center"><CircleAlert className="mx-auto text-[#a3463d]" size={26}/><h1 className="serif mt-4 text-3xl text-[#294338]">Algo no ha ido como esperábamos</h1><p className="mt-3 text-sm text-[#748176]">Esta pantalla tuvo un problema. Tus datos siguen a salvo.</p><Button className="btn-primary mt-6" onClick={resetError}>Volver a intentarlo</Button></div></div>;
}
function RoutedErrorBoundary({children}:{children:ReactNode}) {
  const [location]=useLocation();
  return <ErrorBoundary resetKey={location} FallbackComponent={ErrorFallback}>{children}</ErrorBoundary>;
}
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        client.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}
function ClerkRoutes() {
  const [, setLocation] = useLocation();
  const stripBase = (path: string) =>
    basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    appearance={{variables:{colorPrimary:'#28463a',colorBackground:'#fbf8f0'}}}
    localization={esES}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <ClerkQueryClientCacheInvalidator/>
      <RoutedErrorBoundary><Router/></RoutedErrorBoundary>
    </QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  return <WouterRouter base={basePath}><ClerkRoutes/></WouterRouter>;
}
export default App;
