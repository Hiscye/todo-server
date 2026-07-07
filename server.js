// ============================================
// 当前版本：v1.7.0 - 实时新闻模块（与待办平级）
// 上一个版本：v1.6.0-floating-widget
// 部署分支：v1.7.0-news-tab
// 部署地址：https://todo-server-production-bee1.up.railway.app
// 改动说明：
//   1. 新增「资讯」Tab（与待办平级切换）
//   2. 后端 /api/news 端点（多源：Hacker News + NewsAPI 可选）
//   3. 缓存 5 分钟，减少 API 调用
//   4. Hacker News 内置（无需 key）
//   5. 用户可在设置里配置 NewsAPI key 解锁更多源
// ============================================

// 代办清单实时同步服务器
// 启动后访问 localhost:3000 查看状态，或通过 Cloudflare Tunnel 暴露到公网

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const DATA_FILE = path.join(__dirname, 'todos.json');

// 从磁盘加载已保存的待办（支持服务重启后保留）
let todos = [];
try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    todos = JSON.parse(raw);
    if (!Array.isArray(todos)) todos = [];
} catch (e) {
    todos = [];
}

function saveTodos() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(todos, null, 2));
}

function newId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

// 一个简单的 HTTP + 静态文件服务器
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon'
};

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    // API 接口
    if (req.url === '/status') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
            status: 'ok',
            totalTodos: todos.length,
            users: new Set(todos.map(t => t.ownerId)).size,
            online: onlineUsers.size,
            uptime: Math.round(process.uptime()) + 's'
        }, null, 2));
        return;
    }
    if (req.url === '/todos') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(todos, null, 2));
        return;
    }
    // 📰 新闻 API
    if (req.url.startsWith('/api/news')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        const url = new URL(req.url, `http://${req.headers.host}`);
        const source = url.searchParams.get('source') || 'hn';
        const category = url.searchParams.get('category') || 'top';
        const articles = await fetchNews(source, category);
        res.end(JSON.stringify({
            source,
            category,
            count: articles.length,
            cached: !!cacheGet('hn-' + (source === 'newsapi' ? 'newsapi-' + category + '-cn' : category)),
            articles,
            sources: {
                hn: { name: 'Hacker News', icon: '🟠', needKey: false, categories: ['top', 'new'] },
                newsapi: { name: 'NewsAPI', icon: '📰', needKey: true, available: !!NEWS_API_KEY, categories: ['business', 'entertainment', 'general', 'health', 'science', 'sports', 'technology'] }
            }
        }, null, 2));
        return;
    }

    // 静态文件（默认 index.html）
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(PUBLIC_DIR, filePath);

    // 安全检查：防止路径穿越
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.statusCode = 403;
        res.end('forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end('404 not found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(data);
    });
});

const wss = new WebSocket.Server({ server });

// 每个 ws 对应的用户信息（hello 时设置）
const wsUsers = new WeakMap();
// 在线用户（userId -> { id, name, ip, since, wsSet }）
const onlineUsers = new Map();

function broadcast(msg) {
    const data = JSON.stringify(msg);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

function broadcastOnlineList() {
    const users = Array.from(onlineUsers.values()).map(u => ({
        id: u.id, name: u.name, ip: u.ip,
        since: new Date(u.since).toISOString()
    }));
    broadcast({ type: 'online-list', users, count: users.length });
}

function getPublicIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return xff.split(',')[0].trim();
    const realIp = req.headers['x-real-ip'];
    if (realIp) return realIp;
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp) return cfIp;
    let ip = req.socket.remoteAddress || 'unknown';
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    return ip;
}

wss.on('connection', (ws, req) => {
    const ip = getPublicIp(req);
    console.log(`[${new Date().toLocaleTimeString()}] 新连接：${ip}`);

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch (e) {
            console.error('无效消息:', raw.toString().slice(0, 100));
            return;
        }

        if (msg.type === 'hello') {
            const userId = String(msg.user || '').slice(0, 50);
            const userName = String(msg.userName || '').trim().slice(0, 30) || '匿名';
            if (!userId) return;
            // 记录这个 ws 对应的用户
            wsUsers.set(ws, { id: userId, name: userName });
            // 发送该用户自己的 todos（数据隔离）
            const myTodos = todos.filter(t => t.ownerId === userId);
            ws.send(JSON.stringify({ type: 'state', todos: myTodos }));
            // 注册/更新在线用户
            if (onlineUsers.has(userId)) {
                onlineUsers.get(userId).wsSet.add(ws);
            } else {
                onlineUsers.set(userId, {
                    id: userId, name: userName, ip,
                    since: Date.now(), wsSet: new Set([ws])
                });
                console.log(`  ✓ 上线: ${userName} [${ip}]`);
            }
            broadcastOnlineList();
            return;
        }

        // 需要先 hello 才能操作
        const u = wsUsers.get(ws);
        if (!u) return;
        msg.user = u.id;
        msg.userName = u.name;
        handleMessage(msg);
    });

    ws.on('close', () => {
        const u = wsUsers.get(ws);
        if (u) {
            const on = onlineUsers.get(u.id);
            if (on) {
                on.wsSet.delete(ws);
                if (on.wsSet.size === 0) {
                    onlineUsers.delete(u.id);
                    console.log(`  ✗ 下线: ${u.name} [${on.ip}]`);
                }
            }
            wsUsers.delete(ws);
            broadcastOnlineList();
        }
    });

    ws.on('error', (err) => {
        console.error('连接错误:', err.message);
    });
});

// 校验日期格式 YYYY-MM-DD
function isValidDate(s) {
    if (typeof s !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00');
    return !isNaN(d.getTime());
}

const VALID_PRIORITIES = ['high', 'medium', 'low'];
function normalizePriority(p) {
    return VALID_PRIORITIES.includes(p) ? p : null;
}

function handleMessage(msg) {
    const ownerId = msg.user;
    if (!ownerId) return;

    switch (msg.type) {
        case 'add': {
            const text = String(msg.text || '').trim().slice(0, 200);
            if (!text) return;
            const todo = {
                id: newId(),
                ownerId,
                text,
                completed: false,
                priority: normalizePriority(msg.priority),
                dueDate: isValidDate(msg.dueDate) ? msg.dueDate : null,
                createdAt: new Date().toISOString()
            };
            todos.push(todo);
            saveTodos();
            // 只推给该 owner 的其他连接（通过 userId 过滤）
            broadcastToOwner(ownerId, { type: 'added', todo });
            const tags = [];
            if (todo.priority) tags.push('[' + ({high:'高',medium:'中',low:'低'}[todo.priority]) + ']');
            if (todo.dueDate) tags.push('到期 ' + todo.dueDate);
            console.log(`  + [${ownerId}] ${text}${tags.length ? ' ' + tags.join(' ') : ''}`);
            break;
        }
        case 'update': {
            const todo = todos.find(t => t.id === msg.id);
            // 数据隔离：只能更新自己的 todo
            if (!todo || todo.ownerId !== ownerId) return;
            if (typeof msg.updates === 'object' && msg.updates !== null) {
                if (typeof msg.updates.text === 'string') {
                    const t = msg.updates.text.trim().slice(0, 200);
                    if (t) todo.text = t;
                }
                if (typeof msg.updates.completed === 'boolean') {
                    todo.completed = msg.updates.completed;
                }
                if ('dueDate' in msg.updates) {
                    const v = msg.updates.dueDate;
                    if (v === null || v === '') {
                        todo.dueDate = null;
                    } else if (isValidDate(v)) {
                        todo.dueDate = v;
                    }
                }
                if ('priority' in msg.updates) {
                    todo.priority = normalizePriority(msg.updates.priority);
                }
            }
            saveTodos();
            broadcastToOwner(ownerId, { type: 'updated', todo });
            const tags = [];
            if (todo.priority) tags.push('[' + ({high:'高',medium:'中',low:'低'}[todo.priority]) + ']');
            if (todo.dueDate) tags.push('到期 ' + todo.dueDate);
            console.log(`  ~ [${ownerId}] ${todo.text}${tags.length ? ' ' + tags.join(' ') : ''}`);
            break;
        }
        case 'delete': {
            const idx = todos.findIndex(t => t.id === msg.id);
            if (idx < 0 || todos[idx].ownerId !== ownerId) return;
            todos.splice(idx, 1);
            saveTodos();
            broadcastToOwner(ownerId, { type: 'deleted', id: msg.id });
            console.log(`  - [${ownerId}] ${msg.id}`);
            break;
        }
        case 'clear': {
            const before = todos.length;
            todos = todos.filter(t => t.ownerId !== ownerId);
            if (todos.length === before) return;
            saveTodos();
            broadcastToOwner(ownerId, { type: 'cleared' });
            console.log(`  × [${ownerId}] 清空自己的任务`);
            break;
        }
        default:
            console.warn('  ? 未知消息类型：', msg.type);
    }
}

// 给特定用户的所有连接广播（数据隔离用）
function broadcastToOwner(ownerId, msg) {
    const u = onlineUsers.get(ownerId);
    if (!u) return;
    const data = JSON.stringify(msg);
    u.wsSet.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// ============================================
// 📰 新闻模块
// ============================================
const NEWS_CACHE = new Map(); // key -> { data, expire }
const NEWS_CACHE_TTL = 5 * 60 * 1000; // 5 分钟
const NEWS_API_KEY = process.env.NEWS_API_KEY || ''; // 可在 Railway 环境变量配置

function cacheGet(key) {
    const entry = NEWS_CACHE.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expire) {
        NEWS_CACHE.delete(key);
        return null;
    }
    return entry.data;
}

function cacheSet(key, data) {
    NEWS_CACHE.set(key, { data, expire: Date.now() + NEWS_CACHE_TTL });
}

// Hacker News（无需 key）
async function fetchHackerNews(category = 'top') {
    const cacheKey = 'hn-' + category;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const listUrl = category === 'top'
        ? 'https://hacker-news.firebaseio.com/v0/topstories.json'
        : 'https://hacker-news.firebaseio.com/v0/newstories.json';
    const listRes = await fetch(listUrl, { signal: AbortSignal.timeout(10000) });
    if (!listRes.ok) throw new Error('HN list failed');
    const ids = await listRes.json();
    const topIds = ids.slice(0, 30);

    const items = await Promise.all(topIds.map(async id => {
        try {
            const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: AbortSignal.timeout(5000) });
            if (!r.ok) return null;
            const it = await r.json();
            if (!it || !it.title) return null;
            return {
                id: String(it.id),
                title: it.title,
                url: it.url || `https://news.ycombinator.com/item?id=${it.id}`,
                source: 'Hacker News',
                sourceIcon: '🟠',
                author: it.by || 'anonymous',
                score: it.score || 0,
                comments: it.descendants || 0,
                time: new Date(it.time * 1000).toISOString(),
                summary: (it.text || '').slice(0, 200)
            };
        } catch { return null; }
    }));

    const result = items.filter(Boolean);
    cacheSet(cacheKey, result);
    return result;
}

// NewsAPI（需 key，可选）
async function fetchNewsAPI(category = 'general', country = 'cn') {
    if (!NEWS_API_KEY) return null;
    const cacheKey = 'newsapi-' + category + '-' + country;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const url = `https://newsapi.org/v2/top-headlines?category=${category}&country=${country}&pageSize=30&apiKey=${NEWS_API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'ok' || !Array.isArray(data.articles)) return null;

    const result = data.articles.map((a, i) => ({
        id: 'newsapi-' + i,
        title: a.title || '(无标题)',
        url: a.url,
        source: a.source?.name || 'News',
        sourceIcon: '📰',
        author: a.author || '',
        time: a.publishedAt,
        summary: a.description || '',
        image: a.urlToImage
    })).filter(a => a.title && a.url && a.title !== '(无标题)' && a.title !== '[Removed]');

    cacheSet(cacheKey, result);
    return result;
}

async function fetchNews(source = 'hn', category = 'top') {
    try {
        if (source === 'hn') return await fetchHackerNews(category);
        if (source === 'newsapi') {
            const data = await fetchNewsAPI(category, 'cn') || await fetchNewsAPI(category, 'us');
            if (data) return data;
        }
        if (source === 'all') {
            const [hn, newsapi] = await Promise.all([
                fetchHackerNews('top').catch(() => []),
                fetchNewsAPI('general', 'cn').catch(() => []) || fetchNewsAPI('general', 'us').catch(() => [])
            ]);
            return [...(hn || []), ...(newsapi || [])].slice(0, 50);
        }
        return await fetchHackerNews('top');
    } catch (e) {
        console.error('  ✗ 抓取新闻失败:', e.message);
        return [];
    }
}

server.listen(PORT, HOST, () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('  代办清单实时同步服务器已启动');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  本机访问: http://localhost:${PORT}`);
    console.log(`  局域网访问: http://你的IP:${PORT}`);
    console.log(`  状态查询: http://localhost:${PORT}/status`);
    console.log(`  当前待办: ${todos.length} 条`);
    console.log(`  数据文件: ${DATA_FILE}`);
    console.log('');
    console.log('  如果使用花生壳（vicp.fun）等动态域名：');
    console.log('  1. 在花生壳后台设置外网端口 → 内网 IP + 端口 ' + PORT);
    console.log('  2. 通过你的动态域名访问即可');
    console.log('═══════════════════════════════════════════════════');
    console.log('');
});
