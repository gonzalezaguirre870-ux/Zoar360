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
    
    conn.execute("INSERT INTO solicitudes (nombre, telefono, tipo, grupo, solicitante_email) VALUES (?, ?, ?, ?, ?)", 
                 (nombre_final, data.get('telefono'), data['tipo'], data.get('grupo'), session.get('user_rol')))
    conn.commit()
    
    # Auditoría
    conn.execute("INSERT INTO notificaciones_sistema (usuario_correo, accion, detalles) VALUES (?, ?, ?)", 
                 (session.get('user_rol'), f"Solicitud de {data['nombre']}", f"Tipo: {data['tipo']}, Grupo: {data['grupo']}"))
    conn.commit()
    conn.close()
    return jsonify({"message": "Solicitud enviada"}), 201

@app.route('/api/solicitudes', methods=['GET'])
def obtener_solicitudes():
    if session.get('user_rol') not in ['Administrador', 'Pastor']:
        return jsonify([])
    conn = get_db()
    solicitudes = conn.execute("SELECT * FROM solicitudes WHERE estado = 'Pendiente'").fetchall()
    conn.close()
    return jsonify([dict(s) for s in solicitudes])

@app.route('/api/solicitudes/<int:id>', methods=['PUT'])
def procesar_solicitud(id):
    if session.get('user_rol') not in ['Administrador', 'Pastor']:
        return jsonify({"error": "Acceso denegado"}), 403
    data = request.json
    conn = get_db()
    sol = conn.execute("SELECT * FROM solicitudes WHERE id = ?", (id,)).fetchone()
    if data['estado'] == 'Aprobada':
        ultimo = conn.execute("SELECT MAX(codigo) as max FROM miembros").fetchone()
        nuevo_codigo = f"{(int(ultimo['max']) + 1) if ultimo and ultimo['max'] else 1:04d}"
        conn.execute("INSERT INTO miembros (codigo, nombre, telefono, tipo, grupo) VALUES (?, ?, ?, ?, ?)", 
                     (nuevo_codigo, sol['nombre'], sol['telefono'], sol['tipo'], sol['grupo']))
    conn.execute("UPDATE solicitudes SET estado = ? WHERE id = ?", (data['estado'], id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Solicitud procesada"}), 200

# ==================== ASISTENCIA (FILTRO ESTRICTO) ====================
@app.route('/api/asistencia/grupo/<grupo>', methods=['GET'])
def obtener_asistencia_grupo(grupo):
    conn = get_db()
    # FILTRO ESTRICTO POR MINISTERIO
    miembros = conn.execute("SELECT * FROM miembros WHERE grupo LIKE ?", (f'%{grupo}%',)).fetchall()
    resultado = []
    for m in miembros:
        total = conn.execute("SELECT COUNT(*) as total FROM asistencias WHERE miembro_id = ?", (m['id'],)).fetchone()
        m_dict = dict(m)
        m_dict['total_asistencias'] = total['total'] if total else 0
        resultado.append(m_dict)
    conn.close()
    return jsonify(resultado)

@app.route('/api/marcar-asistencia', methods=['POST'])
def marcar_asistencia():
    if 'user_id' not in session: return jsonify({"error": "No autorizado"}), 401
    data = request.json
    ahora = datetime.datetime.now()
    conn = get_db()
    miembro = conn.execute("SELECT * FROM miembros WHERE codigo = ?", (data['codigo'],)).fetchone()
    if not miembro: return jsonify({"error": "Miembro no encontrado"}), 404
    
    # Validación de horario (Ejemplo simplificado)
    conn.execute("INSERT INTO asistencias (miembro_id, fecha, hora) VALUES (?, ?, ?)", 
                 (miembro['id'], ahora.strftime('%Y-%m-%d'), ahora.strftime('%H:%M:%S')))
    conn.execute("UPDATE miembros SET total_asistencias = total_asistencias + 1 WHERE id = ?", (miembro['id'],))
    conn.commit()
    
    # Auditoría
    conn.execute("INSERT INTO notificaciones_sistema (usuario_correo, accion, detalles) VALUES (?, ?, ?)", 
                 (session.get('user_rol'), f"Asistencia de {miembro['nombre']}", f"Código: {miembro['codigo']}"))
    conn.commit()
    conn.close()
    return jsonify({"message": "Asistencia guardada"}), 200

# ==================== SANTA CENA ====================
@app.route('/api/santacena', methods=['POST'])
def registrar_santa_cena():
    data = request.json
    conn = get_db()
    conn.execute("INSERT OR REPLACE INTO santacena (miembro_id, fecha, asistio) VALUES (?, ?, ?)", 
                 (data['miembro_id'], data['fecha'], 1 if data['asistio'] else 0))
    conn.commit()
    conn.close()
    return jsonify({"message": "Registro guardado"}), 200

# ==================== AUDITORÍA ====================
@app.route('/api/auditoria', methods=['GET'])
def obtener_auditoria():
    if session.get('user_rol') not in ['Administrador', 'Pastor']:
        return jsonify([])
    conn = get_db()
    notis = conn.execute("SELECT * FROM notificaciones_sistema ORDER BY fecha_hora DESC LIMIT 50").fetchall()
    conn.close()
    return jsonify([dict(n) for n in notis])

# ==================== VERIFICACIÓN ADMIN ====================
@app.route('/api/verificar-admin', methods=['POST'])
def verificar_admin():
    data = request.json
    user = get_db().execute("SELECT * FROM usuarios WHERE rol='Administrador' AND password_hash=?", (data['password'],)).fetchone()
    if user:
        return jsonify({"message": "Acceso concedido"}), 200
    return jsonify({"error": "Clave incorrecta"}), 401

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)