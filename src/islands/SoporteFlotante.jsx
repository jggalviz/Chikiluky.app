import { useState, useEffect, useRef } from 'preact/hooks';
import { createClient } from '@supabase/supabase-js';

export default function SoporteFlotante({ token }) {
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
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [user, setUser] = useState(null);
  const [anonId, setAnonId] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const messagesEndRef = useRef(null);

  // 1. Inicializar la sesión y recuperar mensajes
  useEffect(() => {
    async function initSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        let currentUserId = null;
        let currentAnonId = null;

        if (session?.user) {
          setUser(session.user);
          currentUserId = session.user.id;
        } else {
          let localAnonId = localStorage.getItem('chikiluky_chat_session');
          if (!localAnonId) {
            localAnonId = 'anon_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            localStorage.setItem('chikiluky_chat_session', localAnonId);
            // Establecer cookie para persistencia cruzada
            document.cookie = `chikiluky_session=${localAnonId}; path=/; max-age=${60 * 60 * 24 * 365}`;
          }
          setAnonId(localAnonId);
          currentAnonId = localAnonId;
        }

        // Buscar sala de soporte existente
        let roomQuery = supabase.from('salas_chat');
        if (currentUserId) {
          roomQuery = roomQuery
            .select('*')
            .eq('sala_type', 'soporte')
            .or(`cliente_id.eq.${currentUserId},profesional_id.eq.${currentUserId}`)
            .maybeSingle();
        } else if (currentAnonId) {
          roomQuery = roomQuery
            .select('*')
            .eq('sala_type', 'soporte_anonimo')
            .eq('anonimo_session_id', currentAnonId)
            .maybeSingle();
        }

        const { data: existingRoom, error } = await roomQuery;

        if (existingRoom) {
          setRoomId(existingRoom.id);
          // Cargar mensajes existentes
          const { data: existingMessages } = await supabase
            .from('mensajes_chat')
            .select('*')
            .eq('sala_id', existingRoom.id)
            .order('created_at', { ascending: true });

          if (existingMessages) {
            setMessages(existingMessages);
          }
        }
      } catch (err) {
        console.error('Error al inicializar el chat de soporte:', err);
      }
    }

    initSession();
  }, []);

  // 2. Suscripción a cambios en tiempo real
  useEffect(() => {
    if (!roomId) return;

    // Suscribirse por WebSockets al canal de la sala de chat
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes_chat',
          filter: `sala_id=eq.${roomId}`
        },
        (payload) => {
          const newMsg = payload.new;
          
          // Prevenir duplicidad local si nosotros enviamos el mensaje
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });

          // Incrementar contador de no leídos si el chat está cerrado
          // y el mensaje viene de soporte técnico
          if (!isOpen && newMsg.sender_type === 'soporte') {
            setUnreadCount((c) => c + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, isOpen]);

  // 3. Scroll automático al recibir mensajes
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // 4. Lógica de Envío de Mensaje
  async function handleSendMessage(e) {
    e.preventDefault();
    if (!inputValue.trim() || isConnecting) return;

    const messageText = inputValue;
    setInputValue('');
    setIsConnecting(true);

    try {
      let activeRoomId = roomId;

      // Si no existe la sala de chat, la creamos en caliente en el primer mensaje
      if (!activeRoomId) {
        const roomData = {
          sala_type: user ? 'soporte' : 'soporte_anonimo',
        };

        if (user) {
          // Determinar si es cliente o experto
          const role = user.user_metadata?.role || 'cliente';
          if (role === 'experto') {
            roomData.profesional_id = user.id;
          } else {
            roomData.cliente_id = user.id;
          }
        } else {
          roomData.anonimo_session_id = anonId;
        }

        const { data: newRoom, error: roomError } = await supabase
          .from('salas_chat')
          .insert([roomData])
          .select()
          .single();

        if (roomError) throw roomError;

        activeRoomId = newRoom.id;
        setRoomId(activeRoomId);
      }

      // Crear registro de mensaje
      const messageData = {
        sala_id: activeRoomId,
        contenido: messageText,
        sender_type: user ? (user.user_metadata?.role === 'experto' ? 'profesional' : 'cliente') : 'anonimo',
      };

      if (user) {
        messageData.sender_id = user.id;
      }

      // Optimistic Update: Añadir localmente con ID provisional
      const tempId = 'temp_' + Date.now();
      const tempMsg = {
        id: tempId,
        created_at: new Date().toISOString(),
        sala_id: activeRoomId,
        contenido: messageText,
        sender_type: messageData.sender_type,
        sender_id: user ? user.id : null,
      };
      setMessages((prev) => [...prev, tempMsg]);

      const { data: insertedMsg, error: msgError } = await supabase
        .from('mensajes_chat')
        .insert([messageData])
        .select()
        .single();

      if (msgError) throw msgError;

      // Reemplazar mensaje temporal con el registro oficial de base de datos
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? insertedMsg : m))
      );
    } catch (err) {
      console.error('Error al enviar el mensaje de soporte:', err);
    } finally {
      setIsConnecting(false);
    }
  }

  function handleOpenChat() {
    setIsOpen(true);
    setUnreadCount(0);
  }

  return (
    <div style={{ position: 'fixed', right: '24px', bottom: '24px', zIndex: 100, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      
      {/* ── BOTÓN FLOTANTE MINIMIZADO ── */}
      {!isOpen && (
        <button
          onClick={handleOpenChat}
          aria-label="Abrir chat de soporte"
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: '#111',
            border: '2px solid #BA8F57',
            color: '#BA8F57',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 8px 30px rgba(186,143,87,0.3)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
            animation: 'soportePulse 3s infinite alternate'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'scale(1.08) rotate(5deg)';
            e.currentTarget.style.background = '#BA8F57';
            e.currentTarget.style.color = '#000';
            e.currentTarget.style.borderColor = '#fff';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
            e.currentTarget.style.background = '#111';
            e.currentTarget.style.color = '#BA8F57';
            e.currentTarget.style.borderColor = '#BA8F57';
          }}
        >
          {/* Icono de Mensaje / Soporte */}
          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>

          {/* Globo de mensajes no leídos */}
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              background: '#ef4444',
              color: '#fff',
              fontSize: '10px',
              fontWeight: '800',
              padding: '0.2rem 0.5rem',
              borderRadius: '9999px',
              boxShadow: '0 2px 8px rgba(239,68,68,0.5)',
              display: 'inline-block'
            }}>
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {/* ── PANEL DE CHAT EXPANDIDO (GLASSMORPHIC) ── */}
      {isOpen && (
        <div 
          style={{
            width: '380px',
            height: '520px',
            background: 'rgba(17, 17, 17, 0.96)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(186, 143, 87, 0.3)',
            borderRadius: '16px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'soporteSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          className="soporte-panel"
        >
          
          {/* Cabecera del Chat */}
          <div style={{
            padding: '1.25rem',
            background: 'rgba(255, 255, 255, 0.02)',
            borderBottom: '1px solid rgba(186, 143, 87, 0.2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 8px #10b981'
              }} />
              <div>
                <h4 style={{
                  fontFamily: "'Oswald', sans-serif",
                  fontWeight: '600',
                  fontSize: '1.1rem',
                  textTransform: 'uppercase',
                  color: '#fff',
                  margin: '0 0 0.15rem',
                  letterSpacing: '0.04em'
                }}>Soporte Chikiluky</h4>
                <p style={{
                  fontSize: '10px',
                  color: 'rgba(255,255,255,0.45)',
                  margin: 0
                }}>Soporte técnico directo en tiempo real</p>
              </div>
            </div>

            {/* Minimizar */}
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Minimizar chat"
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
                padding: '0.25rem',
                transition: 'color 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.color = '#BA8F57'}
              onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Área de Mensajes */}
          <div style={{
            flexGrow: 1,
            padding: '1.25rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            background: 'linear-gradient(to bottom, transparent, rgba(186,143,87,0.015))'
          }}>
            {messages.length === 0 ? (
              <div style={{
                textAlign: 'center',
                margin: 'auto 0',
                padding: '1rem'
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" fill="none" stroke="#BA8F57" stroke-width="1.5" viewBox="0 0 24 24" style={{ marginBottom: '1rem', opacity: 0.6 }}>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <h5 style={{
                  fontFamily: "'Oswald', sans-serif",
                  fontWeight: '600',
                  color: '#fff',
                  textTransform: 'uppercase',
                  fontSize: '0.95rem',
                  margin: '0 0 0.5rem'
                }}>¿Cómo podemos ayudarte?</h5>
                <p style={{
                  fontSize: '12px',
                  color: 'rgba(255,255,255,0.45)',
                  lineHeight: 1.5,
                  margin: 0
                }}>Envíanos un mensaje y uno de nuestros desarrolladores o agentes de soporte te atenderá en tiempo real.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.sender_type !== 'soporte';
                return (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: isMe ? 'flex-end' : 'flex-start',
                      maxWidth: '80%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isMe ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <div style={{
                      padding: '0.8rem 1rem',
                      borderRadius: isMe ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                      background: isMe ? '#BA8F57' : 'rgba(255,255,255,0.06)',
                      color: isMe ? '#000' : '#fff',
                      fontSize: '13px',
                      lineHeight: '1.5',
                      border: isMe ? 'none' : '1px solid rgba(255,255,255,0.06)',
                      boxShadow: isMe ? '0 4px 12px rgba(186,143,87,0.15)' : 'none',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}>
                      {msg.contenido}
                    </div>
                    <span style={{
                      fontSize: '9px',
                      color: 'rgba(255,255,255,0.3)',
                      marginTop: '0.25rem',
                      padding: '0 0.25rem'
                    }}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Formulario de Entrada */}
          <form
            onSubmit={handleSendMessage}
            style={{
              padding: '1rem 1.25rem 1.25rem',
              borderTop: '1px solid rgba(186, 143, 87, 0.2)',
              background: 'rgba(255,255,255,0.01)',
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'center'
            }}
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Escribe tu mensaje..."
              disabled={isConnecting}
              style={{
                flexGrow: 1,
                background: '#0a0a0a',
                border: '1px solid rgba(186, 143, 87, 0.25)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = '#BA8F57'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(186, 143, 87, 0.25)'}
            />
            <button
              type="submit"
              disabled={isConnecting || !inputValue.trim()}
              aria-label="Enviar mensaje"
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '8px',
                background: '#BA8F57',
                color: '#000',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                opacity: (isConnecting || !inputValue.trim()) ? 0.5 : 1
              }}
              onMouseOver={(e) => {
                if (!isConnecting && inputValue.trim()) {
                  e.currentTarget.style.background = '#fff';
                }
              }}
              onMouseOut={(e) => {
                if (!isConnecting && inputValue.trim()) {
                  e.currentTarget.style.background = '#BA8F57';
                }
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </form>

        </div>
      )}

      {/* ── ESTILOS Y ANIMACIONES LOCALES ── */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes soportePulse {
          0% { box-shadow: 0 0 10px rgba(186,143,87,0.25); }
          100% { box-shadow: 0 0 25px rgba(186,143,87,0.55); }
        }
        @keyframes soporteSlideIn {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @media (max-width: 480px) {
          .soporte-panel {
            width: calc(100vw - 32px) !important;
            height: 480px !important;
          }
        }
      `}} />

    </div>
  );
}
