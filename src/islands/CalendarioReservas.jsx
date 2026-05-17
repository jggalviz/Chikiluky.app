import { useState, useMemo, useEffect } from 'preact/hooks';
import { createClient } from '@supabase/supabase-js';
import { convertirRefABs } from '../utils/currency.js';

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY
);

const DIAS_ES  = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function proximosDias(n = 7) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
}

function generarSlots(inicio = 9, fin = 19, durMin = 60) {
  const slots = [];
  for (let h = inicio; h < fin; h++) {
    const step = durMin === 30 ? [0, 30] : [0];
    step.forEach(m => {
      if (h * 60 + m < fin * 60) {
        slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
      }
    });
  }
  return slots;
}

const S = {
  card: {
    background:'#111',
    border:'1px solid rgba(186,143,87,0.2)',
    borderRadius:'0.875rem',
    padding:'1.25rem',
    marginBottom:'1.25rem',
  },
  label: {
    fontFamily:"'Urbanist',sans-serif",
    fontWeight:700,
    fontSize:'0.72rem',
    letterSpacing:'0.12em',
    textTransform:'uppercase',
    color:'#ba8f57',
    marginBottom:'0.85rem',
    display:'block',
  },
  btn: (activo) => ({
    fontFamily:"'Urbanist',sans-serif",
    fontWeight:700,
    fontSize:'0.82rem',
    padding:'0.5rem 1rem',
    borderRadius:'9999px',
    cursor:'pointer',
    border: activo ? '1px solid #ba8f57' : '1px solid rgba(186,143,87,0.25)',
    background: activo ? '#ba8f57' : 'transparent',
    color:  activo ? '#1a1a1a' : '#ba8f57',
    transition:'all 0.18s',
    whiteSpace:'nowrap',
  }),
};

export default function CalendarioReservas({ negocioId, clienteId, servicios, tasaBcvInicial = 40.00 }) {
  const [paso,          setPaso]          = useState(1);
  const [servicio,      setServicio]      = useState(null);
  const [dia,           setDia]           = useState(null);
  const [hora,          setHora]          = useState(null);
  const [horasOcupadas, setHorasOcupadas] = useState([]);
  const [tasaBcv,       setTasaBcv]       = useState(tasaBcvInicial);

  // Suscribirse a actualizaciones de la tasa BCV en tiempo real
  useEffect(() => {
    async function fetchTasa() {
      try {
        const { data, error } = await supabase
          .from('configuracion_sistema')
          .select('tasa_bcv')
          .eq('id', 1)
          .maybeSingle();

        if (error) throw error;
        if (data?.tasa_bcv) {
          setTasaBcv(parseFloat(data.tasa_bcv));
        }
      } catch (err) {
        console.error('Error al obtener tasa BCV de Supabase:', err);
      }
    }

    fetchTasa();

    const channel = supabase
      .channel('booking-config-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'configuracion_sistema',
          filter: 'id=eq.1'
        },
        (payload) => {
          if (payload.new?.tasa_bcv) {
            setTasaBcv(parseFloat(payload.new.tasa_bcv));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const dias  = useMemo(() => proximosDias(7), []);
  const slots = useMemo(
    () => generarSlots(9, 19, servicio?.duracion_min ?? 60),
    [servicio]
  );

  async function elegirDia(d) {
    setDia(d);
    setHora(null);
    setPaso(3);

    const inicio = new Date(d); inicio.setHours(0,0,0,0);
    const fin    = new Date(d); fin.setHours(23,59,59,999);

    const { data } = await supabase
      .from('citas')
      .select('start_time')
      .eq('business_id', negocioId)
      .gte('start_time', inicio.toISOString())
      .lte('start_time', fin.toISOString())
      .in('status', ['pendiente','confirmada','pendiente_pago']);

    const ocupadas = (data ?? []).map(c => {
      const t = new Date(c.start_time);
      return `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
    });
    setHorasOcupadas(ocupadas);
  }

  // ── Ir a página de pago (sin INSERT aún) ───────────────────────────────────
  function irAPago() {
    if (!servicio || !dia || !hora) return;

    const [hh, mm] = hora.split(':').map(Number);
    const startTime = new Date(dia);
    startTime.setHours(hh, mm, 0, 0);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + (servicio.duracion_min ?? 60));

    // Cálculo matemático dinámico con la tasa de cambio en vivo
    const precioBsCalculado = Math.round(parseFloat(servicio.precio_usd) * tasaBcv * 100) / 100;

    const params = new URLSearchParams({
      negocioId,
      clienteId,
      servicioNombre: servicio.nombre,
      duracion:       servicio.duracion_min ?? 60,
      precioUsd:      servicio.precio_usd,
      precioBs:       precioBsCalculado,
      startTime:      startTime.toISOString(),
      endTime:        endTime.toISOString(),
    });

    window.location.href = `/app/cliente/pago?${params.toString()}`;
  }

  return (
    <div>

      {/* ── Indicador de pasos ──────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'1.5rem' }}>
        {[1,2,3].map(n => (
          <div key={n} style={{ display:'flex', alignItems:'center', gap:'0.5rem', flex: n < 3 ? 1 : 'none' }}>
            <div style={{
              width:'28px', height:'28px', borderRadius:'50%',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:"'Urbanist',sans-serif", fontWeight:800, fontSize:'0.8rem',
              background: paso >= n ? '#ba8f57' : '#222',
              color:      paso >= n ? '#1a1a1a' : '#555',
              border:     paso >= n ? '2px solid #ba8f57' : '2px solid #333',
              transition: 'all 0.2s', flexShrink: 0,
            }}>
              {n}
            </div>
            <span style={{ fontFamily:"'Lato',sans-serif", fontSize:'0.72rem', color: paso >= n ? '#ba8f57' : '#444' }}>
              {n === 1 ? 'Servicio' : n === 2 ? 'Fecha' : 'Hora'}
            </span>
            {n < 3 && <div style={{ flex:1, height:'1px', background: paso > n ? '#ba8f57' : '#222' }} />}
          </div>
        ))}
      </div>

      {/* ── PASO 1: Servicio ──────────────────────────────────────────────── */}
      <div style={S.card}>
        <span style={S.label}>1 · Elige el servicio</span>
        {servicios.length === 0 ? (
          <p style={{ fontFamily:"'Lato',sans-serif", fontSize:'0.85rem', color:'#555' }}>
            Este salón aún no ha publicado sus servicios.
          </p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
            {servicios.map(s => (
              <button
                key={s.id}
                onClick={() => { setServicio(s); setPaso(2); setDia(null); setHora(null); }}
                style={{
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'0.85rem 1rem',
                  background: servicio?.id === s.id ? 'rgba(186,143,87,0.12)' : '#1a1a1a',
                  border: servicio?.id === s.id ? '1px solid #ba8f57' : '1px solid rgba(186,143,87,0.15)',
                  borderRadius:'0.6rem', cursor:'pointer', transition:'all 0.18s', textAlign:'left',
                }}
              >
                <div>
                  <p style={{ fontFamily:"'Urbanist',sans-serif", fontWeight:700, fontSize:'0.92rem', color:'#fff', margin:0 }}>
                    {s.nombre}
                  </p>
                  <p style={{ fontFamily:"'Lato',sans-serif", fontSize:'0.75rem', color:'#666', margin:'0.15rem 0 0' }}>
                    ⏱ {s.duracion_min ?? 60} min
                  </p>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <p style={{ fontFamily:"'Urbanist',sans-serif", fontWeight:800, fontSize:'0.95rem', color:'#ba8f57', margin:0 }}>
                    ${s.precio_usd}
                  </p>
                  <p style={{ fontFamily:"'Lato',sans-serif", fontSize:'0.68rem', color:'#777', margin:'0.12rem 0 0', textTransform:'uppercase', fontWeight:700 }}>
                    {convertirRefABs(s.precio_usd, tasaBcv)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── PASO 2: Fecha ─────────────────────────────────────────────────── */}
      {paso >= 2 && (
        <div style={S.card}>
          <span style={S.label}>2 · Elige la fecha</span>
          <div style={{ display:'flex', gap:'0.5rem', overflowX:'auto', paddingBottom:'0.25rem', scrollbarWidth:'none' }}>
            {dias.map((d, i) => {
              const activo = dia && d.toDateString() === dia.toDateString();
              return (
                <button key={i} onClick={() => elegirDia(d)} style={{
                  ...S.btn(activo),
                  flexShrink:0,
                  display:'flex', flexDirection:'column', alignItems:'center',
                  padding:'0.65rem 0.9rem', gap:'0.15rem',
                  borderRadius:'0.75rem',
                }}>
                  <span style={{ fontSize:'0.68rem', opacity:0.75 }}>{DIAS_ES[d.getDay()]}</span>
                  <span style={{ fontSize:'1.1rem', fontWeight:900 }}>{d.getDate()}</span>
                  <span style={{ fontSize:'0.65rem', opacity:0.65 }}>{MESES_ES[d.getMonth()]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── PASO 3: Hora ──────────────────────────────────────────────────── */}
      {paso >= 3 && dia && (
        <div style={S.card}>
          <span style={S.label}>3 · Elige la hora</span>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'0.5rem' }}>
            {slots.map(slot => {
              const ocupado = horasOcupadas.includes(slot);
              const activo  = hora === slot;
              return (
                <button
                  key={slot}
                  disabled={ocupado}
                  onClick={() => { if (!ocupado) setHora(slot); }}
                  style={{
                    ...S.btn(activo),
                    opacity: ocupado ? 0.28 : 1,
                    cursor:  ocupado ? 'not-allowed' : 'pointer',
                    textDecoration: ocupado ? 'line-through' : 'none',
                    fontSize:'0.8rem', padding:'0.4rem 0.85rem',
                  }}
                >
                  {slot}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Resumen ───────────────────────────────────────────────────────── */}
      {servicio && dia && hora && (
        <div style={{
          background:'rgba(186,143,87,0.06)',
          border:'1px solid rgba(186,143,87,0.3)',
          borderRadius:'0.875rem', padding:'1.25rem', marginBottom:'1rem',
        }}>
          <p style={{ fontFamily:"'Lato',sans-serif", fontSize:'0.82rem', color:'#aaa', margin:'0 0 0.25rem' }}>
            Resumen de tu cita
          </p>
          <p style={{ fontFamily:"'Urbanist',sans-serif", fontWeight:800, fontSize:'1rem', color:'#fff', margin:0 }}>
            {servicio.nombre}
          </p>
          <p style={{ fontFamily:"'Lato',sans-serif", fontSize:'0.82rem', color:'#888', margin:'0.2rem 0 0' }}>
            {DIAS_ES[dia.getDay()]} {dia.getDate()} de {MESES_ES[dia.getMonth()]} · {hora} · ⏱ {servicio.duracion_min ?? 60} min
          </p>
          <p style={{ fontFamily:"'Urbanist',sans-serif", fontWeight:700, fontSize:'0.9rem', color:'#ba8f57', margin:'0.4rem 0 0' }}>
            ${servicio.precio_usd} USD · {convertirRefABs(servicio.precio_usd, tasaBcv)}
          </p>
        </div>
      )}

      {/* ── Botón → IR A PAGO ─────────────────────────────────────────────── */}
      <button
        onClick={irAPago}
        disabled={!servicio || !dia || !hora}
        style={{
          width:'100%', padding:'0.95rem',
          background: (!servicio || !dia || !hora) ? '#222' : '#ba8f57',
          color:      (!servicio || !dia || !hora) ? '#555' : '#1a1a1a',
          fontFamily:"'Urbanist',sans-serif", fontWeight:800, fontSize:'1rem',
          borderRadius:'9999px', border:'none',
          cursor: (!servicio || !dia || !hora) ? 'not-allowed' : 'pointer',
          transition:'all 0.2s', letterSpacing:'0.03em',
        }}
      >
        Confirmar y Pagar →
      </button>

    </div>
  );
}
