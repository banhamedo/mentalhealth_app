import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("mental_health.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    name TEXT,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER,
    role TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(conversation_id) REFERENCES conversations(id)
  );
`);

// Seed Admin if not exists
const adminEmail = "mhmdg7480@gmail.com";
const checkAdmin = db.prepare("SELECT * FROM users WHERE email = ?").get(adminEmail);
if (!checkAdmin) {
  db.prepare("INSERT INTO users (email, name, role) VALUES (?, ?, ?)").run(adminEmail, "Admin", "admin");
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  app.post("/api/login", (req, res) => {
    const { email, name } = req.body;
    let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user) {
      const result = db.prepare("INSERT INTO users (email, name) VALUES (?, ?)").run(email, name || "User");
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    }
    res.json(user);
  });

  app.get("/api/conversations/:userId", (req, res) => {
    const conversations = db.prepare("SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC").all(req.params.userId);
    res.json(conversations);
  });

  app.post("/api/conversations", (req, res) => {
    const { userId, title } = req.body;
    const result = db.prepare("INSERT INTO conversations (user_id, title) VALUES (?, ?)").run(userId, title);
    res.json({ id: result.lastInsertRowid });
  });

  app.get("/api/messages/:conversationId", (req, res) => {
    const messages = db.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC").all(req.params.conversationId);
    res.json(messages);
  });

  app.post("/api/messages", (req, res) => {
    const { conversationId, role, content } = req.body;
    db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)").run(conversationId, role, content);
    res.json({ success: true });
  });

  app.delete("/api/conversations/:id", (req, res) => {
    db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(req.params.id);
    db.prepare("DELETE FROM conversations WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Admin Routes
  app.get("/api/admin/stats", (req, res) => {
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    const conversationCount = db.prepare("SELECT COUNT(*) as count FROM conversations").get().count;
    const messageCount = db.prepare("SELECT COUNT(*) as count FROM messages").get().count;
    res.json({ userCount, conversationCount, messageCount });
  });

  app.get("/api/admin/users", (req, res) => {
    const users = db.prepare("SELECT * FROM users").all();
    res.json(users);
  });

  app.get("/api/admin/conversations", (req, res) => {
    const conversations = db.prepare(`
      SELECT c.*, u.email as user_email 
      FROM conversations c 
      JOIN users u ON c.user_id = u.id 
      ORDER BY c.created_at DESC
    `).all();
    res.json(conversations);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
