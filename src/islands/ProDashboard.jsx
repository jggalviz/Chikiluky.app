import { useState, useEffect } from 'preact/hooks';
import { createClient } from '@supabase/supabase-js';
import { convertirRefABs } from '../utils/currency.js';

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY
);

export default function ProDashboard({ negocio, profesionalId, servicios, tasaBcvInicial, fullName }) {
  const [cargando, setCargando] = useState(true);
  const [reservas, setReservas] = useState([]);
  const [tasaBcv, setTasaBcv] = useState(tasaBcvInicial);
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toISOString().split('T')[0]);
  
  // Modal de registro manual
  const [showModalManual, setShowModalManual] = useState(false);
  const [nombreCliente, setNombreCliente] = useState('');
  const [servicioSeleccionado, setServicioSeleccionado] = useState(servicios[0]?.id || '');
  const [metodoPagoManual, setMetodoPagoManual] = useState('efectivo');
  const [fechaManual, setFechaManual] = useState(new Date().toISOString().split('T')[0]);
  const [horaManual, setHoraManual] = useState(
    `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`
  );

  // Mensajes de feedback
  const [errorMsg, setErrorMsg] = useState('');
  const [exitoMsg, setExitoMsg] = useState('');

  // Cargar citas y reservas del día seleccionado
  async function cargarAgenda() {
    setCargando(true);
    try {
      const inicioDia = new Date(fechaFiltro); inicioDia.setHours(0, 0, 0, 0);
      const finDia = new Date(fechaFiltro); finDia.setHours(23, 59, 59, 999);

      // 1. Obtener de la tabla 'reservas' (con joins a perfiles y servicios)
      let { data: dataReservas, error: errReservas } = await supabase
        .from('reservas')
        .select(`
          id,
          fecha,
          hora_inicio,
          estado,
          pago_metodo,
          pago_referencia,
          pago_banco_emisor,
          pago_estado,
          cliente_id,
          cliente:perfiles!reservas_cliente_id_fkey(full_name),
          servicio:servicios(nombre, precio_usd)
        `)
        .eq('profesional_id', profesionalId)
        .eq('fecha', fechaFiltro);

      // Fallback si la relación de clave foránea en Supabase apunta incorrectamente a auth.users en vez de public.perfiles
      if (errReservas && errReservas.code === 'PGRST200') {
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('reservas')
          .select(`
            id,
            fecha,
            hora_inicio,
            estado,
            pago_metodo,
            pago_referencia,
            pago_banco_emisor,
            pago_estado,
            cliente_id,
            servicio:servicios(nombre, precio_usd)
          `)
          .eq('profesional_id', profesionalId)
          .eq('fecha', fechaFiltro);

        if (fallbackErr) throw fallbackErr;
        dataReservas = fallbackData;
      } else if (errReservas) {
        throw errReservas;
      }

      // 2. Obtener de la tabla legacy 'citas' para asegurar visualización unificada
      const { data: dataCitas, error: errCitas } = await supabase
        .from('citas')
        .select(`
          id,
          servicio,
          start_time,
          status,
          price_usd,
          comprobante_referencia,
          client_id,
          client:perfiles!citas_client_id_fkey(full_name)
        `)
        .eq('business_id', negocio.id)
        .gte('start_time', inicioDia.toISOString())
        .lte('start_time', finDia.toISOString());

      if (errCitas) throw errCitas;

      // 3. Mapear y unificar ambos arreglos ordenándolos de forma cronológica
      const listadoUnificado = [];

      // Mapear reservas nuevas
      if (dataReservas) {
        dataReservas.forEach(r => {
          listadoUnificado.push({
            id: r.id,
            hora: r.hora_inicio.slice(0, 5),
            clienteName: r.cliente?.full_name || 'Cliente de la Calle',
            clienteId: r.cliente_id,
            servicioName: r.servicio?.nombre || 'Servicio Desconocido',
            precioUsd: parseFloat(r.servicio?.precio_usd || 0),
            pagoMetodo: r.pago_metodo,
            pagoReferencia: r.pago_referencia,
            pagoBancoEmisor: r.pago_banco_emisor,
            pagoEstado: r.pago_estado,
            estado: r.estado,
            source: 'reserva'
          });
        });
      }

      // Mapear citas antiguas excluyendo duplicados (por hora/servicio si coinciden exactamente)
      if (dataCitas) {
        dataCitas.forEach(c => {
          const t = new Date(c.start_time);
          const horaStr = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
          
          // Evitar colisión si ya existe la reserva equivalente
          const duplicada = listadoUnificado.some(r => r.hora === horaStr && r.servicioName === c.servicio);
          if (!duplicada) {
            listadoUnificado.push({
              id: c.id,
              hora: horaStr,
              clienteName: c.client?.full_name || 'Cliente Registrado',
              clienteId: c.client_id,
              servicioName: c.servicio,
              precioUsd: parseFloat(c.price_usd || 0),
              pagoMetodo: c.comprobante_referencia ? 'pago_movil' : 'efectivo',
              pagoReferencia: c.comprobante_referencia,
              pagoBancoEmisor: null,
              pagoEstado: c.status === 'pendiente_pago' ? 'pendiente_verificacion' : 'verificado',
              estado: c.status === 'pendiente_pago' ? 'pendiente_verificacion' : c.status,
              source: 'cita'
            });
          }
        });
      }

      // Ordenar cronológicamente por hora
      listadoUnificado.sort((a, b) => a.hora.localeCompare(b.hora));
      setReservas(listadoUnificado);

    } catch (err) {
      console.error('Error al cargar agenda:', err);
      setErrorMsg('No se pudo cargar la agenda del día.');
    } finally {
      setCargando(false);
    }
  }

  // Cargar agenda al iniciar o cambiar fecha
  useEffect(() => {
    cargarAgenda();
  }, [fechaFiltro]);

  // Suscribirse a la tasa BCV por tiempo real
  useEffect(() => {
    const channel = supabase
      .channel('pro-realtime-tasa')
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

  // --- MÉTODOS DE CÁLCULO DE MÉTRICAS ---
  const metricaBalanceUsd = reservas
    .filter(r => r.estado !== 'cancelada' && r.pagoEstado !== 'rechazado')
    .reduce((sum, r) => sum + r.precioUsd, 0);

  const metricaPendientes = reservas
    .filter(r => r.estado === 'pendiente_verificacion' || r.pagoEstado === 'pendiente_verificacion')
    .length;

  const metricaOcupacion = reservas
    .filter(r => ['confirmada', 'completada'].includes(r.estado))
    .length;

  // --- ACCIONES RÁPIDAS ---
  
  // Aprobar Pago
  async function aprobarPago(id, source) {
    setErrorMsg('');
    setExitoMsg('');

    try {
      if (source === 'reserva') {
        const { error } = await supabase
          .from('reservas')
          .update({ estado: 'confirmada', pago_estado: 'verificado' })
          .eq('id', id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('citas')
          .update({ status: 'confirmada' })
          .eq('id', id);

        if (error) throw error;
      }

      setExitoMsg('Pago aprobado con éxito.');
      // Actualización reactiva instantánea sin refrescar página
      setReservas(prev => prev.map(r => r.id === id ? { ...r, estado: 'confirmada', pagoEstado: 'verificado' } : r));
    } catch (err) {
      console.error('Error al aprobar pago:', err);
      setErrorMsg('No se pudo aprobar el pago.');
    }
  }

  // Rechazar Pago
  async function rechazarPago(id, source) {
    setErrorMsg('');
    setExitoMsg('');

    try {
      if (source === 'reserva') {
        const { error } = await supabase
          .from('reservas')
          .update({ estado: 'confirmada', pago_estado: 'rechazado' })
          .eq('id', id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('citas')
          .update({ status: 'pendiente_pago' }) // Mantiene en pendiente_pago
          .eq('id', id);

        if (error) throw error;
      }

      setExitoMsg('Pago marcado como rechazado.');
      setReservas(prev => prev.map(r => r.id === id ? { ...r, pagoEstado: 'rechazado' } : r));
    } catch (err) {
      console.error('Error al rechazar pago:', err);
      setErrorMsg('No se pudo rechazar el pago.');
    }
  }

  // Guardar Turno Manual ("Clientes de la Calle")
  async function guardarTurnoManual(e) {
    e.preventDefault();
    setErrorMsg('');
    setExitoMsg('');

    const serv = servicios.find(s => s.id === servicioSeleccionado);
    if (!serv) {
      setErrorMsg('Por favor selecciona un servicio válido.');
      return;
    }

    try {
      const hoyStr = fechaManual;
      const horaStr = `${horaManual}:00`;

      // Mapeamos 'punto' a 'efectivo' para evitar violar la restricción CHECK de pago_metodo en 'reservas'
      const checkPagoMetodo = (metodoPagoManual === 'punto') ? 'efectivo' : metodoPagoManual;

      // 1. Guardar en 'reservas'
      const { data: newRes, error: errRes } = await supabase
        .from('reservas')
        .insert([{
          cliente_id: null, // Offline
          profesional_id: profesionalId,
          servicio_id: serv.id,
          fecha: hoyStr,
          hora_inicio: horaStr,
          estado: 'completada',
          pago_metodo: checkPagoMetodo,
          pago_referencia: `REGISTRO MANUAL (OFFLINE) - ${metodoPagoManual.toUpperCase()}`,
          pago_estado: 'verificado'
        }])
        .select()
        .single();

      if (errRes) throw errRes;

      // 2. Guardar compatible en legacy 'citas'
      const [shh, smm] = horaManual.split(':').map(Number);
      const startTimeDate = new Date(fechaManual);
      startTimeDate.setHours(shh, smm, 0, 0);

      const endTimeDate = new Date(startTimeDate);
      endTimeDate.setMinutes(endTimeDate.getMinutes() + 60);

      const { error: errCita } = await supabase.from('citas').insert([{
        client_id: null,
        business_id: negocio.id,
        expert_id: profesionalId,
        servicio: serv.nombre,
        start_time: startTimeDate.toISOString(),
        end_time: endTimeDate.toISOString(),
        status: 'completada',
        price_usd: parseFloat(serv.precio_usd),
        price_bs: Math.round(parseFloat(serv.precio_usd) * tasaBcv * 100) / 100,
        comprobante_referencia: 'REGISTRO MANUAL',
        notas: `Turno manual offline: ${nombreCliente || 'Cliente de la Calle'} · Método: ${metodoPagoManual.toUpperCase()}`
      }]);

      if (errCita) throw errCita;

      setExitoMsg('Turno offline registrado con éxito.');
      setShowModalManual(false);

      // Añadir reactivamente al listado local si coincide con la fecha filtrada
      if (fechaManual === fechaFiltro) {
        const nuevoItem = {
          id: newRes.id,
          hora: horaStr.slice(0, 5),
          clienteName: nombreCliente.trim() || 'Cliente de la Calle',
          clienteId: null,
          servicioName: serv.nombre,
          precioUsd: parseFloat(serv.precio_usd),
          pagoMetodo: metodoPagoManual,
          pagoReferencia: 'REGISTRO MANUAL',
          pagoBancoEmisor: null,
          pagoEstado: 'verificado',
          estado: 'completada',
          source: 'reserva'
        };

        setReservas(prev => [...prev, nuevoItem].sort((a, b) => a.hora.localeCompare(b.hora)));
      }

      // Resetear campos
      setNombreCliente('');
      setFechaManual(new Date().toISOString().split('T')[0]);
      setHoraManual(`${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`);
    } catch (err) {
      console.error('Error al guardar turno manual:', err);
      const errMsg = err.message || err.details || JSON.stringify(err);
      setErrorMsg(`Error al registrar el turno en Supabase: ${errMsg}. Asegúrate de haber ejecutado el archivo de migración SQL rls_manual_bookings.sql provisto para configurar los permisos RLS.`);
    }
  }

  return (
    <div>
      {/* Saludo y Filtro de Fecha */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <p style={{ fontSize: '0.68rem', letterSpacing: '0.2em', color: '#ba8f57', textTransform: 'uppercase', margin: '0 0 0.4rem 0', fontFamily: "'Urbanist', sans-serif", fontWeight: '700' }}>Panel Pro</p>
          <h2 style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 900, fontSize: '1.8rem', color: '#fff', margin: 0, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
            {fullName ? fullName.split(' ')[0] : 'Administrador'}
          </h2>
          <span style={{ fontSize: '0.8rem', color: '#a3a3a3', letterSpacing: '0.02em', marginTop: '0.2rem', display: 'block' }}>{negocio.name}</span>
        </div>
        
        <div>
          <input
            type="date"
            value={fechaFiltro}
            onChange={(e) => setFechaFiltro(e.target.value)}
            style={{
              background: '#0d0d0d', border: '1px solid #262626',
              borderRadius: '0px', padding: '0.6rem 0.9rem', color: '#fff',
              fontSize: '0.8rem', fontFamily: "'Lato', sans-serif", outline: 'none'
            }}
          />
        </div>
      </div>

      {/* Alertas de Feedback */}
      {exitoMsg && (
        <div style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: '0px', padding: '0.75rem', color: '#4ade80', fontSize: '0.78rem', marginBottom: '1.5rem', textAlign: 'center', fontFamily: "'Lato', sans-serif" }}>
          {exitoMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0px', padding: '0.75rem', color: '#ef4444', fontSize: '0.78rem', marginBottom: '1.5rem', textAlign: 'center', fontFamily: "'Lato', sans-serif" }}>
          {errorMsg}
        </div>
      )}

      {/* 1. GRID DE MÉTRICAS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '2rem' }}>
        {/* Balance Total */}
        <div style={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '0px', padding: '1.25rem 1rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style={{ color: '#737373', marginBottom: '0.6rem', display: 'block' }}>
            <rect x="2" y="5" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="12" y1="17" x2="12" y2="17"></line>
            <path d="M12 9a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5z"></path>
          </svg>
          <span style={{ display: 'block', fontSize: '0.62rem', color: '#737373', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.05em' }}>Balance del Día</span>
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 900, fontSize: '1.15rem', color: '#fff', display: 'block', margin: '0.2rem 0' }}>
            ${metricaBalanceUsd.toFixed(0)} USD
          </span>
          <span style={{ fontSize: '0.65rem', color: '#ba8f57', fontWeight: 'bold' }}>
            {convertirRefABs(metricaBalanceUsd, tasaBcv)}
          </span>
        </div>

        {/* Pendientes de verificación */}
        <div style={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '0px', padding: '1.25rem 1rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style={{ color: metricaPendientes > 0 ? '#60a5fa' : '#737373', marginBottom: '0.6rem', display: 'block' }}>
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span style={{ display: 'block', fontSize: '0.62rem', color: '#737373', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.05em' }}>Por Verificar</span>
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 900, fontSize: '1.4rem', color: metricaPendientes > 0 ? '#60a5fa' : '#fff', display: 'block', margin: '0.2rem 0' }}>
            {metricaPendientes}
          </span>
          <span style={{ fontSize: '0.65rem', color: '#555', fontFamily: "'Lato', sans-serif" }}>citas pendientes</span>
        </div>

        {/* Ocupación */}
        <div style={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '0px', padding: '1.25rem 1rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style={{ color: '#737373', marginBottom: '0.6rem', display: 'block' }}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          <span style={{ display: 'block', fontSize: '0.62rem', color: '#737373', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.05em' }}>Ocupación</span>
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 900, fontSize: '1.4rem', color: '#4ade80', display: 'block', margin: '0.2rem 0' }}>
            {metricaOcupacion}
          </span>
          <span style={{ fontSize: '0.65rem', color: '#555', fontFamily: "'Lato', sans-serif" }}>citas agendadas</span>
        </div>
      </div>

      {/* Botón flotante para registro manual */}
      {/* 2. ACCIONES RÁPIDAS (ACCESO RÁPIDO) */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => setShowModalManual(true)}
          style={{
            width: '100%',
            padding: '1.25rem',
            background: '#0a0a0a',
            border: '1px solid #262626',
            borderRadius: '0px',
            color: '#fff',
            fontFamily: "'Urbanist', sans-serif",
            fontWeight: 700,
            fontSize: '0.82rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.6rem',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => { e.currentTarget.style.borderColor = '#ba8f57'; e.currentTarget.style.color = '#ba8f57'; }}
          onMouseOut={(e) => { e.currentTarget.style.borderColor = '#262626'; e.currentTarget.style.color = '#fff'; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Registrar Turno Manual (Cita Offline)
        </button>
      </div>

      {/* 3. EL CALENDARIO DIARIO / LISTA DE AGENDA */}
      <div style={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '0px', padding: '1.5rem' }}>
        <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#ba8f57', marginBottom: '1.25rem', display: 'block' }}>
          AGENDA DE CITAS - CRONOGRAMA DIARIO
        </span>

        {cargando ? (
          <p style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.85rem', color: '#555', textAlign: 'center' }}>Cargando agenda del día...</p>
        ) : reservas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style={{ color: '#444', margin: '0 auto 0.75rem', display: 'block' }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
              <line x1="10" y1="14" x2="14" y2="18"></line>
              <line x1="14" y1="14" x2="10" y2="18"></line>
            </svg>
            <p style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.8rem', color: '#555', margin: 0, letterSpacing: '0.02em' }}>No hay citas agendadas para esta fecha.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {reservas.map(r => {
              const esPendiente = r.estado === 'pendiente_verificacion' || r.pagoEstado === 'pendiente_verificacion';
              
              return (
                <div
                  key={r.id}
                  style={{
                    background: '#0d0d0d', border: '1px solid #1a1a1a',
                    borderRadius: '0px', padding: '1.25rem 1rem', transition: 'all 0.2s',
                    position: 'relative', overflow: 'hidden'
                  }}
                >
                  {/* Glowing stripe depending on status */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px',
                    background: esPendiente ? '#60a5fa' : (r.pagoEstado === 'rechazado' ? '#ef4444' : '#ba8f57')
                  }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingLeft: '0.5rem' }}>
                    <div>
                      {/* Hora */}
                      <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 900, fontSize: '0.95rem', color: '#ba8f57', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.3rem' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        {r.hora}
                      </span>
                      
                      {/* Cliente */}
                      <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '0.9rem', color: '#fff', display: 'block' }}>
                        {r.clienteName}
                      </span>
                      
                      {/* Servicio */}
                      <span style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.76rem', color: '#888', display: 'block', marginTop: '0.15rem' }}>
                        Servicio: <strong style={{ color: '#aaa' }}>{r.servicioName}</strong>
                      </span>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      {/* Precio */}
                      <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '0.95rem', color: '#fff', display: 'block' }}>
                        ${r.precioUsd} USD
                      </span>
                      <span style={{ display: 'block', fontSize: '0.65rem', color: '#737373', marginTop: '0.1rem', fontWeight: 'bold' }}>
                        {convertirRefABs(r.precioUsd, tasaBcv)}
                      </span>
                      
                      {/* Badge de Pago */}
                      <span
                        style={{
                          display: 'inline-block', fontSize: '0.62rem', fontWeight: 'bold',
                          textTransform: 'uppercase', borderRadius: '0px', padding: '0.2rem 0.5rem',
                          marginTop: '0.5rem', letterSpacing: '0.05em',
                          background: esPendiente ? 'rgba(96,165,250,0.06)' : (r.pagoEstado === 'rechazado' ? 'rgba(239,68,68,0.06)' : 'rgba(186,143,87,0.08)'),
                          color: esPendiente ? '#60a5fa' : (r.pagoEstado === 'rechazado' ? '#ef4444' : '#ba8f57'),
                          border: esPendiente ? '1px solid rgba(96,165,250,0.2)' : (r.pagoEstado === 'rechazado' ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(186,143,87,0.25)')
                        }}
                      >
                        {esPendiente ? 'Por Verificar' : (r.pagoEstado === 'rechazado' ? 'Rechazado' : r.pagoMetodo.replace('_', ' '))}
                      </span>
                    </div>
                  </div>

                  {/* Detalles adicionales para comprobantes por verificar */}
                  {esPendiente && (
                    <div style={{ background: '#070707', border: '1px solid #262626', borderRadius: '0px', padding: '0.85rem', marginTop: '0.85rem', marginLeft: '0.5rem', fontSize: '0.78rem', color: '#a3a3a3', fontFamily: "'Lato', sans-serif" }}>
                      <p style={{ margin: '0 0 0.4rem 0', fontWeight: 'bold', color: '#60a5fa', fontSize: '0.68rem', letterSpacing: '0.05em' }}>REPORTADO POR EL CLIENTE:</p>
                      {r.pagoMetodo === 'pago_movil' ? (
                        <div>
                          <span>Banco Emisor: <strong style={{ color: '#fff' }}>{r.pagoBancoEmisor || 'No especificado'}</strong></span>
                          <span style={{ display: 'block', marginTop: '0.15rem' }}>Referencia: <strong style={{ color: '#fff' }}>{r.pagoReferencia || 'No reportada'}</strong></span>
                        </div>
                      ) : (
                        <div>
                          <span>Nombre de Cuenta / Ref: <strong style={{ color: '#fff' }}>{r.pagoReferencia || 'No reportado'}</strong></span>
                        </div>
                      )}

                      {/* Botones de Aprobación Condicional */}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem' }}>
                        <button
                          onClick={() => rechazarPago(r.id, r.source)}
                          style={{
                            flex: 1, padding: '0.55rem', background: 'rgba(239,68,68,0.06)',
                            border: '1px solid rgba(239,68,68,0.25)', borderRadius: '0px',
                            color: '#ef4444', fontSize: '0.72rem', fontWeight: 'bold', cursor: 'pointer',
                            textTransform: 'uppercase', letterSpacing: '0.05em'
                          }}
                        >
                          Rechazar
                        </button>
                        
                        <button
                          onClick={() => aprobarPago(r.id, r.source)}
                          style={{
                            flex: 2, padding: '0.55rem', background: '#ba8f57',
                            border: 'none', borderRadius: '0px',
                            color: '#000', fontSize: '0.72rem', fontWeight: 'bold', cursor: 'pointer',
                            textTransform: 'uppercase', letterSpacing: '0.05em'
                          }}
                        >
                          Aprobar Pago
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Si es efectivo, recuerda cobrar */}
                  {r.pagoMetodo === 'efectivo' && !esPendiente && (
                    <div style={{ background: 'rgba(186,143,87,0.03)', border: '1px solid rgba(186,143,87,0.12)', borderRadius: '0px', padding: '0.65rem 0.85rem', marginTop: '0.85rem', marginLeft: '0.5rem', fontSize: '0.74rem', color: '#a3a3a3', display: 'flex', alignItems: 'center', gap: '0.45rem', fontFamily: "'Lato', sans-serif" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style={{ color: '#ba8f57', flexShrink: 0 }}>
                        <rect x="2" y="6" width="20" height="12" rx="2"></rect>
                        <circle cx="12" cy="12" r="2"></circle>
                        <path d="M6 12h.01M18 12h.01"></path>
                      </svg>
                      <span><strong>Cobrar en Local:</strong> Pagar en efectivo o tarjeta física antes del servicio.</span>
                    </div>
                  )}

                  {/* Acciones generales: CHAT */}
                  {r.clienteId && (
                    <div style={{ marginTop: '0.75rem', textAlign: 'right', paddingLeft: '0.5rem' }}>
                      <a
                        href="/app/experto/soporte"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                          fontFamily: "'Urbanist', sans-serif", fontSize: '0.68rem', fontWeight: '700',
                          color: '#ba8f57', textDecoration: 'none', border: '1px solid rgba(186,143,87,0.2)',
                          padding: '0.35rem 0.75rem', borderRadius: '0px', textTransform: 'uppercase', letterSpacing: '0.04em',
                          transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.borderColor = '#ba8f57'; e.currentTarget.style.background = 'rgba(186,143,87,0.05)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.borderColor = 'rgba(186,143,87,0.2)'; e.currentTarget.style.background = 'transparent'; }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        Chat con Cliente
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. MODAL DE REGISTRO MANUAL ("Clientes de la Calle") */}
      {showModalManual && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div style={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: '0px', width: '100%', maxWidth: '420px', padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 900, fontSize: '1.1rem', color: '#fff', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Registrar Turno Manual</h3>
              <button
                onClick={() => setShowModalManual(false)}
                style={{ background: 'transparent', border: 'none', color: '#666', fontSize: '1.5rem', cursor: 'pointer', outline: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.2rem' }}
                onMouseOver={(e) => e.currentTarget.style.color = '#fff'}
                onMouseOut={(e) => e.currentTarget.style.color = '#666'}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <form onSubmit={guardarTurnoManual} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Nombre Cliente */}
              <div>
                <label style={{ display: 'block', fontSize: '0.68rem', color: '#737373', marginBottom: '0.4rem', fontFamily: "'Urbanist', sans-serif", fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nombre del Cliente (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Cliente de la Calle / María"
                  value={nombreCliente}
                  onInput={(e) => setNombreCliente(e.target.value)}
                  style={{ width: '100%', background: '#0d0d0d', border: '1px solid #262626', borderRadius: '0px', padding: '0.75rem', color: '#fff', fontSize: '0.8rem', fontFamily: "'Lato', sans-serif", outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {/* Servicio */}
              <div>
                <label style={{ display: 'block', fontSize: '0.68rem', color: '#737373', marginBottom: '0.4rem', fontFamily: "'Urbanist', sans-serif", fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Servicio Solicitado</label>
                <select
                  value={servicioSeleccionado}
                  onChange={(e) => setServicioSeleccionado(e.target.value)}
                  style={{ width: '100%', background: '#0d0d0d', border: '1px solid #262626', borderRadius: '0px', padding: '0.75rem', color: '#fff', fontSize: '0.8rem', fontFamily: "'Lato', sans-serif", outline: 'none', boxSizing: 'border-box' }}
                >
                  {servicios.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.nombre} (${s.precio_usd} USD)
                    </option>
                  ))}
                </select>
              </div>

              {/* Fecha y Hora en una fila */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.68rem', color: '#737373', marginBottom: '0.4rem', fontFamily: "'Urbanist', sans-serif", fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha del Turno</label>
                  <input
                    type="date"
                    value={fechaManual}
                    onChange={(e) => setFechaManual(e.target.value)}
                    style={{ width: '100%', background: '#0d0d0d', border: '1px solid #262626', borderRadius: '0px', padding: '0.75rem', color: '#fff', fontSize: '0.8rem', fontFamily: "'Lato', sans-serif", outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.68rem', color: '#737373', marginBottom: '0.4rem', fontFamily: "'Urbanist', sans-serif", fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hora del Turno</label>
                  <input
                    type="time"
                    value={horaManual}
                    onChange={(e) => setHoraManual(e.target.value)}
                    style={{ width: '100%', background: '#0d0d0d', border: '1px solid #262626', borderRadius: '0px', padding: '0.75rem', color: '#fff', fontSize: '0.8rem', fontFamily: "'Lato', sans-serif", outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Método de Pago */}
              <div>
                <label style={{ display: 'block', fontSize: '0.68rem', color: '#737373', marginBottom: '0.4rem', fontFamily: "'Urbanist', sans-serif", fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Método de Pago</label>
                <select
                  value={metodoPagoManual}
                  onChange={(e) => setMetodoPagoManual(e.target.value)}
                  style={{ width: '100%', background: '#0d0d0d', border: '1px solid #262626', borderRadius: '0px', padding: '0.75rem', color: '#fff', fontSize: '0.8rem', fontFamily: "'Lato', sans-serif", outline: 'none', boxSizing: 'border-box' }}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="pago_movil">Pago Móvil</option>
                  <option value="punto">Punto de Venta</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowModalManual(false)}
                  style={{
                    flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid #262626',
                    borderRadius: '0px', color: '#a3a3a3', fontSize: '0.74rem', fontWeight: 'bold', cursor: 'pointer',
                    textTransform: 'uppercase', letterSpacing: '0.05em'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#444'; }}
                  onMouseOut={(e) => { e.currentTarget.style.color = '#a3a3a3'; e.currentTarget.style.borderColor = '#262626'; }}
                >
                  Cancelar
                </button>
                
                <button
                  type="submit"
                  style={{
                    flex: 1.5, padding: '0.75rem', background: '#ba8f57', border: 'none',
                    borderRadius: '0px', color: '#000', fontSize: '0.74rem', fontWeight: 'bold', cursor: 'pointer',
                    textTransform: 'uppercase', letterSpacing: '0.05em'
                  }}
                >
                  Guardar Turno
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
