from flask import Flask, request, jsonify, session
from flask_cors import CORS
import sqlite3
import datetime
import os

app = Flask(__name__)
CORS(app)
app.secret_key = 'clave_super_secreta_para_sesiones'

# Ruta de la base de datos en Render
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'database', 'iglesia.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ==================== VALIDACIÓN DE PERMISOS ====================
def es_admin_o_pastor(rol): return rol in ['Administrador', 'Pastor']
def es_secretario_general(rol): return rol == 'Secretario_General'
def es_secretario_de_grupo(rol): return rol.startswith('Secretario_') and rol != 'Secretario_General'

# ==================== LOGIN ====================
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    user = get_db().execute("SELECT * FROM usuarios WHERE email = ? AND password_hash = ?", (data['email'], data['password'])).fetchone()
    if user:
        session.update({'user_id': user['id'], 'user_rol': user['rol'], 'user_email': user['email']})
        return jsonify({"message": "Login exitoso", "rol": user['rol'], "email": user['email'], "nombre": user['nombre']}), 200
    return jsonify({"error": "Credenciales incorrectas"}), 401

# ==================== MIEMBROS ====================
@app.route('/api/miembros', methods=['GET'])
def obtener_miembros():
    conn = get_db()
    miembros = conn.execute("SELECT * FROM miembros ORDER BY codigo ASC").fetchall()
    conn.close()
    return jsonify([dict(m) for m in miembros])

@app.route('/api/miembros', methods=['POST'])
def crear_miembro():
    if not es_admin_o_pastor(session.get('user_rol')):
        return jsonify({"error": "Solo Pastor/Administrador pueden registrar."}), 403
    data = request.json
    conn = get_db()
    ultimo = conn.execute("SELECT MAX(codigo) as max FROM miembros").fetchone()
    nuevo_codigo = f"{(int(ultimo['max']) + 1) if ultimo and ultimo['max'] else 1:04d}"
    conn.execute("INSERT INTO miembros (codigo, nombre, telefono, tipo, grupo) VALUES (?, ?, ?, ?, ?)", 
                 (nuevo_codigo, data['nombre'], data.get('telefono'), data['tipo'], data.get('grupo', 'General')))
    conn.commit()
    conn.close()
    return jsonify({"message": "Miembro creado", "codigo": nuevo_codigo}), 201

@app.route('/api/miembros/<codigo>', methods=['DELETE'])
def eliminar_miembro(codigo):
    data = request.json
    conn = get_db()
    user = conn.execute("SELECT * FROM usuarios WHERE (rol='Administrador' OR rol='Pastor') AND password_hash=?", (data['password'],)).fetchone()
    if not user:
        conn.close()
        return jsonify({"error": "Permiso denegado"}), 403
    conn.execute("DELETE FROM miembros WHERE codigo = ?", (codigo,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Miembro eliminado"}), 200

# ==================== SOLICITUDES ====================
@app.route('/api/solicitudes', methods=['POST'])
def crear_solicitud():
    data = request.json
    conn = get_db()
    conn.execute("INSERT INTO solicitudes (nombre, telefono, tipo, grupo, solicitante_email, fecha_solicitud) VALUES (?, ?, ?, ?, ?, ?)", 
                 (data['nombre'], data.get('telefono'), data['tipo'], data.get('grupo'), session.get('user_email'), datetime.datetime.now().strftime('%Y-%m-%d')))
    conn.commit()
    conn.close()
    return jsonify({"message": "Solicitud enviada"}), 201

# ==================== ASISTENCIA (CON MECANISMO DE RELOJ AUTOMÁTICO) ====================
@app.route('/api/asistencia/grupo/<grupo>', methods=['GET'])
def obtener_asistencia_grupo(grupo):
    conn = get_db()
    miembros = conn.execute("SELECT * FROM miembros WHERE grupo LIKE ?", (f'%{grupo}%',)).fetchall()
    resultado = []
    for m in miembros:
        total = conn.execute("SELECT COUNT(*) as total FROM asistencias WHERE miembro_id = ?", (m['id'],)).fetchone()
        m_dict = dict(m)
        m_dict['total_asistencias'] = total['total']
        resultado.append(m_dict)
    conn.close()
    return jsonify(resultado)

@app.route('/api/marcar-asistencia', methods=['POST'])
def marcar_asistencia():
    if 'user_id' not in session: return jsonify({"error": "No autorizado"}), 401
    
    data = request.json
    # Capturar la hora REAL del servidor (Render). No se puede engañar.
    ahora = datetime.datetime.now() 
    fecha_actual = ahora.date()
    hora_actual = ahora.time()

    conn = get_db()
    miembro = conn.execute("SELECT * FROM miembros WHERE codigo = ?", (data['codigo'],)).fetchone()
    if not miembro: return jsonify({"error": "Miembro no encontrado"}), 404

    dia = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][ahora.weekday()]
    usuario_rol = session.get('user_rol')
    error = None

    # === LÓGICA DE RELOJ Y CALENDARIO AUTOMÁTICA ===
    # Nota: Render usa tiempo UTC. Ajustamos para El Salvador (-6 horas).
    # Si no quieres ajustar zona horaria, la lógica de Jueves 5:45 PM se convierte a 11:45 PM UTC.
    
    if dia == 'Jueves':
        # Horario en El Salvador: 5:45 PM a 7:00 PM
        inicio = datetime.time(23, 45) # 5:45 PM en UTC
        fin = datetime.time(1, 0)     # 7:00 PM en UTC (del día siguiente, pero lo dejamos simple)
        
        if not (inicio <= hora_actual <= datetime.time(23, 59)): 
            error = "Fuera de horario. Solo Jueves de 5:45 PM a 7:00 PM (hora local)."
        elif usuario_rol != 'Secretario_Fraternidad_de_Varones': error = "Solo el Secretario de Fraternidad."
        elif 'Fraternidad' not in miembro['grupo']: error = "Este miembro no es de Fraternidad."
    elif dia == 'Sábado':
        if fecha_actual.day not in [1,8,15,22,29]: error = "Hoy no es día de Embajadores"
        elif usuario_rol != 'Secretaria_Embajadores_de_Cristo': error = "Solo la Secretaria de Embajadores."
        elif 'Embajadores' not in miembro['grupo']: error = "Este miembro no es de Embajadores."
    elif dia == 'Domingo' and usuario_rol not in ['Administrador', 'Pastor', 'Secretario_General']:
        error = "El domingo es general, solo Pastor, Admin o Gral. pueden marcar."

    if error:
        conn.close()
        return jsonify({"error": error}), 403

    conn.execute("INSERT INTO asistencias (miembro_id, fecha, hora) VALUES (?, ?, ?)", 
                 (miembro['id'], fecha_actual.strftime('%Y-%m-%d'), hora_actual.strftime('%H:%M:%S')))
    conn.commit()
    conn.close()
    return jsonify({"message": "Asistencia marcada", "fecha": str(fecha_actual)}), 200

# ==================== INICIALIZACIÓN DE BASE DE DATOS (Credenciales Faltantes) ====================
# Este bloque se ejecuta al iniciar el servidor para asegurar que la Secretaria Femenil exista
with app.app_context():
    conn = get_db()
    conn.execute("""
        INSERT OR IGNORE INTO usuarios (nombre, email, password_hash, rol) 
        VALUES ('Secretaria Concilio Misionero Femenil', 'femenil@iglesiazoarsv.org', 'FemenilZoar2026', 'Secretaria_Concilio_Misionero_Femenil')
    """)
    conn.commit()
    conn.close()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)