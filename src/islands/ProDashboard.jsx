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
      const { data: dataReservas, error: errReservas } = await supabase
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

      if (errReservas) throw errReservas;

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
      const hoyStr = new Date().toISOString().split('T')[0];
      const ahora = new Date();
      const horaStr = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}:00`;

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
          pago_metodo: metodoPagoManual,
          pago_referencia: 'REGISTRO MANUAL (OFFLINE)',
          pago_estado: 'verificado'
        }])
        .select()
        .single();

      if (errRes) throw errRes;

      // 2. Guardar compatible en legacy 'citas'
      const endTime = new Date();
      endTime.setMinutes(endTime.getMinutes() + 60);

      await supabase.from('citas').insert([{
        client_id: null,
        business_id: negocio.id,
        expert_id: profesionalId,
        servicio: serv.nombre,
        start_time: ahora.toISOString(),
        end_time: endTime.toISOString(),
        status: 'completada',
        price_usd: parseFloat(serv.precio_usd),
        price_bs: Math.round(parseFloat(serv.precio_usd) * tasaBcv * 100) / 100,
        comprobante_referencia: 'REGISTRO MANUAL',
        notas: `Turno manual offline: ${nombreCliente || 'Cliente de la Calle'}`
      }]);

      setExitoMsg('Turno offline registrado con éxito.');
      setShowModalManual(false);

      // Añadir reactivamente al listado local para recalcular balance instantáneamente
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

      // Resetear campos
      setNombreCliente('');
    } catch (err) {
      console.error('Error al guardar turno manual:', err);
      setErrorMsg('Error al registrar el turno en Supabase.');
    }
  }

  return (
    <div>
      {/* Saludo y Filtro de Fecha */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <p style={{ fontSize: '0.7rem', letterSpacing: '0.16em', color: '#ba8f57', textTransform: 'uppercase', margin: '0 0 0.2rem 0' }}>Panel Pro</p>
          <h2 style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 900, fontSize: '1.35rem', color: '#fff', margin: 0 }}>
            {fullName ? fullName.split(' ')[0] : 'Administrador'} 👋
          </h2>
          <span style={{ fontSize: '0.78rem', color: '#555' }}>{negocio.name}</span>
        </div>
        
        <div>
          <input
            type="date"
            value={fechaFiltro}
            onChange={(e) => setFechaFiltro(e.target.value)}
            style={{
              background: '#111', border: '1px solid rgba(186,143,87,0.25)',
              borderRadius: '0.5rem', padding: '0.5rem 0.75rem', color: '#fff',
              fontSize: '0.82rem', fontFamily: "'Lato', sans-serif", outline: 'none'
            }}
          />
        </div>
      </div>

      {/* Alertas de Feedback */}
      {exitoMsg && (
        <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: '0.5rem', padding: '0.75rem', color: '#4ade80', fontSize: '0.78rem', marginBottom: '1.5rem', textAlign: 'center' }}>
          ✅ {exitoMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.5rem', padding: '0.75rem', color: '#ef4444', fontSize: '0.78rem', marginBottom: '1.5rem', textAlign: 'center' }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* 1. GRID DE MÉTRICAS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.65rem', marginBottom: '2rem' }}>
        {/* Balance Total */}
        <div style={{ background: '#111', border: '1px solid rgba(186,143,87,0.18)', borderRadius: '0.85rem', padding: '1rem' }}>
          <span style={{ fontSize: '1.2rem', display: 'block', marginBottom: '0.2rem' }}>💰</span>
          <span style={{ display: 'block', fontSize: '0.65rem', color: '#666', textTransform: 'uppercase', fontWeight: 'bold' }}>Balance del Día</span>
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 900, fontSize: '1.2rem', color: '#fff', display: 'block', margin: '0.15rem 0' }}>
            ${metricaBalanceUsd.toFixed(0)} USD
          </span>
          <span style={{ fontSize: '0.65rem', color: '#ba8f57', fontWeight: 'bold' }}>
            {convertirRefABs(metricaBalanceUsd, tasaBcv)}
          </span>
        </div>

        {/* Pendientes de verificación */}
        <div style={{ background: '#111', border: '1px solid rgba(186,143,87,0.18)', borderRadius: '0.85rem', padding: '1rem' }}>
          <span style={{ fontSize: '1.2rem', display: 'block', marginBottom: '0.2rem' }}>⏳</span>
          <span style={{ display: 'block', fontSize: '0.65rem', color: '#666', textTransform: 'uppercase', fontWeight: 'bold' }}>Por Verificar</span>
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 900, fontSize: '1.45rem', color: metricaPendientes > 0 ? '#60a5fa' : '#fff', display: 'block', margin: '0.15rem 0' }}>
            {metricaPendientes}
          </span>
          <span style={{ fontSize: '0.65rem', color: '#555' }}>citas pendientes</span>
        </div>

        {/* Ocupación */}
        <div style={{ background: '#111', border: '1px solid rgba(186,143,87,0.18)', borderRadius: '0.85rem', padding: '1rem' }}>
          <span style={{ fontSize: '1.2rem', display: 'block', marginBottom: '0.2rem' }}>📅</span>
          <span style={{ display: 'block', fontSize: '0.65rem', color: '#666', textTransform: 'uppercase', fontWeight: 'bold' }}>Ocupación</span>
          <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 900, fontSize: '1.45rem', color: '#4ade80', display: 'block', margin: '0.15rem 0' }}>
            {metricaOcupacion}
          </span>
          <span style={{ fontSize: '0.65rem', color: '#555' }}>citas agendadas</span>
        </div>
      </div>

      {/* Botón flotante para registro manual */}
      <div style={{ marginBottom: '1.5rem', textAlign: 'right' }}>
        <button
          onClick={() => setShowModalManual(true)}
          class="btn-gold"
          style={{ padding: '0.65rem 1.25rem', fontSize: '0.78rem', borderRadius: '9999px', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <span>➕</span> Registrar Turno Manual
        </button>
      </div>

      {/* 2. EL CALENDARIO DIARIO / LISTA DE AGENDA */}
      <div style={{ background: '#111', border: '1px solid rgba(186,143,87,0.15)', borderRadius: '1rem', padding: '1.5rem' }}>
        <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ba8f57', marginBottom: '1.25rem', display: 'block' }}>
          AGENDA DE CITAS - CRONOGRAMA DIARIO
        </span>

        {cargando ? (
          <p style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.85rem', color: '#555', textAlign: 'center' }}>Cargando agenda del día...</p>
        ) : reservas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>🌴</span>
            <p style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.83rem', color: '#555', margin: 0 }}>No hay citas agendadas para esta fecha.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {reservas.map(r => {
              const esPendiente = r.estado === 'pendiente_verificacion' || r.pagoEstado === 'pendiente_verificacion';
              
              return (
                <div
                  key={r.id}
                  style={{
                    background: '#161616', border: '1px solid rgba(255,255,255,0.03)',
                    borderRadius: '0.75rem', padding: '1rem', transition: 'all 0.2s',
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
                      <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 900, fontSize: '1rem', color: '#ba8f57', display: 'block', marginBottom: '0.2rem' }}>
                        ⏰ {r.hora}
                      </span>
                      
                      {/* Cliente */}
                      <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '0.92rem', color: '#fff', display: 'block' }}>
                        {r.clienteName}
                      </span>
                      
                      {/* Servicio */}
                      <span style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.78rem', color: '#888', display: 'block', marginTop: '0.15rem' }}>
                        Servicio: <strong>{r.servicioName}</strong>
                      </span>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      {/* Precio */}
                      <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '0.95rem', color: '#fff', display: 'block' }}>
                        ${r.precioUsd} USD
                      </span>
                      <span style={{ display: 'block', fontSize: '0.68rem', color: '#666', marginTop: '0.1rem' }}>
                        {convertirRefABs(r.precioUsd, tasaBcv)}
                      </span>
                      
                      {/* Badge de Pago */}
                      <span
                        style={{
                          display: 'inline-block', fontSize: '0.65rem', fontWeight: 'bold',
                          textTransform: 'uppercase', borderRadius: '9999px', padding: '0.2rem 0.5rem',
                          marginTop: '0.5rem',
                          background: esPendiente ? 'rgba(96,165,250,0.1)' : (r.pagoEstado === 'rechazado' ? 'rgba(239,68,68,0.1)' : 'rgba(186,143,87,0.15)'),
                          color: esPendiente ? '#60a5fa' : (r.pagoEstado === 'rechazado' ? '#ef4444' : '#ba8f57'),
                          border: esPendiente ? '1px solid rgba(96,165,250,0.25)' : (r.pagoEstado === 'rechazado' ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(186,143,87,0.35)')
                        }}
                      >
                        {esPendiente ? 'Por Verificar' : (r.pagoEstado === 'rechazado' ? 'Rechazado' : r.pagoMetodo.replace('_', ' '))}
                      </span>
                    </div>
                  </div>

                  {/* Detalles adicionales para comprobantes por verificar */}
                  {esPendiente && (
                    <div style={{ background: '#0a0a0a', border: '1px solid rgba(96,165,250,0.15)', borderRadius: '0.5rem', padding: '0.75rem', marginTop: '0.85rem', marginLeft: '0.5rem', fontSize: '0.78rem', color: '#aaa' }}>
                      <p style={{ margin: '0 0 0.4rem 0', fontWeight: 'bold', color: '#60a5fa', fontSize: '0.7rem', letterSpacing: '0.05em' }}>REPORTADO POR EL CLIENTE:</p>
                      {r.pagoMetodo === 'pago_movil' ? (
                        <div>
                          <span>Banco Emisor: <strong>{r.pagoBancoEmisor || 'No especificado'}</strong></span>
                          <span style={{ display: 'block', marginTop: '0.15rem' }}>Referencia: <strong>{r.pagoReferencia || 'No reportada'}</strong></span>
                        </div>
                      ) : (
                        <div>
                          <span>Nombre de Cuenta / Ref: <strong>{r.pagoReferencia || 'No reportado'}</strong></span>
                        </div>
                      )}

                      {/* Botones de Aprobación Condicional */}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem' }}>
                        <button
                          onClick={() => rechazarPago(r.id, r.source)}
                          style={{
                            flex: 1, padding: '0.45rem', background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.4rem',
                            color: '#ef4444', fontSize: '0.72rem', fontWeight: 'bold', cursor: 'pointer'
                          }}
                        >
                          Rechazar
                        </button>
                        
                        <button
                          onClick={() => aprobarPago(r.id, r.source)}
                          style={{
                            flex: 2, padding: '0.45rem', background: '#ba8f57',
                            border: 'none', borderRadius: '0.4rem',
                            color: '#111', fontSize: '0.72rem', fontWeight: 'bold', cursor: 'pointer'
                          }}
                        >
                          Aprobar Pago
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Si es efectivo, recuerda cobrar */}
                  {r.pagoMetodo === 'efectivo' && !esPendiente && (
                    <div style={{ background: 'rgba(186,143,87,0.06)', border: '1px solid rgba(186,143,87,0.15)', borderRadius: '0.5rem', padding: '0.6rem 0.75rem', marginTop: '0.85rem', marginLeft: '0.5rem', fontSize: '0.75rem', color: '#ccc', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>💵</span>
                      <span><strong>Cobrar en Local:</strong> Pagar en efectivo o tarjeta física antes del servicio.</span>
                    </div>
                  )}

                  {/* Acciones generales: CHAT */}
                  {r.clienteId && (
                    <div style={{ marginTop: '0.75rem', textAlign: 'right', paddingLeft: '0.5rem' }}>
                      <a
                        href="/app/experto/soporte"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                          fontFamily: "'Urbanist', sans-serif", fontSize: '0.72rem', fontWeight: '700',
                          color: '#ba8f57', textDecoration: 'none', border: '1px solid rgba(186,143,87,0.25)',
                          padding: '0.3rem 0.65rem', borderRadius: '9999px'
                        }}
                      >
                        💬 Chat con Cliente
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div style={{ background: '#111', border: '1px solid #ba8f57', borderRadius: '1.25rem', width: '100%', maxWidth: '420px', padding: '1.75rem', boxShadow: '0 20px 40px rgba(0,0,0,0.9)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 900, fontSize: '1.15rem', color: '#fff', margin: 0 }}>Registrar Turno Manual</h3>
              <button
                onClick={() => setShowModalManual(false)}
                style={{ background: 'transparent', border: 'none', color: '#666', fontSize: '1.4rem', cursor: 'pointer', outline: 'none' }}
              >
                ×
              </button>
            </div>

            <form onSubmit={guardarTurnoManual} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Nombre Cliente */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#999', marginBottom: '0.25rem', fontFamily: "'Lato', sans-serif" }}>Nombre del Cliente (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Cliente de la Calle / María"
                  value={nombreCliente}
                  onInput={(e) => setNombreCliente(e.target.value)}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid rgba(186,143,87,0.25)', borderRadius: '0.4rem', padding: '0.6rem 0.75rem', color: '#fff', fontSize: '0.83rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {/* Servicio */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#999', marginBottom: '0.25rem', fontFamily: "'Lato', sans-serif" }}>Servicio Solicitado</label>
                <select
                  value={servicioSeleccionado}
                  onChange={(e) => setServicioSeleccionado(e.target.value)}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid rgba(186,143,87,0.25)', borderRadius: '0.4rem', padding: '0.6rem 0.75rem', color: '#fff', fontSize: '0.83rem', outline: 'none', boxSizing: 'border-box' }}
                >
                  {servicios.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.nombre} (${s.precio_usd} USD)
                    </option>
                  ))}
                </select>
              </div>

              {/* Método de Pago */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#999', marginBottom: '0.25rem', fontFamily: "'Lato', sans-serif" }}>Método de Pago</label>
                <select
                  value={metodoPagoManual}
                  onChange={(e) => setMetodoPagoManual(e.target.value)}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid rgba(186,143,87,0.25)', borderRadius: '0.4rem', padding: '0.6rem 0.75rem', color: '#fff', fontSize: '0.83rem', outline: 'none', boxSizing: 'border-box' }}
                >
                  <option value="efectivo">💵 Efectivo</option>
                  <option value="pago_movil">📱 Pago Móvil</option>
                  <option value="punto">💳 Punto de Venta</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowModalManual(false)}
                  style={{
                    flex: 1, padding: '0.75rem', background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '2rem', color: '#aaa', fontSize: '0.78rem', fontWeight: 'bold', cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                
                <button
                  type="submit"
                  style={{
                    flex: 2, padding: '0.75rem', background: '#ba8f57', border: 'none',
                    borderRadius: '2rem', color: '#111', fontSize: '0.78rem', fontWeight: 'bold', cursor: 'pointer'
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
