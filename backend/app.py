from flask import Flask, request, jsonify, session
from flask_cors import CORS
import sqlite3
import datetime
import os

app = Flask(__name__)
CORS(app)
app.secret_key = 'clave_super_secreta_para_sesiones'

# Ruta de la base de datos
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
    # Ahora el Pastor (y todos los roles) pueden ver la lista de miembros sin error
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

# ==================== SOLICITUDES Y ASISTENCIA ====================
@app.route('/api/solicitudes', methods=['POST'])
def crear_solicitud():
    data = request.json
    conn = get_db()
    conn.execute("INSERT INTO solicitudes (nombre, telefono, tipo, grupo, solicitante_email, fecha_solicitud) VALUES (?, ?, ?, ?, ?, ?)", 
                 (data['nombre'], data.get('telefono'), data['tipo'], data.get('grupo'), session.get('user_email'), datetime.datetime.now().strftime('%Y-%m-%d')))
    conn.commit()
    conn.close()
    return jsonify({"message": "Solicitud enviada"}), 201

# ==================== ASISTENCIA ====================
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
    ahora = datetime.datetime.now()
    conn = get_db()
    miembro = conn.execute("SELECT * FROM miembros WHERE codigo = ?", (data['codigo'],)).fetchone()
    if not miembro: return jsonify({"error": "Miembro no encontrado"}), 404

    conn.execute("INSERT INTO asistencias (miembro_id, fecha, hora) VALUES (?, ?, ?)", 
                 (miembro['id'], ahora.strftime('%Y-%m-%d'), ahora.strftime('%H:%M:%S')))
    conn.commit()
    conn.close()
    return jsonify({"message": "Asistencia marcada"}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)