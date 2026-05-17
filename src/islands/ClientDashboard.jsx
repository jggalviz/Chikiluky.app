import { useState, useEffect, useRef } from 'preact/hooks';
import { createClient } from '@supabase/supabase-js';

// Inicializar cliente Supabase local para uso del lado del cliente
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function ClientDashboard({ clientUser, clientPerfil }) {
  const [activeTab, setActiveTab] = useState('reservas');
  const [reservas, setReservas] = useState([]);
  const [chats, setChats] = useState([]);
  
  // Chat activo
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [activeRoomProfName, setActiveRoomProfName] = useState('');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
  // Perfil
  const [profileName, setProfileName] = useState(clientPerfil?.full_name || '');
  const [profilePhone, setProfilePhone] = useState(clientPerfil?.telefono || '');
  const [profileEmail, setProfileEmail] = useState(clientUser?.email || '');

  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  const messagesEndRef = useRef(null);

  // Cargar sección desde el hash de la URL si existe al montar
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (['reservas', 'chats', 'perfil'].includes(hash)) {
      setActiveTab(hash);
    }
  }, []);

  // Sincronizar URL hash
  const changeTab = (tab) => {
    setActiveTab(tab);
    window.location.hash = tab;
    setStatusMsg({ type: '', text: '' });
  };

  // Cargar Reservas y Chats del Cliente
  useEffect(() => {
    if (!clientUser?.id) return;
    
    async function loadDashboardData() {
      setLoading(true);
      try {
        // 1. Obtener reservas
        const { data: resData, error: resErr } = await supabase
          .from('reservas')
          .select(`
            id,
            fecha,
            hora_inicio,
            estado,
            pago_metodo,
            pago_referencia,
            pago_estado,
            profesional:perfiles!reservas_profesional_id_fkey(full_name),
            servicio:servicios(nombre, precio_usd)
          `)
          .eq('cliente_id', clientUser.id)
          .order('fecha', { ascending: false })
          .order('hora_inicio', { ascending: false });

        if (resErr) throw resErr;
        setReservas(resData || []);

        // 2. Obtener salas de chat privadas del cliente
        const { data: chatData, error: chatErr } = await supabase
          .from('salas_chat')
          .select(`
            id,
            created_at,
            profesional:perfiles!salas_chat_profesional_id_fkey(id, full_name)
          `)
          .eq('sala_type', 'cliente_profesional')
          .eq('cliente_id', clientUser.id)
          .order('created_at', { ascending: false });

        if (chatErr) throw chatErr;
        setChats(chatData || []);
      } catch (err) {
        console.error('[ClientDashboard] Error al cargar datos:', err.message);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [clientUser?.id]);

  // Cargar mensajes al abrir una sala de chat
  useEffect(() => {
    if (!activeRoomId) return;

    async function loadMessages() {
      const { data, error } = await supabase
        .from('mensajes_chat')
        .select('*')
        .eq('sala_id', activeRoomId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data);
        setTimeout(scrollToBottom, 50);
      }
    }

    loadMessages();

    // Suscribirse a cambios en tiempo real
    const channel = supabase
      .channel(`public:mensajes_chat:sala_id=eq.${activeRoomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mensajes_chat',
        filter: `sala_id=eq.${activeRoomId}`
      }, (payload) => {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        setTimeout(scrollToBottom, 50);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeRoomId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Enviar mensaje en chat
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeRoomId || !clientUser?.id) return;

    const msgText = newMessage.trim();
    setNewMessage('');

    const { error } = await supabase
      .from('mensajes_chat')
      .insert([{
        sala_id: activeRoomId,
        sender_type: 'cliente',
        sender_id: clientUser.id,
        contenido: msgText
      }]);

    if (error) {
      console.error('[ClientDashboard] Error al enviar mensaje:', error.message);
      setStatusMsg({ type: 'error', text: 'Error al enviar mensaje' });
    }
  };

  // Actualizar Perfil
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!clientUser?.id) return;

    setLoading(true);
    setStatusMsg({ type: '', text: '' });

    try {
      const { error } = await supabase
        .from('perfiles')
        .update({
          full_name: profileName,
          telefono: profilePhone
        })
        .eq('id', clientUser.id);

      if (error) throw error;
      setStatusMsg({ type: 'success', text: 'Perfil actualizado correctamente.' });
    } catch (err) {
      console.error('[ClientDashboard] Error al actualizar perfil:', err.message);
      setStatusMsg({ type: 'error', text: 'No se pudo guardar la información del perfil.' });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (st) => {
    switch (st) {
      case 'confirmada': return '#4ade80';
      case 'pendiente': return '#fbbf24';
      case 'rechazada': return '#ef4444';
      default: return '#aaa';
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '2rem', minHeight: '650px', background: '#0a0a0a', border: '1px solid rgba(186,143,87,0.12)', padding: '1.5rem', boxSizing: 'border-box' }} className="dashboard-grid">
      
      {/* BARRA LATERAL IZQUIERDA: MENÚ DE NAVEGACIÓN */}
      <aside style={{ borderRight: '1px solid rgba(255,255,255,0.05)', paddingRight: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <h2 style={{ fontFamily: "'Oswald', sans-serif", fontSize: '1.1rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.5rem 0' }}>Mi Escritorio</h2>
          <p style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '0.76rem', color: '#ba8f57', fontWeight: 'bold', textTransform: 'uppercase', margin: 0 }}>Cliente Chikiluky</p>
        </div>

        {/* Botones de Pestaña */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {[
            { id: 'reservas', label: 'Mis Reservas', icon: '📅' },
            { id: 'chats', label: 'Mensajes / Chats', icon: '💬' },
            { id: 'perfil', label: 'Mi Perfil', icon: '👤' }
          ].map(tab => (
            <button
              onClick={() => changeTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                width: '100%',
                padding: '0.8rem 1rem',
                background: activeTab === tab.id ? 'rgba(186,143,87,0.08)' : 'transparent',
                border: activeTab === tab.id ? '1px solid rgba(186,143,87,0.2)' : '1px solid transparent',
                borderRadius: '0px',
                color: activeTab === tab.id ? '#ba8f57' : '#a3a3a3',
                fontFamily: "'Urbanist', sans-serif",
                fontWeight: 700,
                fontSize: '0.85rem',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s',
                letterSpacing: '0.01em'
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* PANEL PRINCIPAL: CONTENIDO DE LA PESTAÑA SELECCIONADA */}
      <main style={{ minWidth: 0 }}>
        {statusMsg.text && (
          <div style={{
            background: statusMsg.type === 'success' ? 'rgba(74,222,128,0.06)' : 'rgba(239,68,68,0.06)',
            border: `1px solid ${statusMsg.type === 'success' ? 'rgba(74,222,128,0.2)' : 'rgba(239,68,68,0.2)'}`,
            padding: '0.85rem 1.1rem',
            color: statusMsg.type === 'success' ? '#4ade80' : '#ef4444',
            fontFamily: "'Urbanist', sans-serif",
            fontWeight: 700,
            fontSize: '0.8rem',
            letterSpacing: '0.01em',
            marginBottom: '1.5rem',
            borderRadius: '0px',
            textTransform: 'uppercase'
          }}>
            {statusMsg.text}
          </div>
        )}

        {/* ── SECCIÓN 1: MIS RESERVAS ── */}
        {activeTab === 'reservas' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.85rem' }}>
              <h3 style={{ fontFamily: "'Oswald', sans-serif", fontSize: '1.35rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.02em', margin: 0 }}>Mis Reservas</h3>
              <a href="/app/cliente/buscar" style={{ textDecoration: 'none', background: '#ba8f57', color: '#000', fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '0.75rem', padding: '0.5rem 1rem', borderRadius: '0px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Nueva Reserva</a>
            </div>

            {loading ? (
              <p style={{ color: '#666', fontFamily: "'Lato', sans-serif", fontSize: '0.85rem' }}>Cargando reservas...</p>
            ) : reservas.length === 0 ? (
              <div style={{ border: '1px dashed rgba(255,255,255,0.08)', padding: '3rem 2rem', textAlign: 'center' }}>
                <p style={{ color: '#888', fontFamily: "'Lato', sans-serif", fontSize: '0.88rem', margin: '0 0 1.25rem' }}>Aún no tienes citas agendadas.</p>
                <a href="/app/cliente/buscar" style={{ textDecoration: 'none', border: '1px solid #ba8f57', color: '#ba8f57', padding: '0.6rem 1.5rem', borderRadius: '0px', fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Buscar Salón o Experto</a>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {reservas.map(res => (
                  <div style={{ background: '#121212', border: '1px solid rgba(255,255,255,0.05)', padding: '1.25rem', position: 'relative', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    
                    {/* Header de la reserva */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h4 style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '1rem', color: '#fff', margin: 0 }}>{res.servicio?.nombre || 'Servicio Contratado'}</h4>
                        <p style={{ fontFamily: "'Lato', sans-serif", fontSize: '0.8rem', color: '#888', margin: '0.2rem 0 0' }}>Con <strong>{res.profesional?.full_name || 'Especialista'}</strong></p>
                      </div>
                      <span style={{ fontSize: '0.68rem', fontFamily: "'Urbanist', sans-serif", fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: getStatusColor(res.estado), background: `${getStatusColor(res.estado)}15`, border: `1px solid ${getStatusColor(res.estado)}30`, padding: '0.3rem 0.65rem', borderRadius: '0px' }}>
                        {res.estado}
                      </span>
                    </div>

                    {/* Detalles */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.65rem', fontSize: '0.78rem', fontFamily: "'Lato', sans-serif", color: '#ccc' }}>
                      <div>
                        <span style={{ color: '#555', display: 'block', fontSize: '0.65rem', textTransform: 'uppercase' }}>Fecha y Hora</span>
                        <strong>{res.fecha} · {res.hora_inicio.slice(0, 5)} hs</strong>
                      </div>
                      <div>
                        <span style={{ color: '#555', display: 'block', fontSize: '0.65rem', textTransform: 'uppercase' }}>Precio y Pago</span>
                        <strong>${parseFloat(res.servicio?.precio_usd || 0).toFixed(2)} USD · {res.pago_metodo?.replace('_', ' ').toUpperCase()}</strong>
                      </div>
                    </div>

                    {res.pago_referencia && (
                      <div style={{ borderTop: '1px dashed rgba(255,255,255,0.04)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#777' }}>
                        <span>Referencia: <strong>{res.pago_referencia}</strong></span>
                        <span style={{ color: res.pago_estado === 'verificado' ? '#4ade80' : '#fbbf24' }}>
                          • {res.pago_estado?.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SECCIÓN 2: MENSAJES / CHATS ── */}
        {activeTab === 'chats' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontFamily: "'Oswald', sans-serif", fontSize: '1.35rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.02em', margin: '0 0 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.85rem' }}>Mensajería Privada</h3>

            {activeRoomId ? (
              /* PANEL DE CHAT ACTIVO */
              <div style={{ background: '#111', border: '1px solid rgba(186,143,87,0.18)', display: 'flex', flexDirection: 'column', height: '520px' }}>
                {/* Cabecera del chat activo */}
                <div style={{ background: '#161616', borderBottom: '1px solid rgba(186,143,87,0.15)', padding: '0.85rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.62rem', color: '#ba8f57', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conversación Directa</span>
                    <strong style={{ fontFamily: "'Urbanist', sans-serif", fontSize: '0.98rem', color: '#fff' }}>{activeRoomProfName}</strong>
                  </div>
                  <button
                    onClick={() => { setActiveRoomId(null); setMessages([]); }}
                    style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontFamily: "'Urbanist', sans-serif", fontWeight: 700, fontSize: '0.78rem' }}
                    onMouseOver={(e) => e.target.style.color = '#fff'}
                    onMouseOut={(e) => e.target.style.color = '#888'}
                  >
                    ← Volver al listado
                  </button>
                </div>

                {/* Burbujas de chat */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', scrollbarWidth: 'thin' }}>
                  {messages.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#444', fontSize: '0.78rem', margin: 'auto', fontFamily: "'Lato', sans-serif" }}>No hay mensajes anteriores. Escribe uno abajo para empezar.</p>
                  ) : (
                    messages.map(msg => {
                      const isMe = msg.sender_type === 'cliente';
                      return (
                        <div style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                          <div style={{
                            background: isMe ? 'rgba(186,143,87,0.12)' : '#1f1f1f',
                            border: `1px solid ${isMe ? 'rgba(186,143,87,0.25)' : 'rgba(255,255,255,0.04)'}`,
                            padding: '0.7rem 0.95rem',
                            color: '#fff',
                            fontSize: '0.84rem',
                            fontFamily: "'Lato', sans-serif",
                            lineHeight: 1.4,
                            borderRadius: '0px'
                          }}>
                            {msg.contenido}
                          </div>
                          <span style={{ display: 'block', textAlign: isMe ? 'right' : 'left', fontSize: '0.62rem', color: '#555', marginTop: '0.2rem' }}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Formulario de envío */}
                <form onSubmit={handleSendMessage} style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.05)', background: '#141414', padding: '0.6rem' }}>
                  <input
                    type="text"
                    placeholder="Escribe tu mensaje..."
                    value={newMessage}
                    onInput={(e) => setNewMessage(e.target.value)}
                    style={{ flex: 1, background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.05)', padding: '0.75rem 1rem', color: '#fff', fontSize: '0.85rem', outline: 'none', borderRadius: '0px' }}
                  />
                  <button
                    type="submit"
                    style={{ background: '#ba8f57', border: 'none', padding: '0 1.5rem', color: '#000', fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', borderRadius: '0px' }}
                  >
                    Enviar
                  </button>
                </form>
              </div>
            ) : (
              /* LISTADO DE CHATS */
              loading ? (
                <p style={{ color: '#666', fontFamily: "'Lato', sans-serif", fontSize: '0.85rem' }}>Cargando chats...</p>
              ) : chats.length === 0 ? (
                <div style={{ border: '1px dashed rgba(255,255,255,0.08)', padding: '3rem 2rem', textAlign: 'center' }}>
                  <p style={{ color: '#888', fontFamily: "'Lato', sans-serif", fontSize: '0.88rem', margin: '0' }}>Aún no tienes chats iniciados. Cuando agendes una cita, se abrirá un canal directo con tu profesional.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {chats.map(room => (
                    <button
                      onClick={() => {
                        setActiveRoomId(room.id);
                        setActiveRoomProfName(room.profesional?.full_name || 'Especialista');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#121212',
                        border: '1px solid rgba(255,255,255,0.05)',
                        padding: '1.1rem 1.4rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        transition: 'all 0.2s',
                        borderRadius: '0px'
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.borderColor = 'rgba(186,143,87,0.25)'; e.currentTarget.style.background = 'rgba(186,143,87,0.02)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.background = '#121212'; }}
                    >
                      <div>
                        <h4 style={{ fontFamily: "'Urbanist', sans-serif", fontWeight: 800, fontSize: '0.98rem', color: '#fff', margin: 0 }}>{room.profesional?.full_name || 'Especialista'}</h4>
                        <span style={{ fontSize: '0.68rem', color: '#ba8f57', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Canal de Cita Directo</span>
                      </div>
                      <span style={{ color: '#ba8f57', fontSize: '0.8rem', fontWeight: 'bold' }}>Entrar al Chat →</span>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {/* ── SECCIÓN 3: CONFIGURACIÓN DE PERFIL ── */}
        {activeTab === 'perfil' && (
          <div>
            <h3 style={{ fontFamily: "'Oswald', sans-serif", fontSize: '1.35rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.02em', margin: '0 0 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.85rem' }}>Configuración de Perfil</h3>
            
            <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '500px' }}>
              <div>
                <label style={{ display: 'block', fontFamily: "'Lato', sans-serif", fontSize: '0.72rem', color: '#888', marginBottom: '0.4rem', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.02em' }}>Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={profileName}
                  onInput={(e) => setProfileName(e.target.value)}
                  style={{ width: '100%', background: '#121212', border: '1px solid rgba(186,143,87,0.25)', borderRadius: '0px', padding: '0.75rem 1rem', color: '#fff', fontSize: '0.88rem', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontFamily: "'Lato', sans-serif", fontSize: '0.72rem', color: '#888', marginBottom: '0.4rem', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.02em' }}>Teléfono de Contacto</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: 04121234567"
                  value={profilePhone}
                  onInput={(e) => setProfilePhone(e.target.value)}
                  style={{ width: '100%', background: '#121212', border: '1px solid rgba(186,143,87,0.25)', borderRadius: '0px', padding: '0.75rem 1rem', color: '#fff', fontSize: '0.88rem', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontFamily: "'Lato', sans-serif", fontSize: '0.72rem', color: '#888', marginBottom: '0.4rem', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.02em' }}>Correo Electrónico (No modificable)</label>
                <input
                  type="email"
                  disabled
                  value={profileEmail}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '0px', padding: '0.75rem 1rem', color: '#555', fontSize: '0.88rem', cursor: 'not-allowed', outline: 'none' }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  background: '#ba8f57',
                  color: '#000',
                  border: 'none',
                  padding: '0.9rem',
                  fontFamily: "'Urbanist', sans-serif",
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  borderRadius: '0px',
                  marginTop: '0.5rem',
                  transition: 'all 0.2s'
                }}
              >
                {loading ? 'Guardando...' : 'Guardar Información'}
              </button>
            </form>
          </div>
        )}

      </main>

    </div>
  );
}
