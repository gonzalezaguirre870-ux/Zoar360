from flask import Flask, request, jsonify, session
from flask_cors import CORS
import sqlite3
import datetime
import os
import time

app = Flask(__name__)
CORS(app, supports_credentials=True)
app.secret_key = 'clave_super_secreta_para_sesiones'
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_SECURE'] = True

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'database', 'iglesia.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ==================== INICIALIZACIÓN DE BASE DE DATOS ====================
def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            email TEXT UNIQUE,
            password_hash TEXT,
            rol TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS miembros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT UNIQUE,
            nombre TEXT,
            telefono TEXT,
            tipo TEXT,
            grupo TEXT,
            total_asistencias INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS solicitudes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            telefono TEXT,
            tipo TEXT,
            grupo TEXT,
            solicitante_email TEXT,
            estado TEXT DEFAULT 'Pendiente',
            fecha_solicitud TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS asistencias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            miembro_id INTEGER,
            fecha TEXT,
            hora TEXT,
            FOREIGN KEY(miembro_id) REFERENCES miembros(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS santacena (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            miembro_id INTEGER,
            fecha TEXT,
            asistio INTEGER,
            FOREIGN KEY(miembro_id) REFERENCES miembros(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notificaciones_sistema (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_correo TEXT,
            accion TEXT,
            detalles TEXT,
            fecha_hora TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

# Ejecutar al iniciar
init_db()

# ==================== LOGIN CON BLOQUEO POR INTENTOS ====================
# Diccionario para almacenar intentos fallidos (email -> [cantidad, timestamp_bloqueo])
intentos_fallidos = {}

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    ahora = time.time()

    # Verificar bloqueo activo
    if email in intentos_fallidos:
        intentos, tiempo_bloqueo = intentos_fallidos[email]
        if intentos >= 3:
            if ahora < tiempo_bloqueo:
                tiempo_restante = int(tiempo_bloqueo - ahora)
                return jsonify({"error": f"Demasiados intentos. Espere {tiempo_restante} segundos."}), 429
            else:
                # Reiniciar contador si pasó el tiempo
                del intentos_fallidos[email]

    conn = get_db()
    user = conn.execute("SELECT * FROM usuarios WHERE email = ? AND password_hash = ?", (email, password)).fetchone()
    conn.close()

    if user:
        # Limpiar intentos fallidos si el login es exitoso
        if email in intentos_fallidos:
            del intentos_fallidos[email]
        session.update({'user_id': user['id'], 'user_rol': user['rol']})
        return jsonify({"message": "Login exitoso", "rol": user['rol'], "email": user['email']}), 200
    else:
        # Registrar intento fallido
        if email in intentos_fallidos:
            intentos_fallidos[email][0] += 1
        else:
            intentos_fallidos[email] = [1, 0]
        
        # Si llega a 3, establecer bloqueo de 60 segundos
        if intentos_fallidos[email][0] >= 3:
            intentos_fallidos[email][1] = ahora + 60
            return jsonify({"error": "Demasiados intentos. Bloqueado por 60 segundos."}), 429
        
        return jsonify({"error": "Credenciales incorrectas"}), 401

# ==================== MIEMBROS ====================
@app.route('/api/miembros', methods=['GET'])
def obtener_miembros():
    conn = get_db()
    miembros = conn.execute("SELECT * FROM miembros ORDER BY codigo ASC").fetchall()
    conn.close()
    return jsonify([dict(m) for m in miembros])

@app.route('/api/miembros/<codigo>', methods=['GET'])
def obtener_miembro_por_codigo(codigo):
    conn = get_db()
    miembro = conn.execute("SELECT * FROM miembros WHERE codigo = ?", (codigo,)).fetchone()
    conn.close()
    if miembro:
        return jsonify(dict(miembro))
    return jsonify({"error": "Miembro no encontrado"}), 404

@app.route('/api/miembros', methods=['POST'])
def crear_miembro():
    if session.get('user_rol') not in ['Administrador', 'Pastor']:
        return jsonify({"error": "Acción denegada."}), 403
    data = request.json
    conn = get_db()
    ultimo = conn.execute("SELECT MAX(codigo) as max FROM miembros").fetchone()
    nuevo_codigo = f"{(int(ultimo['max']) + 1) if ultimo and ultimo['max'] else 1:04d}"
    
    liderazgo = data.get('liderazgo') if data['tipo'] == 'Propiedad' else None
    nombre_final = data['nombre'] + (f" ({liderazgo})" if liderazgo else "")
    
    conn.execute("INSERT INTO miembros (codigo, nombre, telefono, tipo, grupo) VALUES (?, ?, ?, ?, ?)", 
                 (nuevo_codigo, nombre_final, data.get('telefono'), data['tipo'], data.get('grupo', 'General')))
    conn.commit()
    
    # Auditoría
    conn.execute("INSERT INTO notificaciones_sistema (usuario_correo, accion, detalles) VALUES (?, ?, ?)", 
                 (session.get('user_rol'), f"Miembro creado: {data['nombre']}", f"Código: {nuevo_codigo}"))
    conn.commit()
    conn.close()
    return jsonify({"message": "Miembro creado", "codigo": nuevo_codigo}), 201

@app.route('/api/miembros/<codigo>', methods=['DELETE'])
def eliminar_miembro(codigo):
    if session.get('user_rol') not in ['Administrador', 'Pastor']:
        return jsonify({"error": "Acceso denegado."}), 403
    conn = get_db()
    miembro = conn.execute("SELECT * FROM miembros WHERE codigo = ?", (codigo,)).fetchone()
    if not miembro:
        return jsonify({"error": "El código ingresado no pertenece a ningún miembro"}), 404
    
    conn.execute("DELETE FROM miembros WHERE codigo = ?", (codigo,))
    conn.commit()
    
    # Reindexación
    todos = conn.execute("SELECT id, codigo FROM miembros ORDER BY id ASC").fetchall()
    for index, row in enumerate(todos):
        nuevo_cod = f"{index + 1:04d}"
        if row['codigo'] != nuevo_cod:
            conn.execute("UPDATE miembros SET codigo = ? WHERE id = ?", (nuevo_cod, row['id']))
    conn.commit()
    conn.close()
    return jsonify({"message": "Miembro eliminado y códigos reordenados"}), 200

@app.route('/api/miembros/<codigo>', methods=['PUT'])
def actualizar_miembro(codigo):
    if session.get('user_rol') not in ['Administrador', 'Pastor']:
        return jsonify({"error": "Acceso denegado."}), 403
    data = request.json
    conn = get_db()
    
    liderazgo = data.get('liderazgo') if data['tipo'] == 'Propiedad' else None
    nombre_final = data['nombre'] + (f" ({liderazgo})" if liderazgo else "")
    
    conn.execute("UPDATE miembros SET nombre = ?, telefono = ?, tipo = ?, grupo = ? WHERE codigo = ?", 
                 (nombre_final, data.get('telefono'), data['tipo'], data.get('grupo', 'General'), codigo))
    conn.commit()
    conn.close()
    return jsonify({"message": "Información actualizada"}), 200

# ==================== SOLICITUDES (GRUPOS) ====================
@app.route('/api/solicitudes', methods=['POST'])
def crear_solicitud():
    data = request.json
    conn = get_db()
    liderazgo = data.get('liderazgo') if data['tipo'] == 'Propiedad' else None
    nombre_final = data['nombre'] + (f" ({liderazgo})" if liderazgo else "")
    
from flask import Flask, request, jsonify, session
from flask_cors import CORS
import sqlite3
import datetime
import os
import time

app = Flask(__name__)

# Configuración estricta de CORS y Cookies para prevenir cierres de sesión cruzados
CORS(app, supports_credentials=True, origins=["http://127.0.0.1:5500", "http://localhost:5500", "https://github.io"])
app.secret_key = 'clave_super_secreta_para_sesiones'
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'database', 'iglesia.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ==================== INICIALIZACIÓN DE BASE DE DATOS ====================
def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            email TEXT UNIQUE,
            password_hash TEXT,
            rol TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS miembros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT UNIQUE,
            nombre TEXT,
            telefono TEXT,
            tipo TEXT,
            grupo TEXT,
            total_asistencias INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS solicitudes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            telefono TEXT,
            tipo TEXT,
            grupo TEXT,
            solicitante_email TEXT,
            estado TEXT DEFAULT 'Pendiente',
            fecha_solicitud TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS asistencias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            miembro_id INTEGER,
            fecha TEXT,
            hora TEXT,
            grupo_asistido TEXT,
            FOREIGN KEY(miembro_id) REFERENCES miembros(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS santacena (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            miembro_id INTEGER,
            fecha TEXT,
            asistio INTEGER,
            FOREIGN KEY(miembro_id) REFERENCES miembros(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notificaciones_sistema (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_correo TEXT,
            accion TEXT,
            detalles TEXT,
            fecha_hora TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

init_db()

# Diccionario global para control de bloqueos por fuerza bruta
intentos_fallidos = {}

# Mapeo oficial de ministerios sin abreviaciones para control de asistencia
MAPEO_MINISTERIOS = {
    "cmf@iglesiazoarsv.org": "Concilio Misionero Femenil",
    "misioneritas@iglesiazoarsv.org": "Misioneritas",
    "fraternidad@iglesiazoarsv.org": "Fraternidad de Varones",
    "exploradores@iglesiazoarsv.org": "Exploradores del Rey",
    "embajadores@iglesiazoarsv.org": "Embajadores de Cristo",
    "secretariageneral@iglesiazoarsv.org": "Culto General"
}

# ==================== LOGIN CON CONTROL DE INTENTOS ====================
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    email = data.get('email', '').strip()
    password = data.get('password', '').strip()
    ahora = time.time()

    if not email or not password:
        return jsonify({"error": "Campos vacíos"}), 400

    if email in intentos_fallidos:
        intentos, tiempo_bloqueo = intentos_fallidos[email]
        if intentos >= 3:
            if ahora < tiempo_bloqueo:
                return jsonify({"error": f"Bloqueado. Espere {int(tiempo_bloqueo - ahora)} segundos."}), 429
            else:
                del intentos_fallidos[email]

    conn = get_db()
    user = conn.execute("SELECT * FROM usuarios WHERE email = ? AND password_hash = ?", (email, password)).fetchone()
    conn.close()

    if user:
        if email in intentos_fallidos:
            del intentos_fallidos[email]
        session.clear()
        session['user_id'] = user['id']
        session['user_rol'] = user['rol']
        session['user_email'] = user['email']
        return jsonify({"message": "Login exitoso", "rol": user['rol'], "email": user['email']}), 200
    else:
        if email in intentos_fallidos:
            intentos_fallidos[email][0] += 1
        else:
            intentos_fallidos[email] = [1, 0]
        
        if intentos_fallidos[email][0] >= 3:
            intentos_fallidos[email][1] = ahora + 60
            return jsonify({"error": "Demasiados intentos. Bloqueado por 60 segundos."}), 429
        
        return jsonify({"error": "Credenciales incorrectas"}), 401

# ==================== CONTROLLER DE MIEMBROS ====================
@app.route('/api/miembros', methods=['GET'])
def obtener_miembros():
    conn = get_db()
    miembros = conn.execute("SELECT * FROM miembros ORDER BY codigo ASC").fetchall()
    conn.close()
    return jsonify([dict(m) for m in miembros])

@app.route('/api/miembros/<codigo>', methods=['GET'])
def obtener_miembro_por_codigo(codigo):
    conn = get_db()
    miembro = conn.execute("SELECT * FROM miembros WHERE codigo = ?", (codigo,)).fetchone()
    conn.close()
    if miembro:
        return jsonify(dict(miembro))
    return jsonify({"error": "El código ingresado no pertenece a ningún miembro"}), 404

@app.route('/api/miembros', methods=['POST'])
def crear_miembro():
    if session.get('user_rol') not in ['Administrador', 'Pastor']:
        return jsonify({"error": "Acción denegada."}), 403
    data = request.json or {}
    nombre = data.get('nombre', '').strip()
    if not nombre:
        return jsonify({"error": "El nombre es obligatorio y no puede ir vacío."}), 400

    conn = get_db()
    ultimo = conn.execute("SELECT MAX(CAST(codigo AS INTEGER)) as max FROM miembros").fetchone()
    nuevo_codigo = f"{(ultimo['max'] + 1) if ultimo and ultimo['max'] is not None else 1:04d}"
    
    liderazgo = data.get('liderazgo', '').strip() if data.get('tipo') == 'Propiedad' else None
    nombre_final = nombre + (f" ({liderazgo})" if liderazgo else "")
    
    conn.execute("INSERT INTO miembros (codigo, nombre, telefono, tipo, grupo) VALUES (?, ?, ?, ?, ?)", 
                 (nuevo_codigo, nombre_final, data.get('telefono'), data.get('tipo'), data.get('grupo', 'Culto General')))
    
    conn.execute("INSERT INTO notificaciones_sistema (usuario_correo, accion, detalles) VALUES (?, ?, ?)", 
                 (session.get('user_email', 'Admin'), f"Miembro creado: {nombre}", f"Código asignado: {nuevo_codigo}"))
    conn.commit()
    conn.close()
    return jsonify({"message": "Miembro creado exitosamente", "codigo": nuevo_codigo}), 201

@app.route('/api/miembros/<codigo>', methods=['DELETE'])
def eliminar_miembro(codigo):
    if session.get('user_rol') not in ['Administrador', 'Pastor']:
        return jsonify({"error": "Acceso denegado."}), 403
    conn = get_db()
    miembro = conn.execute("SELECT * FROM miembros WHERE codigo = ?", (codigo,)).fetchone()
    if not miembro:
        return jsonify({"error": "El código ingresado no pertenece a ningún miembro"}), 404
    
    conn.execute("DELETE FROM miembros WHERE codigo = ?", (codigo,))
    conn.commit()
    
    todos = conn.execute("SELECT id FROM miembros ORDER BY id ASC").fetchall()
    for index, row in enumerate(todos):
        nuevo_cod = f"{index + 1:04d}"
        conn.execute("UPDATE miembros SET codigo = ? WHERE id = ?", (nuevo_cod, row['id']))
        
    conn.execute("INSERT INTO notificaciones_sistema (usuario_correo, accion, detalles) VALUES (?, ?, ?)", 
                 (session.get('user_email', 'Admin'), f"Miembro eliminado", f"Código que fue borrado: {codigo}"))
    conn.commit()
    conn.close()
    return jsonify({"message": "Miembro eliminado y códigos reordenados"}), 200

@app.route('/api/miembros/<codigo>', methods=['PUT'])
def actualizar_miembro(codigo):
    if session.get('user_rol') not in ['Administrador', 'Pastor']:
        return jsonify({"error": "Acceso denegado."}), 403
    data = request.json or {}
    nombre = data.get('nombre', '').strip()
    if not nombre:
        return jsonify({"error": "El nombre no puede ir vacío."}), 400

    conn = get_db()
    miembro_actual = conn.execute("SELECT * FROM miembros WHERE codigo = ?", (codigo,)).fetchone()
    if not miembro_actual:
        return jsonify({"error": "Miembro no encontrado"}), 404

    liderazgo = data.get('liderazgo', '').strip() if data.get('tipo') == 'Propiedad' else None
    nombre_final = nombre + (f" ({liderazgo})" if liderazgo else "")
    
    conn.execute("UPDATE miembros SET nombre = ?, telefono = ?, tipo = ?, grupo = ? WHERE codigo = ?", 
                 (nombre_final, data.get('telefono'), data.get('tipo'), data.get('grupo', 'Culto General'), codigo))
    
    conn.execute("INSERT INTO notificaciones_sistema (usuario_correo, accion, detalles) VALUES (?, ?, ?)", 
                 (session.get('user_email', 'Admin'), f"Miembro actualizado", f"Código: {codigo}"))
    conn.commit()
    conn.close()
    return jsonify({"message": "Información actualizada con éxito"}), 200

# ==================== SECCIÓN DE SOLICITUDES ====================
@app.route('/api/solicitudes', methods=['POST'])
def crear_solicitud():
    data = request.json or {}
    nombre = data.get('nombre', '').strip()
    if not nombre:
        return jsonify({"error": "El nombre es obligatorio."}), 400

    conn = get_db()
    liderazgo = data.get('liderazgo', '').strip() if data.get('tipo') == 'Propiedad' else None
    nombre_final = nombre + (f" ({liderazgo})" if liderazgo else "")
    email_solicitante = session.get('user_email', 'Secretaría')

    conn.execute("INSERT INTO solicitudes (nombre, telefono, tipo, grupo, solicitante_email, fecha_solicitud) VALUES (?, ?, ?, ?, ?, ?)", 
                 (nombre_final, data.get('telefono'), data.get('tipo'), data.get('grupo'), email_solicitante, datetime.datetime.now().strftime('%Y-%m-%d %H:%M')))
    conn.execute("INSERT INTO notificaciones_sistema (usuario_correo, accion, detalles) VALUES (?, ?, ?)", 
                 (email_solicitante, f"Nueva solicitud de ingreso", f"Nombre: {nombre}, Grupo: {data.get('grupo')}"))
    conn.commit()
    conn.close()
    return jsonify({"message": "Solicitud enviada exitosamente al Pastor"}), 201

@app.route('/api/solicitudes', methods=['GET'])
def obtener_solicitudes():
    if session.get('user_rol') not in ['Administrador', 'Pastor']:
        return jsonify([])
    conn = get_db()
    solicitudes = conn.execute("SELECT * FROM solicitudes WHERE estado = 'Pendiente' ORDER BY id DESC").fetchall()
    conn.close()
    return jsonify([dict(s) for s in solicitudes])

@app.route('/api/solicitudes/<int:id>', methods=['PUT'])
def procesar_solicitud(id):
    if session.get('user_rol') not in ['Administrador', 'Pastor']:
        return jsonify({"error": "Acceso denegado"}), 403
    data = request.json or {}
    estado = data.get('estado')
    
    conn = get_db()
    sol = conn.execute("SELECT * FROM solicitudes WHERE id = ?", (id,)).fetchone()
    if not sol:
        conn.close()
        return jsonify({"error": "Solicitud no encontrada"}), 404

    if estado == 'Aprobada':
        ultimo = conn.execute("SELECT MAX(CAST(codigo AS INTEGER)) as max FROM miembros").fetchone()
        nuevo_codigo = f"{(ultimo['max'] + 1) if ultimo and ultimo['max'] is not None else 1:04d}"
        conn.execute("INSERT INTO miembros (codigo, nombre, telefono, tipo, grupo) VALUES (?, ?, ?, ?, ?)", 
                     (nuevo_codigo, sol['nombre'], sol['telefono'], sol['tipo'], sol['grupo']))
        
    conn.execute("UPDATE solicitudes SET estado = ? WHERE id = ?", (estado, id))
    conn.execute("INSERT INTO notificaciones_sistema (usuario_correo, accion, detalles) VALUES (?, ?, ?)", 
                 (session.get('user_email', 'Admin'), f"Solicitud {estado}", f"Para: {sol['nombre']}"))
    conn.commit()
    conn.close()
    return jsonify({"message": f"Solicitud {estado.lower()} con éxito"}), 200

# ==================== CONTROL DE ASISTENCIA REESCRITO ====================
@app.route('/api/asistencia/grupo/<grupo>', methods=['GET'])
def obtener_asistencia_grupo(grupo):
    # Limpieza de nombres de ministerios quitando guiones bajos si los hay
    grupo_limpio = grupo.replace('_', ' ').strip()
    conn = get_db()
    miembros = conn.execute("SELECT * FROM miembros WHERE grupo = ? ORDER BY nombre ASC", (grupo_limpio,)).fetchall()
    resultado = []
    for m in miembros:
        resultado.append(dict(m))
    conn.close()
    return jsonify(resultado)

@app.route('/api/marcar-asistencia', methods=['POST'])
def marcar_asistencia():
    if 'user_id' not in session: 
        return jsonify({"error": "No autorizado. Inicie sesión nuevamente."}), 401
    
    data = request.json or {}
    codigos = data.get('codigos', [])
    email_activo = session.get('user_email', '')
    
    # CONTROL DE HORARIOS ESTRICTO BASADO EN EL SERVIDOR
    ahora = datetime.datetime.now()
    dia_semana = ahora.weekday() # 0=Lunes, 1=Martes, 2=Miércoles, 3=Jueves, 4=Viernes, 5=Sábado, 6=Domingo
    hora_minutos = ahora.hour * 60 + ahora.minute

    # Reglas horarias en minutos
    inicio_semana, fin_semana = (17 * 60 + 45), (19 * 60 + 0) # 5:45 PM a 7:00 PM
    inicio_domingo, fin_domingo = (14 * 60 + 45), (16 * 60 + 0) # 2:45 PM a 4:00 PM

    if dia_semana == 0:
        return jsonify({"error": "Error: Los días lunes no se encuentra programado ningún culto."}), 403

    grupo_esperado = MAPEO_MINISTERIOS.get(email_activo, "")
    
    # Validaciones cruzadas de día y hora correspondientes al grupo del correo logueado
    if email_activo == "cmf@iglesiazoarsv.org" and (dia_semana != 1 or hora_minutos < inicio_semana or hora_minutos > fin_semana):
        return jsonify({"error": "Error: El registro de asistencia para este grupo solo está habilitado los martes de 5:45 PM a 7:00 PM."}), 403
    elif email_activo == "misioneritas@iglesiazoarsv.org" and (dia_semana != 2 or hora_minutos < inicio_semana or hora_minutos > fin_semana):
        return jsonify({"error": "Error: El registro de asistencia para este grupo solo está habilitado los miércoles de 5:45 PM a 7:00 PM."}), 403
    elif email_activo == "fraternidad@iglesiazoarsv.org" and (dia_semana != 3 or hora_minutos < inicio_semana or hora_minutos > fin_semana):
        return jsonify({"error": "Error: El registro de asistencia para este grupo solo está habilitado los jueves de 5:45 PM a 7:00 PM."}), 403
    elif email_activo == "exploradores@iglesiazoarsv.org" and (dia_semana != 4 or hora_minutos < inicio_semana or hora_minutos > fin_semana):
        return jsonify({"error": "Error: El registro de asistencia para este grupo solo está habilitado los viernes de 5:45 PM a 7:00 PM."}), 403
    elif email_activo == "embajadores@iglesiazoarsv.org" and (dia_semana != 5 or hora_minutos < inicio_semana or hora_minutos > fin_semana):
        return jsonify({"error": "Error: El registro de asistencia para este grupo solo está habilitado los sábados de 5:45 PM a 7:00 PM."}), 403
    elif email_activo in ["secretariageneral@iglesiazoarsv.org"] and (dia_semana != 6 or hora_minutos < inicio_domingo or hora_minutos > fin_domingo):
        return jsonify({"error": "Error: El registro de asistencia general solo está habilitado los domingos de 2:45 PM a 4:00 PM."}), 403

    if not codigos:
        return jsonify({"error": "Advertencia: Selecciona al menos un miembro para guardar la lista."}), 400

    conn = get_db()
    fecha_hoy = ahora.strftime('%Y-%m-%d')
    hora_hoy = ahora.strftime('%H:%M:%S')
    nombres_asistentes = []

    for codigo in codigos:
        miembro = conn.execute("SELECT * FROM miembros WHERE codigo = ?", (codigo,)).fetchone()
        if miembro:
            conn.execute("INSERT INTO asistencias (miembro_id, fecha, hora, grupo_asistido) VALUES (?, ?, ?, ?)", 
                         (miembro['id'], fecha_hoy, hora_hoy, grupo_esperado))
            conn.execute("UPDATE miembros SET total_asistencias = total_asistencias + 1 WHERE id = ?", (miembro['id'],))
            nombres_asistentes.append(miembro['nombre'])
            
    if nombres_asistentes:
        detalles_auditoria = f"Asistentes: {', '.join(nombres_asistentes)} | IP: {request.remote_addr}"
        conn.execute("INSERT INTO notificaciones_sistema (usuario_correo, accion, detalles) VALUES (?, ?, ?)", 
                     (email_activo, f"Lista de asistencia guardada ({grupo_esperado})", detalles_auditoria))
        
    conn.commit()
    conn.close()
    return jsonify({"message": "Asistencia guardada exitosamente en el servidor"}), 200

# ==================== SANTA CENA Y AUDITORÍA ====================
@app.route('/api/santacena', methods=['POST'])
def registrar_santa_cena():
    data = request.json or {}
    conn = get_db()
    conn.execute("INSERT OR REPLACE INTO santacena (miembro_id, fecha, asistio) VALUES (?, ?, ?)", 
                 (data['miembro_id'], data['fecha'], 1 if data['asistio'] else 0))
    conn.commit()
    conn.close()
    return jsonify({"message": "Registro guardado"}), 200

@app.route('/api/auditoria', methods=['GET'])
def obtener_auditoria():
    if session.get('user_rol') not in ['Administrador', 'Pastor']:
        return jsonify([])
    conn = get_db()
    notis = conn.execute("SELECT * FROM notificaciones_sistema ORDER BY fecha_hora DESC LIMIT 50").fetchall()
    conn.close()
    return jsonify([dict(n) for n in notis])

@app.route('/api/verificar-admin', methods=['POST'])
def verificar_admin():
    data = request.json or {}
    password = data.get('password', '')
    conn = get_db()
    user = conn.execute("SELECT * FROM usuarios WHERE rol='Administrador' AND password_hash=?", (password,)).fetchone()
    conn.close()
    if user:
        return jsonify({"message": "Acceso concedido"}), 200
    return jsonify({"error": "Clave de Administrador incorrecta"}), 401

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
