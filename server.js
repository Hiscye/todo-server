// ============================================
// 当前版本：v1.0.2 - 实时在线用户列表 + 后台 IP 日志
// 上一个版本：v1.0.1
// 部署分支：1.0.2-online-users
// 部署地址：https://todo-server-production-bee1.up.railway.app
// 改动说明：
//   1. 维护 onlineUsers Map 追踪所有连接的用户
//   2. getPublicIp() 提取公网 IP（适配 Railway/Cloudflare 代理）
//   3. registerOnline/unregisterOnline/broadcastOnlineList 函数
//   4. hello 消息时注册用户，断开时注销
//   5. /status 接口返回 onlineUsers 列表
// ============================================
//   5. 实时显示在线用户列表（头像 + 名字 + IP）
//   6. 后台日志记录每个用户的公网 IP（X-Forwarded-For）
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

// 提取公网 IP（适配 Railway/Cloudflare 等代理环境）
function getPublicIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
        return xff.split(',')[0].trim();
    }
    const realIp = req.headers['x-real-ip'];
    if (realIp) return realIp;
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp) return cfIp;
    let ip = req.socket.remoteAddress || 'unknown';
    // IPv6 格式的 IPv4 (::ffff:1.2.3.4) 简化
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    return ip;
}

// 在线用户追踪：userId -> { id, name, ip, since, connections: Set<ws> }
const onlineUsers = new Map();

function serializeUser(u) {
    return { id: u.id, name: u.name, ip: u.ip, since: new Date(u.since).toISOString() };
}

function broadcastOnlineList() {
    const users = Array.from(onlineUsers.values()).map(serializeUser);
    broadcast({ type: 'online-list', users, count: users.length });
}

function registerOnline(userId, userName, ip, ws) {
    if (!userId) return;
    let u = onlineUsers.get(userId);
    if (!u) {
        u = { id: userId, name: userName || '匿名', ip, since: Date.now(), connections: new Set() };
        onlineUsers.set(userId, u);
        console.log(`  ✓ 用户加入: ${u.name} [IP: ${ip}]`);
    } else {
        // 多端连接，更新名字
        if (userName && userName !== u.name) {
            console.log(`  ✎ 用户改名: ${u.name} → ${userName}`);
            u.name = userName;
        }
    }
    u.connections.add(ws);
}

function unregisterOnline(ws) {
    for (const u of onlineUsers.values()) {
        if (u.connections.has(ws)) {
            u.connections.delete(ws);
            if (u.connections.size === 0) {
                onlineUsers.delete(u.id);
                console.log(`  ✗ 用户离开: ${u.name} [IP: ${u.ip}]`);
            }
            return;
        }
    }
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

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    // API 接口
    if (req.url === '/status') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
            status: 'ok',
            todos: todos.length,
            clients: wss ? wss.clients.size : 0,
            onlineUsers: Array.from(onlineUsers.values()).map(serializeUser),
            uptime: Math.round(process.uptime()) + 's'
        }, null, 2));
        return;
    }
    if (req.url === '/todos') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(todos, null, 2));
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

function broadcast(msg) {
    const data = JSON.stringify(msg);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

function broadcastOnline() {
    // 已废弃：保留作为向后兼容，但实际不再使用
    const users = Array.from(onlineUsers.values()).map(serializeUser);
    broadcast({ type: 'online', count: users.length });
}

wss.on('connection', (ws, req) => {
    const ip = getPublicIp(req);
    console.log(`[${new Date().toLocaleTimeString()}] 新连接：${ip}，活跃连接 ${wss.clients.size}`);

    // 给新连接的客户端发送完整状态
    ws.send(JSON.stringify({ type: 'state', todos }));

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch (e) {
            console.error('无效的消息:', raw.toString().slice(0, 100));
            return;
        }
        if (msg.type === 'hello') {
            // 注册/更新用户
            registerOnline(msg.user, msg.userName, ip, ws);
            broadcastOnlineList();
            return;
        }
        handleMessage(msg);
    });

    ws.on('close', () => {
        console.log(`[${new Date().toLocaleTimeString()}] 连接断开 (${ip})，剩余 ${wss.clients.size}`);
        unregisterOnline(ws);
        broadcastOnlineList();
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
    switch (msg.type) {
        case 'add': {
            const text = String(msg.text || '').trim().slice(0, 200);
            if (!text) return;
            const todo = {
                id: newId(),
                text,
                completed: false,
                priority: normalizePriority(msg.priority),
                dueDate: isValidDate(msg.dueDate) ? msg.dueDate : null,
                createdAt: new Date().toISOString(),
                createdBy: String(msg.user || msg.userId || '').slice(0, 50) || null,
                createdByName: String(msg.userName || '').trim().slice(0, 30) || null
            };
            todos.push(todo);
            saveTodos();
            broadcast({ type: 'added', todo });
            const tags = [];
            if (todo.priority) tags.push('[' + ({high:'高',medium:'中',low:'低'}[todo.priority]) + ']');
            if (todo.dueDate) tags.push('到期 ' + todo.dueDate);
            if (todo.createdByName) tags.push('👤 ' + todo.createdByName);
            console.log(`  + 添加：${text}${tags.length ? ' ' + tags.join(' ') : ''}`);
            break;
        }
        case 'update': {
            const todo = todos.find(t => t.id === msg.id);
            if (!todo) return;
            if (typeof msg.updates === 'object' && msg.updates !== null) {
                if (typeof msg.updates.text === 'string') {
                    const t = msg.updates.text.trim().slice(0, 200);
                    if (t) todo.text = t;
                }
                if (typeof msg.updates.completed === 'boolean') {
                    // 只有从未完成变成完成时才记录完成人
                    if (msg.updates.completed === true && !todo.completed) {
                        todo.completedBy = String(msg.user || msg.userId || '').slice(0, 50) || null;
                        todo.completedByName = String(msg.userName || '').trim().slice(0, 30) || null;
                        todo.completedAt = new Date().toISOString();
                    }
                    todo.completed = msg.updates.completed;
                }
                // dueDate 字段：传字符串设置，传 null/空字符串清除，其他忽略
                if ('dueDate' in msg.updates) {
                    const v = msg.updates.dueDate;
                    if (v === null || v === '') {
                        todo.dueDate = null;
                    } else if (isValidDate(v)) {
                        todo.dueDate = v;
                    }
                }
                // priority 字段：传字符串设置，传 null 清除，其他忽略
                if ('priority' in msg.updates) {
                    todo.priority = normalizePriority(msg.updates.priority);
                }
            }
            saveTodos();
            broadcast({ type: 'updated', todo });
            const tags = [];
            if (todo.priority) tags.push('[' + ({high:'高',medium:'中',low:'低'}[todo.priority]) + ']');
            if (todo.dueDate) tags.push('到期 ' + todo.dueDate);
            if (todo.createdByName) tags.push('👤 ' + todo.createdByName);
            console.log(`  ~ 更新：${todo.text} [${todo.completed ? '✓' : ' '}]${tags.length ? ' ' + tags.join(' ') : ''}`);
            break;
        }
        case 'delete': {
            const before = todos.length;
            todos = todos.filter(t => t.id !== msg.id);
            if (todos.length === before) return;
            saveTodos();
            broadcast({ type: 'deleted', id: msg.id });
            console.log(`  - 删除：${msg.id}`);
            break;
        }
        case 'clear': {
            todos = [];
            saveTodos();
            broadcast({ type: 'cleared' });
            console.log('  × 清空所有');
            break;
        }
        default:
            console.warn('  ? 未知消息类型：', msg.type);
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
