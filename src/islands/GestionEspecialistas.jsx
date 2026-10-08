import { useState } from 'preact/hooks';
import { supabase } from '../lib/supabase';

export default function GestionEspecialistas({ negocioId = '', configInicial = {}, plan = 'gratis' }) {
  const [config, setConfig] = useState(configInicial || {});
  const specialists = config.specialists || [];
  
  // Form fields
  const [fullName, setFullName] = useState('');
  const [specialtiesText, setSpecialtiesText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Handle adding specialist
  const handleAddSpecialist = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!fullName.trim()) {
      setErrorMessage('El nombre completo es requerido.');
      return;
    }

    // Client-side limits verification
    const currentCount = specialists.length;
    if (plan === 'gratis' && currentCount >= 1) {
      setShowUpgradeModal(true);
      return;
    }
    if (plan === 'plata' && currentCount >= 3) {
      setShowUpgradeModal(true);
      return;
    }

    setIsSaving(true);

    try {
      const specialtiesArray = specialtiesText
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const newSpecialist = {
        id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        full_name: fullName.trim(),
        specialties: specialtiesArray
      };

      const updatedSpecialists = [...specialists, newSpecialist];
      const updatedConfig = { ...config, specialists: updatedSpecialists };

      const { error } = await supabase
        .from('negocios')
        .update({ config: updatedConfig })
        .eq('id', negocioId);

      if (error) throw error;

      setConfig(updatedConfig);
      setFullName('');
      setSpecialtiesText('');
    } catch (err) {
      console.error('Error al agregar especialista:', err);
      setErrorMessage(err.message || 'Error al intentar guardar especialista.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle deleting specialist
  const handleDeleteSpecialist = async (id) => {
    if (!confirm('¿Seguro que deseas eliminar este especialista de tu equipo?')) return;
    setErrorMessage('');
    setIsSaving(true);

    try {
      const updatedSpecialists = specialists.filter(spec => spec.id !== id);
      const updatedConfig = { ...config, specialists: updatedSpecialists };

      const { error } = await supabase
        .from('negocios')
        .update({ config: updatedConfig })
        .eq('id', negocioId);

      if (error) throw error;

      setConfig(updatedConfig);
    } catch (err) {
      console.error('Error al eliminar especialista:', err);
      setErrorMessage('Error al intentar eliminar especialista.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ fontFamily: "'Urbanist', sans-serif" }}>
      
      {/* Mensaje de error si ocurre alguno */}
      {errorMessage && (
        <p style={{
          fontFamily: "'Lato', sans-serif",
          fontSize: '0.8rem',
          color: '#ef4444',
          marginBottom: '1.5rem',
          padding: '0.75rem 0.9rem',
          background: 'rgba(239,68,68,0.05)',
          borderRadius: '0px',
          borderLeft: '2px solid #ef4444'
        }}>
          {errorMessage}
        </p>
      )}

      {/* ════════════════════════════════════
           FORMULARIO DE ESPECIALISTA
      ═════════════════════════════════════ */}
      <section style={{
        background: '#0a0a0a',
        border: '1px solid #1a1a1a',
        borderRadius: '0px',
        padding: '1.75rem',
        marginBottom: '2.5rem'
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
          letterSpacing: '0.04em',
          width: '100%'
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ba8f57" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="8.5" cy="7" r="4"></circle>
            <line x1="20" y1="8" x2="20" y2="14"></line>
            <line x1="23" y1="11" x2="17" y2="11"></line>
          </svg>
          <span style={{ flex: 1 }}>Registrar Especialista</span>

          {(plan === 'gratis' || plan === 'plata') && (
            <button 
              type="button"
              onClick={() => setShowUpgradeModal(true)} 
              style={{
                fontSize: '0.68rem',
                color: '#ba8f57',
                background: 'rgba(186,143,87,0.06)',
                border: '1px solid rgba(186,143,87,0.2)',
                padding: '0.25rem 0.6rem',
                borderRadius: '0px',
                fontWeight: '800',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.2rem',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = '#ba8f57'; e.currentTarget.style.color = '#000'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(186,143,87,0.06)'; e.currentTarget.style.color = '#ba8f57'; }}
            >
              ⚡ Mejora tu plan
            </button>
          )}
        </h2>

        <form onSubmit={handleAddSpecialist} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1.12fr 0.88fr', gap: '1rem' }} class="form-row-responsive">
            
            {/* Nombre Completo */}
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
                Nombre Completo *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ej: Carmen Margot Pérez"
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

            {/* Especialidades */}
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
                Especialidades (Separadas por coma)
              </label>
              <input
                type="text"
                value={specialtiesText}
                onChange={(e) => setSpecialtiesText(e.target.value)}
                placeholder="Ej: Manicure, Nail Art, Depilación"
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

          </div>

          <button
            type="submit"
            disabled={isSaving}
            style={{
              width: '100%',
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
              cursor: isSaving ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: isSaving ? 0.7 : 1
            }}
            onMouseOver={(e) => { if (!isSaving) e.currentTarget.style.background = '#fff'; }}
            onMouseOut={(e) => { if (!isSaving) e.currentTarget.style.background = '#ba8f57'; }}
          >
            {isSaving ? 'Guardando...' : 'Añadir Especialista'}
          </button>
        </form>
      </section>

      {/* ════════════════════════════════════
           LISTADO DE ESPECIALISTAS
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
          Equipo Registrado
          <span style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.78rem', fontWeight: '400', color: '#555', textTransform: 'none', letterSpacing: '0', display: 'flex', alignItems: 'center' }}>
            {specialists.length} en total
            {(plan === 'gratis' || plan === 'plata') && (
              <button 
                type="button" 
                onClick={() => setShowUpgradeModal(true)} 
                style={{
                  marginLeft: '0.75rem',
                  background: 'transparent',
                  border: 'none',
                  color: '#ba8f57',
                  fontFamily: "'Urbanist', sans-serif",
                  fontSize: '0.72rem',
                  fontWeight: '800',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                  padding: 0,
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.color = '#fff'}
                onMouseOut={(e) => e.currentTarget.style.color = '#ba8f57'}
              >
                ⚡ Mejora tu plan
              </button>
            )}
          </span>
        </h2>

        {specialists.length === 0 ? (
          <div style={{ background: '#0a0a0a', border: '1px dashed #262626', borderRadius: '0px', padding: '3rem', textAlign: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#525252" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style={{ margin: '0 auto 1rem', display: 'block' }}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <p style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.88rem', color: '#737373', margin: 0 }}>
              Aún no tienes especialistas registrados. Añade el primero usando el formulario.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {specialists.map((spec) => (
              <div 
                key={spec.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  background: '#0a0a0a',
                  border: '1px solid #1a1a1a',
                  borderRadius: '0px',
                  padding: '1.1rem 1.3rem'
                }}
                class="service-card-hover"
              >
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontFamily: "'Urbanist', sans-serif",
                    fontWeight: '900',
                    fontSize: '0.95rem',
                    color: '#fff',
                    margin: 0,
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em'
                  }}>
                    {spec.full_name}
                  </p>
                  
                  {spec.specialties && spec.specialties.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                      {spec.specialties.map((sp, idx) => (
                        <span key={idx} style={{
                          fontFamily: "'Urbanist', sans-serif",
                          fontSize: '8.5px',
                          fontWeight: '900',
                          letterSpacing: '0.04em',
                          color: '#ba8f57',
                          background: 'rgba(186, 143, 87, 0.04)',
                          border: '1px solid rgba(186, 143, 87, 0.12)',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '0px',
                          textTransform: 'uppercase'
                        }}>
                          {sp}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Acciones */}
                <button
                  type="button"
                  title="Eliminar especialista"
                  onClick={() => handleDeleteSpecialist(spec.id)}
                  disabled={isSaving}
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
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ════════════════════════════════════
           MODAL DE MEJORA DE PLAN (UPGRADE)
      ═════════════════════════════════════ */}
      {showUpgradeModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(3, 3, 3, 0.93)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1.5rem',
          overflowY: 'auto'
        }}>
          <div style={{
            background: '#0a0a0a',
            border: '1px solid #262626',
            borderRadius: '0px',
            width: '100%',
            maxWidth: '750px',
            padding: '2.25rem',
            position: 'relative',
            boxShadow: '0 30px 60px -15px rgba(0,0,0,0.8)'
          }}>
            {/* Botón Cerrar */}
            <button
              onClick={() => setShowUpgradeModal(false)}
              style={{
                position: 'absolute',
                top: '1.25rem',
                right: '1.25rem',
                background: 'transparent',
                border: 'none',
                color: '#737373',
                fontSize: '1.25rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                padding: '0.2rem'
              }}
              onMouseOver={(e) => e.currentTarget.style.color = '#fff'}
              onMouseOut={(e) => e.currentTarget.style.color = '#737373'}
            >
              ✕
            </button>

            {/* Encabezado */}
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <span style={{
                background: 'rgba(186, 143, 87, 0.08)',
                color: '#ba8f57',
                fontFamily: "'Urbanist', sans-serif",
                fontSize: '10px',
                fontWeight: '900',
                letterSpacing: '0.12em',
                padding: '0.3rem 0.8rem',
                borderRadius: '0px',
                textTransform: 'uppercase',
                display: 'inline-block',
                marginBottom: '0.6rem'
              }}>
                Mejora tu Plan de Negocios
              </span>
              <h3 style={{
                fontFamily: "'Urbanist', sans-serif",
                fontWeight: '900',
                fontSize: '1.5rem',
                color: '#fff',
                margin: 0,
                textTransform: 'uppercase',
                letterSpacing: '-0.01em'
              }}>
                Eleva tu potencial en CHIKILUKY
              </h3>
              <p style={{
                fontFamily: "'Lato', sans-serif",
                fontSize: '0.8rem',
                color: '#737373',
                marginTop: '0.4rem',
                maxWidth: '480px',
                marginLeft: 'auto',
                marginRight: 'auto',
                lineHeight: '1.4'
              }}>
                Has alcanzado el límite de tu plan para agregar especialistas. Elige la suscripción que mejor se adapte y potencia tu equipo hoy.
              </p>
            </div>

            {/* Grid de Planes */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '1rem'
            }} class="plans-grid-responsive">
              
              {/* PLAN GRATIS */}
              <div style={{
                background: '#0d0d0d',
                border: '1px solid #1a1a1a',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                opacity: 0.55
              }}>
                <h4 style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: '900', fontSize: '0.8rem', color: '#737373', margin: '0 0 0.5rem 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>GRATIS</h4>
                <div style={{ margin: '0.5rem 0 1rem' }}>
                  <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: '900', fontSize: '1.75rem', color: '#fff' }}>$0</span>
                  <span style={{ color: '#737373', fontSize: '0.78rem', fontFamily: "'Lato', sans-serif" }}> / siempre</span>
                </div>
                <div style={{
                  borderTop: '1px solid #222',
                  paddingTop: '1rem',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  fontSize: '0.78rem',
                  fontFamily: "'Lato', sans-serif",
                  color: '#737373',
                  marginBottom: '1.5rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>✓</span> Máx 3 servicios
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>✓</span> Máx 1 especialista
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>✓</span> Agenda digital básica
                  </div>
                </div>
                <button
                  disabled
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: '#161616',
                    color: '#555',
                    border: 'none',
                    fontSize: '10px',
                    fontWeight: '900',
                    fontFamily: "'Urbanist', sans-serif",
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    cursor: 'not-allowed'
                  }}
                >
                  Plan activo
                </button>
              </div>

              {/* PLAN PLATA */}
              <div style={{
                background: '#0e0e0e',
                border: '1px solid #ba8f57',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                boxShadow: '0 10px 30px rgba(186,143,87,0.04)',
                opacity: plan === 'plata' ? 0.7 : 1
              }}>
                {plan !== 'plata' && (
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#ba8f57',
                    color: '#000',
                    fontSize: '8px',
                    fontWeight: '900',
                    fontFamily: "'Urbanist', sans-serif",
                    padding: '0.2rem 0.6rem',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase'
                  }}>
                    Más Popular
                  </div>
                )}
                <h4 style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: '900', fontSize: '0.8rem', color: '#ba8f57', margin: '0 0 0.5rem 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>PLATA</h4>
                <div style={{ margin: '0.5rem 0 1rem' }}>
                  <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: '900', fontSize: '1.75rem', color: '#fff' }}>$15</span>
                  <span style={{ color: '#737373', fontSize: '0.78rem', fontFamily: "'Lato', sans-serif" }}> / 30 días</span>
                </div>
                <div style={{
                  borderTop: '1px solid rgba(186,143,87,0.2)',
                  paddingTop: '1rem',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  fontSize: '0.78rem',
                  fontFamily: "'Lato', sans-serif",
                  color: '#cccccc',
                  marginBottom: '1.5rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ color: '#ba8f57', fontWeight: 'bold' }}>✓</span> Servicios <strong style={{ color: '#fff' }}>ILIMITADOS</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ color: '#ba8f57', fontWeight: 'bold' }}>✓</span> Máximo 3 especialistas
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ color: '#ba8f57', fontWeight: 'bold' }}>✓</span> Pago Móvil activo ilimitado
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ color: '#ba8f57', fontWeight: 'bold' }}>✓</span> Soporte prioritario
                  </div>
                </div>
                {plan === 'plata' ? (
                  <button
                    disabled
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: '#161616',
                      color: '#555',
                      border: 'none',
                      fontSize: '10px',
                      fontWeight: '900',
                      fontFamily: "'Urbanist', sans-serif",
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      cursor: 'not-allowed'
                    }}
                  >
                    Plan activo
                  </button>
                ) : (
                  <a
                    href="/app/experto/pagar?plan=plata"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(186, 143, 87, 0.1)',
                      border: '1px solid #ba8f57',
                      color: '#ba8f57',
                      fontSize: '10px',
                      fontWeight: '900',
                      fontFamily: "'Urbanist', sans-serif",
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      textAlign: 'center',
                      textDecoration: 'none',
                      transition: 'all 0.2s',
                      boxSizing: 'border-box'
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.background = '#ba8f57'; e.currentTarget.style.color = '#000'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(186, 143, 87, 0.1)'; e.currentTarget.style.color = '#ba8f57'; }}
                  >
                    Contratar por 30 días
                  </a>
                )}
              </div>

              {/* PLAN ORO */}
              <div style={{
                background: '#0d0d0d',
                border: '1px solid #262626',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative'
              }}>
                <h4 style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: '900', fontSize: '0.8rem', color: '#fff', margin: '0 0 0.5rem 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>ORO</h4>
                <div style={{ margin: '0.5rem 0 1rem' }}>
                  <span style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: '900', fontSize: '1.75rem', color: '#fff' }}>$30</span>
                  <span style={{ color: '#737373', fontSize: '0.78rem', fontFamily: "'Lato', sans-serif" }}> / 30 días</span>
                </div>
                <div style={{
                  borderTop: '1px solid #222',
                  paddingTop: '1rem',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  fontSize: '0.78rem',
                  fontFamily: "'Lato', sans-serif",
                  color: '#a3a3a3',
                  marginBottom: '1.5rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#fff' }}>
                    <span style={{ color: '#ba8f57', fontWeight: 'bold' }}>✓</span> Todo <strong style={{ color: '#fff' }}>ILIMITADO</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ color: '#ba8f57', fontWeight: 'bold' }}>✓</span> Especialistas ilimitados
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#fff' }}>
                    <span style={{ color: '#ba8f57', fontWeight: 'bold' }}>✓</span> Módulo financiero completo
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ color: '#ba8f57', fontWeight: 'bold' }}>✓</span> Soporte VIP exclusivo
                  </div>
                </div>
                <a
                  href="/app/experto/pagar?plan=oro"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: '#fff',
                    color: '#000',
                    border: 'none',
                    fontSize: '10px',
                    fontWeight: '900',
                    fontFamily: "'Urbanist', sans-serif",
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                    textDecoration: 'none',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = '#ba8f57'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = '#fff'; }}
                >
                  Contratar por 30 días
                </a>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Estilos e inyecciones de CSS Responsivo */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 580px) {
          .form-row-responsive {
            grid-template-columns: 1fr !important;
            gap: 1.25rem !important;
          }
          .plans-grid-responsive {
            grid-template-columns: 1fr !important;
            gap: 1.5rem !important;
          }
        }
        .service-card-hover:hover {
          border-color: #404040 !important;
        }
        .btn-delete-hover:hover {
          background: rgba(239,68,68,0.05) !important;
          border-color: rgba(239,68,68,0.5) !important;
        }
      `}} />
    </div>
  );
}
