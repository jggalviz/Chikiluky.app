import { useState, useEffect } from 'preact/hooks';
import { supabase } from '../lib/supabase';
import { convertirRefABs } from '../utils/currency';

export default function GestionServicios({ serviciosIniciales = [], tasaBcvInicial = 40.00, negocioName = '' }) {
  const [servicios, setServicios] = useState(serviciosIniciales);
  const [editingService, setEditingService] = useState(null);

  // Campos del formulario
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('');
  const [duracion, setDuracion] = useState(60);
  const [precioUsd, setPrecioUsd] = useState('');
  
  const [tasaBcv, setTasaBcv] = useState(tasaBcvInicial);
  const [isLoadingTasa, setIsLoadingTasa] = useState(true);

  // 1. Obtener la tasa de cambio más reciente del BCV y suscribirse a actualizaciones
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
      } finally {
        setIsLoadingTasa(false);
      }
    }

    fetchTasa();

    const channel = supabase
      .channel('config-changes-servicios')
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

  // Activar modo edición
  const handleEditClick = (service) => {
    setEditingService(service);
    setNombre(service.nombre || '');
    setCategoria(service.categoria || '');
    setDuracion(service.duracion_min || 60);
    setPrecioUsd(service.precio_usd ? String(service.precio_usd) : '');
    
    // Hacer scroll suave hacia el formulario
    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  // Cancelar modo edición
  const handleCancelEdit = () => {
    setEditingService(null);
    setNombre('');
    setCategoria('');
    setDuracion(60);
    setPrecioUsd('');
  };

  // Cálculo matemático de Bs
  const precioBsCalculado = precioUsd && tasaBcv 
    ? Math.round(parseFloat(precioUsd) * tasaBcv * 100) / 100 
    : 0;

  const textoBsFormateado = convertirRefABs(precioUsd, tasaBcv);

  // Lista de categorías estandarizadas
  const categoriasDisponibles = [
    'Peluquería',
    'Barbería',
    'Uñas',
    'Estética y Cejas',
    'Masajes y Spa',
    'Maquillaje',
    'Tatuajes',
    'Depilación',
    'Podología'
  ];

  // Duraciones tabuladas en bloques de 15 minutos
  const opcionesDuracion = [
    { value: 15, label: '15 minutos' },
    { value: 30, label: '30 minutos' },
    { value: 45, label: '45 minutos' },
    { value: 60, label: '1 hora (60 min)' },
    { value: 75, label: '1 hora 15 min' },
    { value: 90, label: '1 hora 30 min' },
    { value: 105, label: '1 hora 45 min' },
    { value: 120, label: '2 horas' },
    { value: 135, label: '2 horas 15 min' },
    { value: 150, label: '2 horas 30 min' },
    { value: 165, label: '2 horas 45 min' },
    { value: 180, label: '3 horas' },
    { value: 210, label: '3 horas 30 min' },
    { value: 240, label: '4 horas' }
  ];

  return (
    <div style={{ fontFamily: "'Urbanist', sans-serif" }}>
      
      {/* ════════════════════════════════════
           FORMULARIO DE SERVICIO
      ═════════════════════════════════════ */}
      <section style={{
        background: '#0a0a0a',
        border: '1px solid #1a1a1a',
        borderRadius: '0px',
        padding: '1.75rem',
        marginBottom: '2.5rem',
        boxShadow: 'none'
      }}>
        <h2 style={{
          fontFamily: "'Urbanist', sans-serif",
          fontWeight: '900',
          fontSize: '1rem',
          color: '#fff',
          margin: '0 0 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ba8f57" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            {editingService ? (
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            ) : (
              <>
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </>
            )}
          </svg>
          {editingService ? `Editar servicio: ${editingService.nombre}` : 'Añadir nuevo servicio'}
        </h2>

        <form method="POST" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <input type="hidden" name="_accion" value={editingService ? 'editar' : 'crear'} />
          {editingService && <input type="hidden" name="servicio_id" value={editingService.id} />}
          <input type="hidden" name="precio_bs" value={precioBsCalculado} />

          {/* Fila 1: Nombre del servicio + Categoría */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1rem' }} class="form-row-responsive">
            
            {/* Nombre */}
            <div>
              <label style={{
                fontFamily: "'Urbanist', sans-serif",
                fontWeight: '700',
                fontSize: '10px',
                color: '#ba8f57',
                display: 'block',
                marginBottom: '0.45rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase'
              }}>
                Nombre del servicio *
              </label>
              <input
                type="text"
                name="nombre"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Corte de Cabello, Balayage, Manicure..."
                style={{
                  width: '100%',
                  background: '#0d0d0d',
                  border: '1px solid #262626',
                  borderRadius: '0px',
                  padding: '0.8rem 1rem',
                  color: '#fff',
                  fontSize: '13.5px',
                  outline: 'none',
                  transition: 'all 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#ba8f57'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#262626'; }}
              />
            </div>

            {/* Categoría */}
            <div>
              <label style={{
                fontFamily: "'Urbanist', sans-serif",
                fontWeight: '700',
                fontSize: '10px',
                color: '#ba8f57',
                display: 'block',
                marginBottom: '0.45rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase'
              }}>
                Categoría *
              </label>
              <select
                name="categoria"
                required
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0d0d0d',
                  border: '1px solid #262626',
                  borderRadius: '0px',
                  padding: '0.8rem 1rem',
                  color: '#fff',
                  fontSize: '13.5px',
                  outline: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#ba8f57'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#262626'; }}
              >
                <option value="">Selecciona...</option>
                {categoriasDisponibles.map(cat => (
                  <option value={cat}>{cat}</option>
                ))}
              </select>
            </div>

          </div>

          {/* Fila 2: Duración + Precio */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

            {/* Duración (Minutos en bloques de 15min) */}
            <div>
              <label style={{
                fontFamily: "'Urbanist', sans-serif",
                fontWeight: '700',
                fontSize: '10px',
                color: '#ba8f57',
                display: 'block',
                marginBottom: '0.45rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase'
              }}>
                Duración (Bloques de 15m)
              </label>
              <select
                name="duracion"
                required
                value={duracion}
                onChange={(e) => setDuracion(parseInt(e.target.value) || 60)}
                style={{
                  width: '100%',
                  background: '#0d0d0d',
                  border: '1px solid #262626',
                  borderRadius: '0px',
                  padding: '0.8rem 1rem',
                  color: '#fff',
                  fontSize: '13.5px',
                  outline: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#ba8f57'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#262626'; }}
              >
                {opcionesDuracion.map(opc => (
                  <option value={opc.value}>{opc.label}</option>
                ))}
              </select>
            </div>

            {/* Precio USD ($REF) */}
            <div>
              <label style={{
                fontFamily: "'Urbanist', sans-serif",
                fontWeight: '700',
                fontSize: '10px',
                color: '#ba8f57',
                display: 'block',
                marginBottom: '0.45rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase'
              }}>
                Tarifa ($REF) *
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute',
                  left: '0.85rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#ba8f57',
                  fontSize: '14px',
                  fontWeight: '800'
                }}>$</span>
                <input
                  type="number"
                  name="precio_usd"
                  min="0.5"
                  step="0.5"
                  required
                  value={precioUsd}
                  onInput={(e) => setPrecioUsd(e.currentTarget.value)}
                  placeholder="0.00"
                  style={{
                    width: '100%',
                    background: '#0d0d0d',
                    border: '1px solid #262626',
                    borderRadius: '0px',
                    padding: '0.8rem 1rem 0.8rem 1.8rem',
                    color: '#fff',
                    fontSize: '13.5px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#ba8f57'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#262626'; }}
                />
              </div>
            </div>

          </div>

          {/* Badge de Equivalencia en Bolívares */}
          {precioUsd && parseFloat(precioUsd) > 0 && (
            <div style={{
              background: 'rgba(186, 143, 87, 0.04)',
              border: '1px solid rgba(186, 143, 87, 0.15)',
              borderRadius: '0px',
              padding: '0.9rem 1.2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              animation: 'fadeInSlide 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
            }}>
              <div>
                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 'bold', display: 'block', marginBottom: '0.15rem' }}>
                  Equivalencia BCV Oficial
                </span>
                <span style={{
                  fontFamily: "'Urbanist', sans-serif",
                  fontSize: '1.2rem',
                  fontWeight: '900',
                  color: '#fff',
                  letterSpacing: '0.02em'
                }}>
                  {textoBsFormateado}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.15rem' }}>
                  Tasa Aplicada
                </span>
                <span style={{ fontSize: '11px', color: '#ba8f57', fontWeight: 'bold' }}>
                  {tasaBcv.toFixed(2)} Bs/$
                </span>
              </div>
            </div>
          )}

          {/* Botones de acción del formulario */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="submit"
              style={{
                flex: 1,
                background: '#ba8f57',
                color: '#000',
                fontFamily: "'Urbanist', sans-serif",
                fontWeight: '900',
                fontSize: '11px',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                padding: '0.9rem',
                borderRadius: '0px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = '#fff'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = '#ba8f57'; }}
            >
              {editingService ? 'Guardar Cambios' : 'Guardar Servicio'}
            </button>

            {editingService && (
              <button
                type="button"
                onClick={handleCancelEdit}
                style={{
                  background: 'transparent',
                  color: '#737373',
                  fontFamily: "'Urbanist', sans-serif",
                  fontWeight: '700',
                  fontSize: '11px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '0.9rem 1.5rem',
                  borderRadius: '0px',
                  border: '1px solid #262626',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#404040'; }}
                onMouseOut={(e) => { e.currentTarget.style.color = '#737373'; e.currentTarget.style.borderColor = '#262626'; }}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </section>

      {/* ════════════════════════════════════
           TABLA DE SERVICIOS ACTUALES
      ═════════════════════════════════════ */}
      <section style={{ marginTop: '2.5rem' }}>
        <h2 style={{
          fontFamily: "'Urbanist', sans-serif",
          fontWeight: '900',
          fontSize: '1rem',
          color: '#fff',
          margin: '0 0 1.25rem 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          Servicios publicados
          <span style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.78rem', fontWeight: '400', color: '#555', textTransform: 'none', letterSpacing: '0' }}>
            {servicios.length} en total
          </span>
        </h2>

        {servicios.length === 0 ? (
          <div style={{ background: '#0a0a0a', border: '1px dashed #262626', borderRadius: '0px', padding: '3rem', textAlign: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#525252" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style={{ margin: '0 auto 1rem', display: 'block' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            <p style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.88rem', color: '#737373', margin: 0 }}>
              Aún no tienes servicios registrados. Añade el primero usando el formulario de arriba.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {servicios.map((s) => (
              <div 
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  background: '#0a0a0a',
                  border: editingService?.id === s.id ? '1px solid #ba8f57' : '1px solid #1a1a1a',
                  borderRadius: '0px',
                  padding: '1.1rem 1.3rem',
                  transition: 'border-color 0.18s'
                }}
                class="service-card-hover"
              >
                {/* Info del servicio */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <p style={{
                      fontFamily: "'Urbanist', sans-serif",
                      fontWeight: '900',
                      fontSize: '0.95rem',
                      color: '#fff',
                      margin: 0,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em'
                    }}>
                      {s.nombre}
                    </p>
                    {s.categoria && (
                      <span style={{
                        fontFamily: "'Urbanist', sans-serif",
                        fontSize: '9px',
                        fontWeight: '900',
                        letterSpacing: '0.04em',
                        color: '#ba8f57',
                        background: 'rgba(186, 143, 87, 0.05)',
                        border: '1px solid rgba(186, 143, 87, 0.15)',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '0px',
                        textTransform: 'uppercase'
                      }}>
                        {s.categoria}
                      </span>
                    )}
                  </div>
                  <p style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.72rem', color: '#737373', margin: '0.25rem 0 0', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ color: '#525252' }}>
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span>{s.duracion_min} minutos</span>
                  </p>
                </div>

                {/* Precios */}
                <div style={{ textAlign: 'right', flexShrink: 0, marginRight: '0.5rem' }}>
                  <p style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: '900', fontSize: '1.05rem', color: '#ba8f57', margin: 0 }}>
                    ${s.precio_usd?.toFixed(2)}
                  </p>
                  <p style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.68rem', color: '#525252', margin: '0.12rem 0 0', textTransform: 'uppercase', fontWeight: 'bold' }}>
                    {convertirRefABs(s.precio_usd, tasaBcv)}
                  </p>
                </div>

                {/* Acciones */}
                <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                  <button
                    type="button"
                    title="Editar servicio"
                    onClick={() => handleEditClick(s)}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(186,143,87,0.3)',
                      color: '#ba8f57',
                      padding: '0.35rem 0.65rem',
                      borderRadius: '0px',
                      cursor: 'pointer',
                      fontSize: '0.74rem',
                      fontWeight: 'bold',
                      transition: 'all 0.18s'
                    }}
                    class="btn-edit-hover"
                  >
                    ✎
                  </button>

                  <form method="POST" style={{ margin: 0 }}>
                    <input type="hidden" name="_accion" value="eliminar" />
                    <input type="hidden" name="servicio_id" value={s.id} />
                    <button
                      type="submit"
                      title="Eliminar servicio"
                      onClick={(e) => {
                        if (!confirm('¿Seguro que deseas eliminar este servicio?')) {
                          e.preventDefault();
                        }
                      }}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(239,68,68,0.25)',
                        color: '#ef4444',
                        padding: '0.35rem 0.65rem',
                        borderRadius: '0px',
                        cursor: 'pointer',
                        fontSize: '0.74rem',
                        fontWeight: 'bold',
                        transition: 'all 0.18s'
                      }}
                      class="btn-delete-hover"
                    >
                      ✕
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Estilos e inyecciones de CSS Responsivo */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 580px) {
          .form-row-responsive {
            grid-template-columns: 1fr !important;
            gap: 1.25rem !important;
          }
        }
        .service-card-hover:hover {
          border-color: #404040 !important;
        }
        .btn-edit-hover:hover {
          background: rgba(186,143,87,0.06) !important;
          border-color: #ba8f57 !important;
        }
        .btn-delete-hover:hover {
          background: rgba(239,68,68,0.05) !important;
          border-color: rgba(239,68,68,0.5) !important;
        }
        @keyframes fadeInSlide {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}} />
    </div>
  );
}
