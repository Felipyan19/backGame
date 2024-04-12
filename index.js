const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const cors = require('cors'); // Importa el middleware cors
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

// Configurar multer para manejar la carga de archivos
const upload = multer({
    dest: 'uploads/', // Opcional: limitar el tamaño de los archivos
});

app.use(express.json());

const db = new sqlite3.Database(':memory:');

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS partidas (id INTEGER PRIMARY KEY AUTOINCREMENT, ganador TEXT, perdedor TEXT, fecha TEXT, tiempo TEXT)");

    db.run("CREATE TABLE IF NOT EXISTS jugadores (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, foto BLOB, fecha TEXT)");
});

app.post('/api/partidas', (req, res) => {
    const { ganador, perdedor, fecha, tiempo } = req.body;
    const insert = db.prepare("INSERT INTO partidas (ganador, perdedor, fecha, tiempo) VALUES (?, ?, ?, ?)");
    insert.run(ganador, perdedor, fecha, tiempo, (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: 'Partida registrada exitosamente' });
    });
    insert.finalize();
});


app.get('/api/partidas', (req, res) => {
    db.all("SELECT * FROM partidas", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Usamos upload.fields() para manejar ambos campos 'foto' y 'audio'
app.post('/api/jugadores', upload.fields([{ name: 'foto', maxCount: 1 }]), (req, res) => {
    const { nombre, fecha } = req.body;
    const fotos = req.files['foto'];
    if (!fotos || fotos.length === 0 || !nombre || !fecha) {
        res.status(400).json({ error: 'No se han proporcionado todos los archivos necesarios' });
        return;
    }

    const fotoData = fs.readFileSync(fotos[0].path);
    const insert = db.prepare("INSERT INTO jugadores (nombre, foto, fecha) VALUES (?, ?, ?)");
    insert.run(nombre, fotoData, fecha, function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        const jugadorId = this.lastID;
        db.get("SELECT id, nombre, foto, fecha FROM jugadores WHERE id = ?", [jugadorId], (err, jugador) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            const jugadorFormateado = {
                id: jugador.id,
                nombre: jugador.nombre,
                foto: jugador.foto ? Buffer.from(jugador.foto).toString('base64') : null
            };

            res.json(jugadorFormateado);
        });
    });
});


app.get('/api/jugadores', (req, res) => {
    db.all("SELECT id, nombre, foto FROM jugadores", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        const jugadores = rows.map(jugador => {
            return {
                id: jugador.id,
                nombre: jugador.nombre,
                foto: jugador.foto ? Buffer.from(jugador.foto).toString('base64') : null
            };
        });

        res.json(jugadores);
    });
});

app.get('/api/posiciones', (req, res) => {
    const query = `
        SELECT j.id, j.nombre, j.foto, 
            COALESCE(COUNT(p.id), 0) AS partidas_jugadas, 
            COALESCE(SUM(CASE WHEN p.ganador = j.nombre THEN 1 ELSE 0 END), 0) AS partidas_ganadas,
            COALESCE(SUM(CASE WHEN p.perdedor = j.nombre THEN 1 ELSE 0 END), 0) AS partidas_perdidas,
            COALESCE(SUM(p.tiempo), 0) AS tiempo_sumado
        FROM jugadores j
        LEFT JOIN partidas p ON j.nombre = p.ganador OR j.nombre = p.perdedor
        GROUP BY j.id
    `;
    
    db.all(query, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        const jugadores = rows.map(jugador => {
            return {
                id: jugador.id,
                nombre: jugador.nombre,
                partidas_jugadas: jugador.partidas_jugadas,
                partidas_ganadas: jugador.partidas_ganadas,
                partidas_perdidas: jugador.partidas_perdidas,
                tiempo_sumado: jugador.tiempo_sumado,
                foto: jugador.foto ? Buffer.from(jugador.foto).toString('base64') : null
            };
        });

        res.json(jugadores);
    });
});

app.listen(PORT, () => {
    console.log(`Servidor iniciado en el puerto ${PORT}`);
});
