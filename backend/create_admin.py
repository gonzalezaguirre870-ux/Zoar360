import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'database', 'iglesia.db')

def ensure_admin(email='admin@local.test', password='admin123'):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, email TEXT UNIQUE, password_hash TEXT, rol TEXT)")
    cur.execute("SELECT * FROM usuarios WHERE email = ?", (email,))
    if cur.fetchone():
        print(f'Usuario {email} ya existe.')
    else:
        cur.execute("INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)",
                    ('Admin Dev', email, password, 'Administrador'))
        conn.commit()
        print(f'Usuario {email} creado con contraseña: {password}')
    conn.close()

if __name__ == '__main__':
    ensure_admin()
