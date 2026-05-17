import { useState, useMemo, useEffect } from 'preact/hooks';
import { createClient } from '@supabase/supabase-js';
import { convertirRefABs } from '../utils/currency.js';

const DIAS_ES  = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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
        slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    });
  }
  return slots;
}

const getEspecialistaLabel = (cat) => {
  if (!cat) return 'Especialista';
  const c = cat.toLowerCase();
  if (c.includes('barber')) return 'Barbero';
  if (c.includes('peluquer') || c.includes('estilista')) return 'Estilista';
  if (c.includes('uña') || c.includes('manicur')) return 'Manicurista';
  if (c.includes('tatuaje') || c.includes('tattoo')) return 'Tatuador';
  if (c.includes('masaje') || c.includes('spa') || c.includes('terap')) return 'Masajista';
  if (c.includes('maquillaje') || c.includes('makeup')) return 'Maquillador';
  if (c.includes('podolog') || c.includes('pie')) return 'Podólogo';
  if (c.includes('ceja') || c.includes('pestañ') || c.includes('estética') || c.includes('estetica')) return 'Esteticista';
  return 'Especialista';
};

export default function BookingFlow({ negocioId, clienteId, servicios, tasaBcvInicial = 40.00, token, categoria }) {
  const supabase = createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    token ? {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    } : undefined
  );
  const [paso, setPaso] = useState(1);
  const [servicio, setServicio] = useState(null);
  const [especialista, setEspecialista] = useState(null);
  const [especialistasList, setEspecialistasList] = useState([]);
  const [dia, setDia] = useState(null);
  const [hora, setHora] = useState(null);
  const [horasOcupadas, setHorasOcupadas] = useState([]);
  const [fechaPago, setFechaPago] = useState(() => {
    const now = new Date();
    const tzoffset = now.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(now.getTime() - tzoffset)).toISOString().slice(0, 16);
    return localISOTime;
  });

  const tieneVariosEspecialistas = useMemo(() => especialistasList.length > 1, [especialistasList]);

  const pasosConfig = useMemo(() => {
    if (tieneVariosEspecialistas) {
      return [
        { n: 1, label: 'Servicio' },
        { n: 2, label: getEspecialistaLabel(categoria) },
        { n: 3, label: 'Fecha' },
        { n: 4, label: 'Pago' }
      ];
    } else {
      return [
        { n: 1, label: 'Servicio' },
        { n: 3, label: 'Fecha' },
        { n: 4, label: 'Pago' }
      ];
    }
  }, [tieneVariosEspecialistas, categoria]);
  
  // Métodos de pago activos del profesional
  const [pagosConfig, setPagosConfig] = useState({
    pago_movil_activo: false,
    pago_movil_banco: '',
    pago_movil_telefono: '',
    pago_movil_cedula: '',
    zelle_activo: false,
    zelle_correo: '',
    zelle_titular: '',
    efectivo_activo: true
  });

  // Tasa de cambio BCV en tiempo real
  const [tasaBcv, setTasaBcv] = useState(tasaBcvInicial);

  // Formulario de Pago
  const [metodoPago, setMetodoPago] = useState('');
  const [bancoEmisor, setBancoEmisor] = useState('');
  const [referencia, setReferencia] = useState('');

  // Estados de copia
  const [copiadoTel, setCopiadoTel] = useState(false);
  const [copiadoCed, setCopiadoCed] = useState(false);
  const [copiadoZelleMail, setCopiadoZelleMail] = useState(false);

  const copiarTelefono = () => {
    const tel = pagosConfig?.pago_movil_telefono || '04121112233';
    navigator.clipboard.writeText(tel);
    setCopiadoTel(true);
    setTimeout(() => setCopiadoTel(false), 1500);
  };

  const copiarCedula = () => {
    const ced = pagosConfig?.pago_movil_cedula || 'V-11122233';
    navigator.clipboard.writeText(ced);
    setCopiadoCed(true);
    setTimeout(() => setCopiadoCed(false), 1500);
  };

  const copiarZelleMail = () => {
    const mail = pagosConfig?.zelle_correo || 'pagos@chikiluky.app';
    navigator.clipboard.writeText(mail);
    setCopiadoZelleMail(true);
    setTimeout(() => setCopiadoZelleMail(false), 1500);
  };
  
  // Estados de proceso
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [reservaExito, setReservaExito] = useState(false);
  const [detallesReserva, setDetallesReserva] = useState(null);

  // Suscribirse a la tasa BCV en tiempo real
  useEffect(() => {
    async function fetchTasaYNegocio() {
      try {
        // 1. Obtener la tasa cambiaria activa
        const { data: config } = await supabase
          .from('configuracion_sistema')
          .select('tasa_bcv')
          .eq('id', 1)
          .maybeSingle();

        if (config?.tasa_bcv) {
          setTasaBcv(parseFloat(config.tasa_bcv));
        }

        // 2. Obtener el especialista/dueño del negocio y su configuración de pagos
        const { data: negocio } = await supabase
          .from('negocios')
          .select('owner_id, name, config')
          .eq('id', negocioId)
          .single();

        if (negocio) {
          if (negocio.config?.specialists && Array.isArray(negocio.config.specialists) && negocio.config.specialists.length > 0) {
            setEspecialistasList(negocio.config.specialists);
            setEspecialista(negocio.config.specialists[0]);
          } else if (negocio.owner_id) {
            // Obtener datos del perfil del experto
            const { data: perfilProf } = await supabase
              .from('perfiles')
              .select('id, full_name, avatar_url')
              .eq('id', negocio.owner_id)
              .single();

            const expertData = {
              id: negocio.owner_id,
              full_name: perfilProf?.full_name || 'Especialista',
              avatar_url: perfilProf?.avatar_url || '',
              descripcion: 'Experto dedicado a brindar el mejor servicio de cuidado personal y estilo en la ciudad.'
            };

            setEspecialista(expertData);
            setEspecialistasList([expertData]);
          }

          // Consultar tabla 'perfiles_profesionales' usando el owner_id
          if (negocio.owner_id) {
            const { data: profPagos } = await supabase
              .from('perfiles_profesionales')
              .select('*')
              .eq('id', negocio.owner_id)
              .maybeSingle();

            if (profPagos) {
              setPagosConfig(profPagos);
              // Elegir el primer método de pago disponible
              if (profPagos.pago_movil_activo) setMetodoPago('pago_movil');
              else if (profPagos.zelle_activo) setMetodoPago('zelle');
              else setMetodoPago('efectivo');
            } else {
              // Fallback a negocio.config.pagos si no está la tabla creada o poblada
              const jsonPagos = negocio.config?.pagos ?? {};
              const pm = jsonPagos.pago_movil ?? {};
              const zl = jsonPagos.zelle ?? {};
              const ef = jsonPagos.efectivo ?? {};

              const cfgFallback = {
                pago_movil_activo: pm.activo ?? false,
                pago_movil_banco: pm.principal?.banco ?? '',
                pago_movil_telefono: pm.principal?.telefono ?? '',
                pago_movil_cedula: pm.principal?.cedula ?? '',
                zelle_activo: zl.activo ?? false,
                zelle_correo: zl.principal?.email ?? '',
                zelle_titular: zl.principal?.nombre ?? '',
                efectivo_activo: ef.activo ?? true
              };
              setPagosConfig(cfgFallback);
              if (cfgFallback.pago_movil_activo) setMetodoPago('pago_movil');
              else if (cfgFallback.zelle_activo) setMetodoPago('zelle');
              else setMetodoPago('efectivo');
            }
          }
        }
      } catch (err) {
        console.error('Error al cargar configuraciones iniciales:', err);
      }
    }

    fetchTasaYNegocio();

    // Canal en tiempo real
    const channel = supabase
      .channel('booking-realtime-tasa')
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
  }, [negocioId]);

  const dias = useMemo(() => proximosDias(7), []);
  const slots = useMemo(
    () => generarSlots(9, 19, servicio?.duracion_min ?? 60),
    [servicio]
  );

  // Elegir fecha y consultar disponibilidad
  async function elegirDia(d) {
    setDia(d);
    setHora(null);
    setPaso(3);

    const inicio = new Date(d); inicio.setHours(0, 0, 0, 0);
    const fin = new Date(d); fin.setHours(23, 59, 59, 999);

    // Consultamos la disponibilidad tanto en 'reservas' (nuevo) como en 'citas' (anterior)
    const [resReservas, resCitas] = await Promise.all([
      supabase
        .from('reservas')
        .select('hora_inicio')
        .eq('profesional_id', especialista?.id)
        .eq('fecha', d.toISOString().split('T')[0])
        .in('estado', ['confirmada', 'completada']),
      supabase
        .from('citas')
        .select('start_time')
        .eq('business_id', negocioId)
        .gte('start_time', inicio.toISOString())
        .lte('start_time', fin.toISOString())
        .in('status', ['pendiente', 'confirmada', 'pendiente_pago'])
    ]);

    const ocupadas = [];

    if (resReservas.data) {
      resReservas.data.forEach(r => {
        const slot = r.hora_inicio.slice(0, 5);
        if (!ocupadas.includes(slot)) ocupadas.push(slot);
      });
    }

    if (resCitas.data) {
      resCitas.data.forEach(c => {
        const t = new Date(c.start_time);
        const slot = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
        if (!ocupadas.includes(slot)) ocupadas.push(slot);
      });
    }

    setHorasOcupadas(ocupadas);
  }

  // Cierre transaccional de reservas y chat
  async function confirmarReserva() {
    if (!servicio || !especialista || !dia || !hora || !metodoPago) return;

    setErrorMsg('');
    
    // Validación de campos obligatorios condicionales
    if (metodoPago === 'pago_movil') {
      if (!bancoEmisor.trim() || !referencia.trim()) {
        setErrorMsg('Por favor introduce el Banco Emisor y el Número de Referencia.');
        return;
      }
    } else if (metodoPago === 'zelle') {
      if (!referencia.trim()) {
        setErrorMsg('Por favor introduce el Nombre de Cuenta o Referencia de Zelle.');
        return;
      }
    }

    setCargando(true);

    try {
      const fechaStr = dia.toISOString().split('T')[0];
      const horaInicioStr = `${hora}:00`;

      // Formatear la fecha del pago para almacenamiento
      const formattedFechaPago = fechaPago ? fechaPago.replace('T', ' ') : '';
      const fullReferencia = metodoPago !== 'efectivo' 
        ? `${referencia} (${formattedFechaPago})` 
        : null;

      // 1. Insertar el registro en la tabla 'reservas'
      const { data: newReserva, error: insertError } = await supabase
        .from('reservas')
        .insert([{
          cliente_id: clienteId,
          profesional_id: especialista.id,
          servicio_id: servicio.id,
          fecha: fechaStr,
          hora_inicio: horaInicioStr,
          estado: 'confirmada',
          pago_metodo: metodoPago,
          pago_referencia: fullReferencia,
          pago_banco_emisor: metodoPago === 'pago_movil' ? bancoEmisor : null,
          pago_estado: metodoPago === 'efectivo' ? 'verificado' : 'pendiente_verificacion'
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      // 2. Insertar también de forma compatible en la tabla anterior 'citas' para asegurar agendas previas
      const [hh, mm] = hora.split(':').map(Number);
      const startTime = new Date(dia);
      startTime.setHours(hh, mm, 0, 0);
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + (servicio.duracion_min ?? 60));

      const precioBsCalculado = Math.round(parseFloat(servicio.precio_usd) * tasaBcv * 100) / 100;

      await supabase.from('citas').insert({
        client_id: clienteId,
        business_id: negocioId,
        expert_id: especialista.id,
        servicio: servicio.nombre,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: metodoPago === 'efectivo' ? 'confirmada' : 'pendiente_pago',
        price_usd: servicio.precio_usd,
        price_bs: precioBsCalculado,
        comprobante_referencia: fullReferencia,
        notas: `Reserva unificada Módulo 2. Pago: ${metodoPago.toUpperCase()} el ${formattedFechaPago}`
      });

      // 3. Inicializar / Obtener la sala de chat privada entre este cliente y el profesional
      let activeRoomId = null;
      
      const { data: existingRoom } = await supabase
        .from('salas_chat')
        .select('id')
        .eq('sala_type', 'cliente_profesional')
        .eq('cliente_id', clienteId)
        .eq('profesional_id', especialista.id)
        .maybeSingle();

      if (existingRoom) {
        activeRoomId = existingRoom.id;
      } else {
        const { data: newRoom, error: roomError } = await supabase
          .from('salas_chat')
          .insert([{
            sala_type: 'cliente_profesional',
            cliente_id: clienteId,
            profesional_id: especialista.id
          }])
          .select()
          .single();

        if (!roomError && newRoom) {
          activeRoomId = newRoom.id;
        }
      }

      // 4. Mandar un mensaje automático de confirmación en la sala de chat
      if (activeRoomId) {
        await supabase.from('mensajes_chat').insert([{
          sala_id: activeRoomId,
          sender_type: 'profesional',
          sender_id: especialista.id,
          contenido: `📢 ¡Nueva Cita Agendada! He recibido tu reserva para el servicio "${servicio.nombre}" el día ${fechaStr} a las ${hora}. El método de pago reportado es ${metodoPago.replace('_', ' ').toUpperCase()}. ¡Te espero!`
        }]);
      }

      setDetallesReserva({
        reservaId: newReserva.id,
        servicio: servicio.nombre,
        fecha: fechaStr,
        hora: hora,
        precioUsd: servicio.precio_usd,
        precioBs: precioBsCalculado,
        metodo: metodoPago
      });
      setReservaExito(true);

    } catch (err) {
      console.error('Error al completar la reserva transaccional:', err);
      setErrorMsg(err.message || 'Error interno al procesar la reserva en Supabase.');
    } finally {
      setCargando(false);
    }
  }

  // --- UI RENDER: Pantalla de Éxito ---
  if (reservaExito && detallesReserva) {
    return (
      <div style={{
        background: '#111',
        border: '1px solid rgba(186, 143, 87, 0.3)',
        borderRadius: '0.85rem',
        padding: '2.5rem 2rem',
        textAlign: 'center',
        boxShadow: '0 20px 50px rgba(0,0,0,0.9)'
      }}>
        
        {/* Luxury Typography Accent */}
        <span style={{
          display: 'inline-block',
          fontFamily: "'Urbanist', sans-serif",
          fontWeight: 800,
          fontSize: '0.7rem',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: '#ba8f57',
          marginBottom: '1rem'
        }}>
          CONFIRMACIÓN DE TURNO
        </span>

        <h2 style={{
          fontFamily: "'Urbanist', sans-serif",
          fontWeight: 900,
          fontSize: '1.75rem',
          color: '#fff',
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
          margin: '0 0 0.75rem 0',
          lineHeight: '1.2'
        }}>
          ¡Reserva Confirmada!
        </h2>
        
        <p style={{
          fontFamily: "'Lato', sans-serif",
          fontSize: '0.82rem',
          color: '#777',
          maxWidth: '400px',
          margin: '0 auto 2.25rem',
          lineHeight: '1.5'
        }}>
          Tu cita ha sido agendada con éxito. El canal de comunicación privada con tu profesional ya se encuentra activo en tu panel.
        </p>
        
        <div style={{
          background: '#0a0a0a',
          border: '1px solid rgba(186, 143, 87, 0.08)',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          marginBottom: '2.25rem',
          textAlign: 'left'
        }}>
          <span style={{
            display: 'block',
            fontFamily: "'Urbanist', sans-serif",
            fontWeight: 800,
            fontSize: '0.62rem',
            letterSpacing: '0.12em',
            color: '#ba8f57',
            marginBottom: '0.35rem',
            textTransform: 'uppercase'
          }}>
            Servicio Contratado
          </span>
          <p style={{
            margin: '0 0 1rem 0',
            fontFamily: "'Urbanist', sans-serif",
            fontWeight: 800,
            fontSize: '1.15rem',
            color: '#fff',
            lineHeight: '1.3'
          }}>
            {detallesReserva.servicio}
          </p>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            borderTop: '1px solid rgba(255,255,255,0.03)',
            paddingTop: '1rem'
          }}>
            <div>
              <span style={{
                display: 'block',
                fontFamily: "'Urbanist', sans-serif",
                fontWeight: 700,
                fontSize: '0.6rem',
                letterSpacing: '0.05em',
                color: '#555',
                textTransform: 'uppercase',
                marginBottom: '0.15rem'
              }}>
                Fecha y Hora
              </span>
              <span style={{
                fontFamily: "'Lato', sans-serif",
                fontSize: '0.85rem',
                color: '#eee',
                fontWeight: 'bold'
              }}>
                {detallesReserva.fecha} · {detallesReserva.hora}
              </span>
            </div>
            <div>
              <span style={{
                display: 'block',
                fontFamily: "'Urbanist', sans-serif",
                fontWeight: 700,
                fontSize: '0.6rem',
                letterSpacing: '0.05em',
                color: '#555',
                textTransform: 'uppercase',
                marginBottom: '0.15rem'
              }}>
                Método de Pago
              </span>
              <span style={{
                fontFamily: "'Urbanist', sans-serif",
                fontSize: '0.85rem',
                color: '#ba8f57',
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: '0.03em'
              }}>
                {detallesReserva.metodo.replace('_', ' ')}
              </span>
            </div>
          </div>

          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.03)',
            marginTop: '1rem',
            paddingTop: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{
              fontFamily: "'Urbanist', sans-serif",
              fontWeight: 800,
              fontSize: '0.62rem',
              letterSpacing: '0.12em',
              color: '#555',
              textTransform: 'uppercase'
            }}>
              Total a Pagar
            </span>
            <span style={{
              fontSize: '1.15rem',
              color: '#ba8f57',
              fontWeight: '900',
              fontFamily: "'Urbanist', sans-serif"
            }}>
              ${detallesReserva.precioUsd} USD <span style={{ fontSize: '0.78rem', color: '#888', fontWeight: 'normal', fontFamily: "'Lato', sans-serif" }}>({detallesReserva.precioBs} Bs)</span>
            </span>
          </div>
        </div>

        <div>
          <a
            href="/app/cliente/buscar"
            style={{
              display: 'block',
              width: '100%',
              background: '#ba8f57',
              border: 'none',
              borderRadius: '2rem',
              padding: '0.9rem',
              fontSize: '0.85rem',
              fontFamily: "'Urbanist', sans-serif",
              fontWeight: 800,
              color: '#111',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              textDecoration: 'none',
              textAlign: 'center',
              transition: 'all 0.2s',
              cursor: 'pointer'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#cda56e'}
            onMouseOut={(e) => e.currentTarget.style.background = '#ba8f57'}
          >
            Ir a mis Citas
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Barra de Pasos Secuenciales ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.75rem' }}>
        {pasosConfig.map((item, idx) => (
          <div key={item.n} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: idx < pasosConfig.length - 1 ? 1 : 'none' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '0.78rem',
              background: paso >= item.n ? '#ba8f57' : '#1e1e1e',
              color: paso >= item.n ? '#111' : '#555',
              border: paso >= item.n ? '2px solid #ba8f57' : '2px solid #2d2d2d',
              transition: 'all 0.2s', flexShrink: 0
            }}>
              {idx + 1}
            </div>
            <span style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '0.7rem', fontWeight: '700', color: paso >= item.n ? '#ba8f57' : '#444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {item.label}
            </span>
            {idx < pasosConfig.length - 1 && <div style={{ flex: 1, height: '1px', background: paso > item.n ? '#ba8f57' : '#222' }} />}
          </div>
        ))}
      </div>

      {/* ── PASO 1: Catálogo de Servicios ── */}
      {paso === 1 && (
        <div style={{ background: '#111', border: '1px solid rgba(186,143,87,0.18)', borderRadius: '1rem', padding: '1.5rem', marginBottom: '1.25rem' }}>
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ba8f57', marginBottom: '1rem', display: 'block' }}>
            1 · Elige un Servicio
          </span>
          {servicios.length === 0 ? (
            <p style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.85rem', color: '#555' }}>Este salón aún no tiene servicios disponibles.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {servicios.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setServicio(s); setPaso(tieneVariosEspecialistas ? 2 : 3); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '1rem', background: servicio?.id === s.id ? 'rgba(186,143,87,0.12)' : '#161616',
                    border: servicio?.id === s.id ? '1px solid #ba8f57' : '1px solid rgba(255,255,255,0.03)',
                    borderRadius: '0.75rem', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.borderColor = 'rgba(186,143,87,0.4)'}
                  onMouseOut={(e) => e.currentTarget.style.borderColor = servicio?.id === s.id ? '#ba8f57' : 'rgba(255,255,255,0.03)'}
                >
                  <div>
                    <p style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '0.95rem', color: '#fff', margin: 0 }}>{s.nombre}</p>
                    <p style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.75rem', color: '#666', margin: '0.2rem 0 0', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      {s.duracion_min ?? 60} min
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 900, fontSize: '1rem', color: '#ba8f57', margin: 0 }}>${s.precio_usd}</p>
                    <p style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.68rem', color: '#888', margin: '0.15rem 0 0', textTransform: 'uppercase', fontWeight: 700 }}>
                      {convertirRefABs(s.precio_usd, tasaBcv)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PASO 2: Selección de Especialista / Staff ── */}
      {paso === 2 && (
        <div style={{ background: '#111', border: '1px solid rgba(186,143,87,0.18)', borderRadius: '1rem', padding: '1.5rem', marginBottom: '1.25rem' }}>
          <button
            onClick={() => setPaso(1)}
            style={{
              background: 'transparent', border: 'none', color: '#888',
              fontFamily: "'Urbanist', sans-serif", fontSize: '0.75rem', fontWeight: 'bold',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem',
              marginBottom: '1.25rem', padding: 0
            }}
            onMouseOver={(e) => e.currentTarget.style.color = '#fff'}
            onMouseOut={(e) => e.currentTarget.style.color = '#888'}
          >
            ← Volver a los Servicios
          </button>
          
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ba8f57', marginBottom: '1rem', display: 'block' }}>
            2 · Elige el {getEspecialistaLabel(categoria)}
          </span>
          {especialistasList.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {especialistasList.map(esp => {
                const activo = especialista?.id === esp.id;
                return (
                  <button
                    key={esp.id}
                    onClick={() => { setEspecialista(esp); setPaso(3); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '1rem',
                      padding: '1rem', background: activo ? 'rgba(186,143,87,0.12)' : '#161616',
                      border: activo ? '1px solid #ba8f57' : '1px solid rgba(255,255,255,0.03)',
                      borderRadius: '0.85rem', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left', width: '100%',
                      outline: 'none'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = 'rgba(186,143,87,0.4)'}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = activo ? '#ba8f57' : 'rgba(255,255,255,0.03)'}
                  >
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', border: '2px solid #ba8f57', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      {esp.avatar_url ? (
                        <img src={esp.avatar_url} alt={esp.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ba8f57" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                          <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '1rem', color: '#fff', margin: 0 }}>{esp.full_name}</h4>
                      <p style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.7rem', color: '#ba8f57', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.15rem 0' }}>
                        {getEspecialistaLabel(categoria).toUpperCase()} PROFESIONAL
                      </p>
                      <p style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.75rem', color: '#777', margin: 0, lineHeight: '1.3' }}>
                        {esp.descripcion || 'Experto dedicado a brindar el mejor servicio de cuidado personal y estilo.'}
                      </p>
                    </div>
                    <div style={{ fontSize: '1.25rem', color: '#ba8f57', paddingRight: '0.25rem' }}>
                      →
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.85rem', color: '#555' }}>Cargando datos del {getEspecialistaLabel(categoria).toLowerCase()}...</p>
          )}
        </div>
      )}

      {/* ── PASO 3: Calendario y Horas ── */}
      {paso === 3 && (
        <div>
          <button
            onClick={() => setPaso(tieneVariosEspecialistas ? 2 : 1)}
            style={{
              background: 'transparent', border: 'none', color: '#888',
              fontFamily: "'Urbanist', sans-serif", fontSize: '0.75rem', fontWeight: 'bold',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem',
              marginBottom: '1rem', padding: 0
            }}
            onMouseOver={(e) => e.currentTarget.style.color = '#fff'}
            onMouseOut={(e) => e.currentTarget.style.color = '#888'}
          >
            ← Volver {tieneVariosEspecialistas ? `al ${getEspecialistaLabel(categoria)}` : 'a los Servicios'}
          </button>
          {/* Calendario horizontal */}
          <div style={{ background: '#111', border: '1px solid rgba(186,143,87,0.18)', borderRadius: '1rem', padding: '1.5rem', marginBottom: '1rem' }}>
            <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ba8f57', marginBottom: '1rem', display: 'block' }}>
              3.A · Elige la Fecha
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.4rem', scrollbarWidth: 'none' }}>
              {dias.map((d, i) => {
                const activo = dia && d.toDateString() === dia.toDateString();
                return (
                  <button
                    key={i}
                    onClick={() => elegirDia(d)}
                    style={{
                      fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '0.82rem',
                      padding: '0.75rem 1rem', borderRadius: '0.75rem', cursor: 'pointer',
                      border: activo ? '1px solid #ba8f57' : '1px solid rgba(255,255,255,0.03)',
                      background: activo ? '#ba8f57' : '#161616',
                      color: activo ? '#111' : '#ba8f57',
                      flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem'
                    }}
                  >
                    <span style={{ fontSize: '0.68rem', opacity: 0.8 }}>{DIAS_ES[d.getDay()]}</span>
                    <span style={{ fontSize: '1.15rem', fontWeight: 900 }}>{d.getDate()}</span>
                    <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>{MESES_ES[d.getMonth()]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Slots de Hora */}
          {dia && (
            <div style={{ background: '#111', border: '1px solid rgba(186,143,87,0.18)', borderRadius: '1rem', padding: '1.5rem', marginBottom: '1.25rem' }}>
              <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ba8f57', marginBottom: '1rem', display: 'block' }}>
                3.B · Elige la Hora
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                {slots.map(slot => {
                  const ocupado = horasOcupadas.includes(slot);
                  const activo = hora === slot;
                  return (
                    <button
                      key={slot}
                      disabled={ocupado}
                      onClick={() => { setHora(slot); setPaso(4); }}
                      style={{
                        fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '0.8rem',
                        padding: '0.65rem 0.5rem', borderRadius: '0.5rem', cursor: ocupado ? 'not-allowed' : 'pointer',
                        border: activo ? '1px solid #ba8f57' : '1px solid rgba(255,255,255,0.02)',
                        background: activo ? '#ba8f57' : '#161616',
                        color: activo ? '#111' : (ocupado ? '#333' : '#eee'),
                        opacity: ocupado ? 0.25 : 1,
                        textDecoration: ocupado ? 'line-through' : 'none'
                      }}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PASO 4: Confirmación y Pasarela de Pago Condicional ── */}
      {paso === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Ficha Resumen de Cita */}
          <div style={{ background: 'rgba(186, 143, 87, 0.05)', border: '1px solid rgba(186, 143, 87, 0.25)', borderRadius: '1rem', padding: '1.25rem' }}>
            <p style={{ margin: '0 0 0.25rem 0', fontFamily: "'Lato', sans-serif", fontSize: '0.72rem', color: '#888', letterSpacing: '0.04em' }}>RESUMEN DE TU SELECCIÓN</p>
            <p style={{ margin: '0 0 0.5rem 0', fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '1.1rem', color: '#fff' }}>{servicio.nombre}</p>
            
            <p style={{ margin: '0 0 0.75rem 0', fontFamily: "'Lato', sans-serif", fontSize: '0.82rem', color: '#ccc' }}>
              Con tu <strong>{getEspecialistaLabel(categoria).toLowerCase()} {especialista.full_name}</strong> · {dia.getDate()} de {MESES_ES[dia.getMonth()]} · {hora} hs
            </p>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(186,143,87,0.15)', paddingTop: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#aaa' }}>Equivalente en Bolívares:</span>
              <span style={{ fontSize: '1.05rem', color: '#ba8f57', fontWeight: '900', fontFamily: "'Urbanist', sans-serif" }}>
                ${servicio.precio_usd} USD <span style={{ fontSize: '0.82rem', color: '#aaa', fontWeight: 'normal' }}>({convertirRefABs(servicio.precio_usd, tasaBcv)})</span>
              </span>
            </div>
          </div>

          {/* Selector de Pasarela Condicional */}
          <div style={{ background: '#111', border: '1px solid rgba(186,143,87,0.18)', borderRadius: '1rem', padding: '1.5rem' }}>
            <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ba8f57', marginBottom: '1rem', display: 'block' }}>
              4 · Confirmación de Pago
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {/* Opción Pago Móvil */}
              {pagosConfig.pago_movil_activo && (
                <button
                  onClick={() => setMetodoPago('pago_movil')}
                  style={{
                    padding: '0.85rem 0.5rem', background: metodoPago === 'pago_movil' ? 'rgba(186,143,87,0.15)' : '#161616',
                    border: metodoPago === 'pago_movil' ? '1px solid #ba8f57' : '1px solid rgba(255,255,255,0.02)',
                    borderRadius: '0.75rem', color: metodoPago === 'pago_movil' ? '#ba8f57' : '#aaa',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.45rem', transition: 'all 0.2s'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'color 0.2s' }}>
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                    <line x1="12" y1="18" x2="12.01" y2="18"></line>
                  </svg>
                  <span style={{ fontSize: '0.72rem', fontWeight: 'bold', fontFamily: "'Urbanist', sans-serif", textTransform: 'uppercase', letterSpacing: '0.02em' }}>Pago Móvil</span>
                </button>
              )}

              {/* Opción Zelle */}
              {pagosConfig.zelle_activo && (
                <button
                  onClick={() => setMetodoPago('zelle')}
                  style={{
                    padding: '0.85rem 0.5rem', background: metodoPago === 'zelle' ? 'rgba(186,143,87,0.15)' : '#161616',
                    border: metodoPago === 'zelle' ? '1px solid #ba8f57' : '1px solid rgba(255,255,255,0.02)',
                    borderRadius: '0.75rem', color: metodoPago === 'zelle' ? '#ba8f57' : '#aaa',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.45rem', transition: 'all 0.2s'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'color 0.2s' }}>
                    <path d="M16 3h5v5"></path>
                    <path d="M8 21H3v-5"></path>
                    <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"></path>
                  </svg>
                  <span style={{ fontSize: '0.72rem', fontWeight: 'bold', fontFamily: "'Urbanist', sans-serif", textTransform: 'uppercase', letterSpacing: '0.02em' }}>Zelle</span>
                </button>
              )}

              {/* Opción Efectivo */}
              {pagosConfig.efectivo_activo && (
                <button
                  onClick={() => setMetodoPago('efectivo')}
                  style={{
                    padding: '0.85rem 0.5rem', background: metodoPago === 'efectivo' ? 'rgba(186,143,87,0.15)' : '#161616',
                    border: metodoPago === 'efectivo' ? '1px solid #ba8f57' : '1px solid rgba(255,255,255,0.02)',
                    borderRadius: '0.75rem', color: metodoPago === 'efectivo' ? '#ba8f57' : '#aaa',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.45rem', transition: 'all 0.2s'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'color 0.2s' }}>
                    <rect x="2" y="6" width="20" height="12" rx="2"></rect>
                    <circle cx="12" cy="12" r="2"></circle>
                    <path d="M6 12h.01M18 12h.01"></path>
                  </svg>
                  <span style={{ fontSize: '0.72rem', fontWeight: 'bold', fontFamily: "'Urbanist', sans-serif", textTransform: 'uppercase', letterSpacing: '0.02em' }}>Efectivo</span>
                </button>
              )}
            </div>

            {/* RENDERIZADO CONDICIONAL DE FORMULARIOS */}
            
            {/* Formulario Pago Móvil */}
            {metodoPago === 'pago_movil' && (
              <div style={{ background: '#0a0a0a', border: '1px solid rgba(186,143,87,0.15)', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1.5rem' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', color: '#ba8f57', fontWeight: 'bold', letterSpacing: '0.05em', textTransform: 'uppercase' }}>CUENTA DESTINO PROFESIONAL</p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.78rem', color: '#ccc' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.65rem', color: '#555' }}>BANCO:</span>
                    <strong>{pagosConfig.pago_movil_banco || 'Banesco'}</strong>
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.65rem', color: '#555' }}>TELÉFONO:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <strong>{pagosConfig.pago_movil_telefono || '04121234567'}</strong>
                      <button
                        onClick={copiarTelefono}
                        title="Copiar teléfono"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '2px',
                          color: copiadoTel ? '#4ade80' : '#ba8f57',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'color 0.2s'
                        }}
                      >
                        {copiadoTel ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop: '0.4rem' }}>
                    <span style={{ display: 'block', fontSize: '0.65rem', color: '#555' }}>CÉDULA/RIF:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <strong>{pagosConfig.pago_movil_cedula || 'V-12345678'}</strong>
                      <button
                        onClick={copiarCedula}
                        title="Copiar cédula/RIF"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '2px',
                          color: copiadoCed ? '#4ade80' : '#ba8f57',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'color 0.2s'
                        }}
                      >
                        {copiadoCed ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.7rem', color: '#ba8f57', fontWeight: 'bold', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Confirmación del Pago Realizado</p>
                  <div>
                    <label style={{ display: 'block', fontFamily: "'Lato', sans-serif", fontSize: '0.72rem', color: '#999', marginBottom: '0.25rem' }}>Banco Emisor</label>
                    <input
                      type="text"
                      placeholder="Ej: Mercantil"
                      value={bancoEmisor}
                      onInput={(e) => setBancoEmisor(e.target.value)}
                      style={{ width: '100%', background: '#121212', border: '1px solid rgba(186,143,87,0.25)', borderRadius: '0.4rem', padding: '0.6rem 0.75rem', color: '#fff', fontSize: '0.83rem', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontFamily: "'Lato', sans-serif", fontSize: '0.72rem', color: '#999', marginBottom: '0.25rem' }}>Número de Referencia (4 o 6 dígitos)</label>
                      <input
                        type="text"
                        placeholder="Ej: 948201"
                        value={referencia}
                        onInput={(e) => setReferencia(e.target.value)}
                        style={{ width: '100%', background: '#121212', border: '1px solid rgba(186,143,87,0.25)', borderRadius: '0.4rem', padding: '0.6rem 0.75rem', color: '#fff', fontSize: '0.83rem', outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: "'Lato', sans-serif", fontSize: '0.72rem', color: '#999', marginBottom: '0.25rem' }}>Fecha y Hora de Transferencia</label>
                      <input
                        type="datetime-local"
                        value={fechaPago}
                        onChange={(e) => setFechaPago(e.target.value)}
                        style={{ width: '100%', background: '#121212', border: '1px solid rgba(186,143,87,0.25)', borderRadius: '0.4rem', padding: '0.55rem 0.75rem', color: '#fff', fontSize: '0.83rem', outline: 'none' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Formulario Zelle */}
            {metodoPago === 'zelle' && (
              <div style={{ background: '#0a0a0a', border: '1px solid rgba(186,143,87,0.15)', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1.5rem' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', color: '#ba8f57', fontWeight: 'bold', letterSpacing: '0.05em', textTransform: 'uppercase' }}>DATOS ZELLE DESTINO</p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem', fontSize: '0.78rem', color: '#ccc' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.65rem', color: '#555', marginBottom: '0.1rem' }}>CORREO ELECTRÓNICO:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <strong style={{ fontSize: '0.85rem', color: '#fff' }}>{pagosConfig.zelle_correo || 'pagos@chikiluky.app'}</strong>
                      <button
                        onClick={copiarZelleMail}
                        title="Copiar correo Zelle"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '2px',
                          color: copiadoZelleMail ? '#4ade80' : '#ba8f57',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'color 0.2s'
                        }}
                      >
                        {copiadoZelleMail ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.65rem', color: '#555', marginBottom: '0.1rem' }}>TITULAR DE LA CUENTA:</span>
                    <strong style={{ fontSize: '0.82rem', color: '#fff' }}>{pagosConfig.zelle_titular || 'Chikiluky Barbershop'}</strong>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.7rem', color: '#ba8f57', fontWeight: 'bold', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Confirmación del Pago Realizado</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontFamily: "'Lato', sans-serif", fontSize: '0.72rem', color: '#999', marginBottom: '0.25rem' }}>Titular de la Cuenta / Referencia</label>
                      <input
                        type="text"
                        placeholder="Ej: John Doe / Ref #849201"
                        value={referencia}
                        onInput={(e) => setReferencia(e.target.value)}
                        style={{ width: '100%', background: '#121212', border: '1px solid rgba(186,143,87,0.25)', borderRadius: '0.4rem', padding: '0.6rem 0.75rem', color: '#fff', fontSize: '0.83rem', outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: "'Lato', sans-serif", fontSize: '0.72rem', color: '#999', marginBottom: '0.25rem' }}>Fecha y Hora de Transferencia</label>
                      <input
                        type="datetime-local"
                        value={fechaPago}
                        onChange={(e) => setFechaPago(e.target.value)}
                        style={{ width: '100%', background: '#121212', border: '1px solid rgba(186,143,87,0.25)', borderRadius: '0.4rem', padding: '0.55rem 0.75rem', color: '#fff', fontSize: '0.83rem', outline: 'none' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Formulario Efectivo */}
            {metodoPago === 'efectivo' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(186,143,87,0.05)', border: '1px solid rgba(186,143,87,0.12)', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1.5rem' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ba8f57" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <p style={{ margin: 0, fontFamily: "'Lato', sans-serif", fontSize: '0.78rem', color: '#888', lineHeight: '1.4' }}>
                  Pagarás el equivalente de tu cita de forma directa en efectivo en el local al momento de recibir tu servicio.
                </p>
              </div>
            )}

            {/* Mensaje de Error */}
            {errorMsg && (
              <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '0.5rem', padding: '0.75rem', color: '#ef4444', fontSize: '0.78rem', marginBottom: '1rem', textAlign: 'center', fontFamily: "'Urbanist', sans-serif", fontWeight: '700', letterSpacing: '0.01em', textTransform: 'uppercase' }}>
                {errorMsg}
              </div>
            )}

            {/* Botones de Navegación Final */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                disabled={cargando}
                onClick={() => setPaso(3)}
                style={{
                  flex: 1, padding: '0.85rem', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '2rem', color: '#aaa', fontFamily: "'Urbanist', sans-serif", fontWeight: 700,
                  fontSize: '0.82rem', cursor: cargando ? 'not-allowed' : 'pointer'
                }}
              >
                ← Atrás
              </button>

              <button
                disabled={cargando}
                onClick={confirmarReserva}
                style={{
                  flex: 2, padding: '0.85rem', background: cargando ? '#333' : '#ba8f57',
                  border: 'none', borderRadius: '2rem', color: cargando ? '#555' : '#111',
                  fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '0.82rem',
                  cursor: cargando ? 'not-allowed' : 'pointer', letterSpacing: '0.03em', transition: 'all 0.2s'
                }}
              >
                {cargando ? 'Procesando...' : 'Confirmar Reserva'}
              </button>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
