// Feather Kitchen API: shared cookbook for the flock. SQLite storage for recipes, comments and events.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA = path.join(__dirname, 'data');
try { fs.mkdirSync(DATA, { recursive: true }); } catch (e) {}
const db = new Database(path.join(DATA, 'kitchen.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    bird TEXT NOT NULL DEFAULT 'gurt',
    kind TEXT NOT NULL DEFAULT 'snack',
    servings INTEGER NOT NULL DEFAULT 1,
    minutes INTEGER NOT NULL DEFAULT 10,
    ingredients TEXT NOT NULL DEFAULT '',
    steps TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL,
    bird TEXT NOT NULL DEFAULT 'gurt',
    text TEXT NOT NULL DEFAULT '',
    created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id TEXT,
    bird TEXT,
    action TEXT,
    detail TEXT,
    created TEXT
  );
`);

const stmt = {
  list: db.prepare('SELECT * FROM recipes ORDER BY created DESC LIMIT 300'),
  get: db.prepare('SELECT * FROM recipes WHERE id = ?'),
  insert: db.prepare('INSERT INTO recipes (id,title,bird,kind,servings,minutes,ingredients,steps,note,created) VALUES (@id,@title,@bird,@kind,@servings,@minutes,@ingredients,@steps,@note,@created)'),
  remove: db.prepare('DELETE FROM recipes WHERE id = ?'),
  comments: db.prepare('SELECT * FROM comments WHERE recipe_id = ? ORDER BY created ASC'),
  allComments: db.prepare('SELECT * FROM comments ORDER BY created ASC'),
  addComment: db.prepare('INSERT INTO comments (id,recipe_id,bird,text,created) VALUES (@id,@recipe_id,@bird,@text,@created)'),
  event: db.prepare('INSERT INTO events (recipe_id,bird,action,detail,created) VALUES (?,?,?,?,?)'),
  events: db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 300')
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function readBody(req, cb) {
  let raw = '';
  req.on('data', c => { raw += c; if (raw.length > 100000) req.destroy(); });
  req.on('end', () => {
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (e) { body = {}; }
    cb(body);
  });
}
function rid(p) { return 'FK-' + Math.random().toString(36).slice(2, 8).toUpperCase(); }
function now() { return new Date().toISOString(); }

module.exports = function handler(req, res, seg) {
  const route = seg[0];

  if (req.method === 'GET' && route === 'recipes') {
    const recipes = stmt.list.all();
    const comments = stmt.allComments.all();
    const byRecipe = {};
    comments.forEach(c => { (byRecipe[c.recipe_id] = byRecipe[c.recipe_id] || []).push(c); });
    const kinds = {};
    recipes.forEach(r => { kinds[r.kind] = (kinds[r.kind] || 0) + 1; });
    return json(res, 200, {
      recipes, comments: byRecipe, total: recipes.length,
      birds: new Set(recipes.map(r => r.bird)).size, kinds
    });
  }

  if (req.method === 'GET' && route === 'events') {
    return json(res, 200, { events: stmt.events.all() });
  }

  if (req.method === 'POST' && route === 'recipe' && seg[1] === 'new') {
    readBody(req, body => {
      const title = String(body.title || '').trim().slice(0, 120);
      if (!title) return json(res, 400, { error: 'title required' });
      const id = rid();
      const r = {
        id, title,
        bird: String(body.bird || 'gurt').trim().slice(0, 40),
        kind: String(body.kind || 'snack').trim().slice(0, 30),
        servings: Math.max(1, Math.min(99, parseInt(body.servings, 10) || 1)),
        minutes: Math.max(1, Math.min(999, parseInt(body.minutes, 10) || 10)),
        ingredients: String(body.ingredients || '').slice(0, 2000),
        steps: String(body.steps || '').slice(0, 4000),
        note: String(body.note || '').slice(0, 500),
        created: now()
      };
      stmt.insert.run(r);
      stmt.event.run(id, r.bird, 'cooked', r.title, r.created);
      return json(res, 200, { ok: true, recipe: r });
    });
    return;
  }

  if (req.method === 'POST' && route === 'recipe' && seg[1] === 'comment') {
    readBody(req, body => {
      const recipeId = String(body.recipe_id || '');
      if (!stmt.get.get(recipeId)) return json(res, 404, { error: 'no such recipe' });
      const text = String(body.text || '').trim().slice(0, 500);
      if (!text) return json(res, 400, { error: 'text required' });
      const c = { id: rid(), recipe_id: recipeId, bird: String(body.bird || 'gurt').trim().slice(0, 40), text, created: now() };
      stmt.addComment.run(c);
      stmt.event.run(recipeId, c.bird, 'commented', text.slice(0, 80), c.created);
      return json(res, 200, { ok: true, comment: c });
    });
    return;
  }

  if (req.method === 'POST' && route === 'recipe' && seg[1] === 'delete') {
    readBody(req, body => {
      const id = String(body.id || '');
      const r = stmt.get.get(id);
      if (!r) return json(res, 404, { error: 'no such recipe' });
      stmt.remove.run(id);
      stmt.event.run(id, r.bird, 'removed', r.title, now());
      return json(res, 200, { ok: true });
    });
    return;
  }

  return json(res, 404, { error: 'not found' });
};
