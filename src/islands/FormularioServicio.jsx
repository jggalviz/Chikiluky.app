import { useState, useEffect } from 'preact/hooks';
import { supabase } from '../lib/supabase';
import { convertirRefABs } from '../utils/currency';

export default function FormularioServicio({ tasaBcvInicial = 40.00 }) {
  const [nombre, setNombre] = useState('');
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

    // Suscribirse a cambios en tiempo real en la tabla de configuración
    const channel = supabase
      .channel('config-changes')
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

  // Cálculo matemático del precio en Bolívares exacto para la base de datos (float)
  const precioBsCalculado = precioUsd && tasaBcv 
    ? Math.round(parseFloat(precioUsd) * tasaBcv * 100) / 100 
    : 0;

  // Texto formateado premium para el badge de la UI
  const textoBsFormateado = convertirRefABs(precioUsd, tasaBcv);

  return (
    <section style={{
      background: '#0a0a0a',
      border: '1px solid #1a1a1a',
      borderRadius: '0px',
      padding: '1.75rem',
      marginBottom: '2rem',
      boxShadow: 'none',
      fontFamily: "'Urbanist', sans-serif"
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
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Añadir nuevo servicio
      </h2>

      <form method="POST" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <input type="hidden" name="_accion" value="crear" />
        
        {/* Mandamos el valor calculado en Bs automáticamente al backend de Astro */}
        <input type="hidden" name="precio_bs" value={precioBsCalculado} />

        {/* Nombre del servicio */}
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
            placeholder="Ej: Corte de Cabello, Balayage, Manicure Semipermanente…"
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
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#ba8f57';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#262626';
            }}
          />
        </div>

        {/* Duración + Precio en fila */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

          {/* Duración */}
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
              Duración (min)
            </label>
            <input
              type="number"
              name="duracion"
              min="15"
              max="480"
              step="15"
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
                transition: 'all 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#ba8f57';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#262626';
              }}
            />
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
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#ba8f57';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#262626';
                }}
              />
            </div>
          </div>
        </div>

        {/* Badge Dinámico Equivalencia en Bolívares */}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 'bold' }}>
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
            
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Tasa Aplicada
              </span>
              <span style={{ fontSize: '11px', color: '#ba8f57', fontWeight: 'bold' }}>
                {tasaBcv.toFixed(2)} Bs/$
              </span>
            </div>
          </div>
        )}

        <button
          type="submit"
          style={{
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
            marginTop: '0.5rem',
            transition: 'all 0.2s',
            boxShadow: 'none'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = '#fff';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = '#ba8f57';
          }}
        >
          Guardar servicio
        </button>
      </form>

      {/* Animaciones Locales */}
      <style dangerouslySetInnerHTML={{ __html: `
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
    </section>
  );
}
