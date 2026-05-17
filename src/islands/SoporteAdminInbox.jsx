import { useState, useEffect, useRef } from 'preact/hooks';
import { supabase } from '../lib/supabase';

export default function SoporteAdminInbox() {
  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const selectedRoomIdRef = useRef(null);

  // Mantener referencia actualizada de la sala seleccionada para usar en el callback del WebSocket
  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  // 1. Cargar sesión de usuario y lista de salas al montar
  useEffect(() => {
    async function initAdminInbox() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user);

        await fetchRooms();
      } catch (err) {
        console.error('Error al inicializar bandeja de soporte:', err);
      } finally {
        setIsLoading(false);
      }
    }

    initAdminInbox();
  }, []);

  // 2. Función para obtener todas las salas de soporte activas
  async function fetchRooms() {
    try {
      const { data: roomsData, error } = await supabase
        .from('salas_chat')
        .select(`
          id,
          created_at,
          sala_type,
          cliente_id,
          profesional_id,
          anonimo_session_id,
          cliente:cliente_id (id, full_name),
          profesional:profesional_id (id, full_name)
        `)
        .in('sala_type', ['soporte', 'soporte_anonimo'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Obtener el último mensaje para cada sala de forma paralela
      const roomsWithPreviews = await Promise.all(
        (roomsData || []).map(async (room) => {
          const { data: lastMsg } = await supabase
            .from('mensajes_chat')
            .select('*')
            .eq('sala_id', room.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            ...room,
            lastMessage: lastMsg || null
          };
        })
      );

      // Ordenar salas por la fecha del último mensaje si existe, si no por fecha de creación
      roomsWithPreviews.sort((a, b) => {
        const dateA = a.lastMessage ? new Date(a.lastMessage.created_at) : new Date(a.created_at);
        const dateB = b.lastMessage ? new Date(b.lastMessage.created_at) : new Date(b.created_at);
        return dateB - dateA;
      });

      setRooms(roomsWithPreviews);
    } catch (err) {
      console.error('Error al cargar salas de soporte:', err);
    }
  }

  // 3. Suscripción global a nuevas salas y mensajes en tiempo real
  useEffect(() => {
    // Canal para nuevas salas de soporte
    const roomsChannel = supabase
      .channel('admin-rooms')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'salas_chat'
        },
        (payload) => {
          const newRoom = payload.new;
          if (['soporte', 'soporte_anonimo'].includes(newRoom.sala_type)) {
            fetchRooms();
          }
        }
      )
      .subscribe();

    // Canal para nuevos mensajes de cualquier sala de soporte
    const messagesChannel = supabase
      .channel('admin-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes_chat'
        },
        (payload) => {
          const newMsg = payload.new;
          
          // Si el mensaje es para la sala que tenemos abierta actualmente
          if (newMsg.sala_id === selectedRoomIdRef.current) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
          
          // Actualizar las previsualizaciones en la barra lateral
          fetchRooms();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(roomsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, []);

  // 4. Cargar mensajes cuando se selecciona una sala
  useEffect(() => {
    if (!selectedRoomId) {
      setMessages([]);
      setSelectedRoom(null);
      return;
    }

    async function loadRoomMessages() {
      try {
        const currentRoom = rooms.find((r) => r.id === selectedRoomId);
        setSelectedRoom(currentRoom);

        const { data: msgs, error } = await supabase
          .from('mensajes_chat')
          .select('*')
          .eq('sala_id', selectedRoomId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        setMessages(msgs || []);
      } catch (err) {
        console.error('Error al cargar mensajes de la sala:', err);
      }
    }

    loadRoomMessages();
  }, [selectedRoomId, rooms]);

  // 5. Scroll automático al recibir mensajes
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // 6. Enviar Respuesta de Soporte
  async function handleSendReply(e) {
    e.preventDefault();
    if (!inputValue.trim() || !selectedRoomId || isSending) return;

    const text = inputValue;
    setInputValue('');
    setIsSending(true);

    try {
      const messageData = {
        sala_id: selectedRoomId,
        contenido: text,
        sender_type: 'soporte',
        sender_id: user ? user.id : null
      };

      // Optimistic Update local
      const tempId = 'temp_' + Date.now();
      const tempMsg = {
        id: tempId,
        created_at: new Date().toISOString(),
        sala_id: selectedRoomId,
        contenido: text,
        sender_type: 'soporte',
        sender_id: user ? user.id : null
      };
      setMessages((prev) => [...prev, tempMsg]);

      const { data: insertedMsg, error } = await supabase
        .from('mensajes_chat')
        .insert([messageData])
        .select()
        .single();

      if (error) throw error;

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? insertedMsg : m))
      );
    } catch (err) {
      console.error('Error al enviar respuesta de soporte:', err);
    } finally {
      setIsSending(false);
    }
  }

  // Resolutores de Nombres de Salas
  function getRoomTitle(room) {
    if (room.sala_type === 'soporte_anonimo') {
      return `Visitante #${room.anonimo_session_id?.substring(5, 9).toUpperCase() || 'Anónimo'}`;
    }
    if (room.cliente?.full_name) {
      return room.cliente.full_name;
    }
    if (room.profesional?.full_name) {
      return `${room.profesional.full_name} (Experto)`;
    }
    return `Usuario #${room.cliente_id?.substring(0, 4) || 'Registrado'}`;
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '320px 1fr',
      height: 'calc(100vh - 120px)',
      background: '#111',
      border: '1px solid rgba(186, 143, 87, 0.15)',
      borderRadius: '16px',
      overflow: 'hidden',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      
      {/* ── BARRA LATERAL (LISTA DE CHATS) ── */}
      <div style={{
        borderRight: '1px solid rgba(186, 143, 87, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        background: '#0d0d0d'
      }}>
        {/* Cabecera Sidebar */}
        <div style={{
          padding: '1.25rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          background: 'rgba(255, 255, 255, 0.01)'
        }}>
          <h3 style={{
            fontFamily: "'Oswald', sans-serif",
            fontSize: '1.15rem',
            fontWeight: '600',
            textTransform: 'uppercase',
            color: '#fff',
            margin: '0 0 0.25rem',
            letterSpacing: '0.04em'
          }}>Conversaciones</h3>
          <p style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)', margin: 0 }}>
            Canales de soporte activos en tiempo real
          </p>
        </div>

        {/* Lista de Salas */}
        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '0.5rem' }}>
          {isLoading ? (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginTop: '2rem' }}>
              Cargando bandejas...
            </p>
          ) : rooms.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'rgba(255,255,255,0.3)' }}>
              <p style={{ fontSize: '1.5rem', margin: '0 0 0.5rem' }}>💬</p>
              <p style={{ fontSize: '12px', margin: 0 }}>No hay chats de soporte abiertos en este momento.</p>
            </div>
          ) : (
            rooms.map((room) => {
              const isSelected = room.id === selectedRoomId;
              const hasNewMessage = room.lastMessage && room.lastMessage.sender_type !== 'soporte';
              
              return (
                <div
                  key={room.id}
                  onClick={() => setSelectedRoomId(room.id)}
                  style={{
                    padding: '1rem',
                    borderRadius: '8px',
                    background: isSelected ? 'rgba(186, 143, 87, 0.08)' : 'transparent',
                    border: isSelected ? '1px solid rgba(186, 143, 87, 0.3)' : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    marginBottom: '0.4rem',
                    position: 'relative'
                  }}
                  onMouseOver={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{
                      fontWeight: isSelected || hasNewMessage ? '700' : '500',
                      color: hasNewMessage ? '#BA8F57' : '#fff',
                      fontSize: '13px'
                    }}>
                      {getRoomTitle(room)}
                    </span>
                    <span style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.3)' }}>
                      {room.lastMessage 
                        ? new Date(room.lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : new Date(room.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      }
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '11px',
                      color: hasNewMessage ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '85%'
                    }}>
                      {room.lastMessage ? room.lastMessage.contenido : 'Sala abierta. Sin mensajes.'}
                    </span>

                    {/* Badge de No Leído (Mensaje de Usuario) */}
                    {hasNewMessage && (
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#BA8F57',
                        boxShadow: '0 0 6px #BA8F57'
                      }} />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── SECCIÓN DERECHA (MENSAJES) ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#070707'
      }}>
        {selectedRoomId ? (
          <>
            {/* Header del Chat Activo */}
            <div style={{
              padding: '1.25rem 2rem',
              borderBottom: '1px solid rgba(186, 143, 87, 0.15)',
              background: 'rgba(255, 255, 255, 0.01)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h4 style={{
                  fontFamily: "'Oswald', sans-serif",
                  fontSize: '1.2rem',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  color: '#fff',
                  margin: '0 0 0.15rem'
                }}>
                  {selectedRoom && getRoomTitle(selectedRoom)}
                </h4>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                  {selectedRoom && (
                    selectedRoom.sala_type === 'soporte_anonimo' 
                      ? `Visitante temporal sin registro · ID de Sesión: ${selectedRoom.anonimo_session_id}`
                      : `Usuario registrado de CHIKILUKY`
                  )}
                </p>
              </div>
            </div>

            {/* Burbujas de Chat */}
            <div style={{
              flexGrow: 1,
              padding: '2rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.2rem',
              background: 'linear-gradient(to bottom, transparent, rgba(186, 143, 87, 0.005))'
            }}>
              {messages.map((msg) => {
                const isSoporte = msg.sender_type === 'soporte';
                return (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: isSoporte ? 'flex-end' : 'flex-start',
                      maxWidth: '70%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isSoporte ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <div style={{
                      padding: '0.9rem 1.2rem',
                      borderRadius: isSoporte ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                      background: isSoporte ? 'rgba(186, 143, 87, 0.08)' : 'rgba(255, 255, 255, 0.05)',
                      color: '#fff',
                      fontSize: '13.5px',
                      lineHeight: '1.5',
                      border: isSoporte ? '1px solid rgba(186, 143, 87, 0.35)' : '1px solid rgba(255, 255, 255, 0.06)',
                      boxShadow: isSoporte ? '0 4px 15px rgba(186, 143, 87, 0.05)' : 'none',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}>
                      {msg.contenido}
                    </div>
                    <span style={{
                      fontSize: '9px',
                      color: 'rgba(255, 255, 255, 0.3)',
                      marginTop: '0.35rem',
                      padding: '0 0.25rem'
                    }}>
                      {isSoporte ? 'Tú' : 'Usuario'} · {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <form
              onSubmit={handleSendReply}
              style={{
                padding: '1.25rem 2rem',
                borderTop: '1px solid rgba(186, 143, 87, 0.15)',
                background: 'rgba(255, 255, 255, 0.01)',
                display: 'flex',
                gap: '1rem',
                alignItems: 'center'
              }}
            >
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Escribe una respuesta para el usuario..."
                disabled={isSending}
                style={{
                  flexGrow: 1,
                  background: '#050505',
                  border: '1px solid rgba(186, 143, 87, 0.2)',
                  borderRadius: '10px',
                  padding: '1rem 1.25rem',
                  color: '#fff',
                  fontSize: '13.5px',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#BA8F57'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(186, 143, 87, 0.2)'}
              />
              <button
                type="submit"
                disabled={isSending || !inputValue.trim()}
                aria-label="Enviar respuesta"
                style={{
                  padding: '1rem 2rem',
                  borderRadius: '10px',
                  background: '#BA8F57',
                  color: '#000',
                  fontFamily: "'Hanken Grotesk', sans-serif",
                  fontSize: '12px',
                  fontWeight: '700',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  opacity: (isSending || !inputValue.trim()) ? 0.5 : 1
                }}
                onMouseOver={(e) => {
                  if (!isSending && inputValue.trim()) {
                    e.currentTarget.style.background = '#fff';
                  }
                }}
                onMouseOut={(e) => {
                  if (!isSending && inputValue.trim()) {
                    e.currentTarget.style.background = '#BA8F57';
                  }
                }}
              >
                Responder
              </button>
            </form>
          </>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flexGrow: 1,
            color: 'rgba(255, 255, 255, 0.25)',
            textAlign: 'center',
            padding: '2rem'
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.2" viewBox="0 0 24 24" style={{ marginBottom: '1.25rem', color: '#BA8F57', opacity: 0.6 }}>
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <h4 style={{
              fontFamily: "'Oswald', sans-serif",
              fontSize: '1.25rem',
              fontWeight: '600',
              textTransform: 'uppercase',
              color: '#fff',
              margin: '0 0 0.5rem',
              letterSpacing: '0.04em'
            }}>Bandeja de Entrada</h4>
            <p style={{ fontSize: '13px', margin: 0, maxWidth: '320px', lineHeight: 1.5 }}>
              Selecciona una conversación del listado de la izquierda para comenzar a chatear en tiempo real.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
