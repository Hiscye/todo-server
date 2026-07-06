// ============================================
// 当前版本：v1.3.0 - UI/UX 全面升级 + 任务详情 + 子任务
// 上一个版本：v1.0.2
// 部署分支：v1.3.0-ui-redesign
// 部署地址：https://todo-server-production-bee1.up.railway.app
// 改动说明：
//   1. CSS 设计系统化（变量、玻璃拟态、阴影层次、动画）
//   2. 任务详情面板（描述、子任务、附件 URL）
//   3. Toast 通知组件
//   4. 仪表盘统计卡片
//   5. 空状态插画 + 引导
//   6. 加载骨架屏
//   7. 微交互动效
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

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    // API 接口
    if (req.url === '/status') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
            status: 'ok',
            todos: todos.length,
            clients: wss ? wss.clients.size : 0,
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
    broadcast({ type: 'online', count: wss.clients.size });
}

wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[${new Date().toLocaleTimeString()}] 新连接：${ip}，当前在线 ${wss.clients.size} 人`);

    // 给新连接的客户端发送完整状态
    ws.send(JSON.stringify({ type: 'state', todos }));
    // 通知所有人最新在线人数
    broadcastOnline();

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch (e) {
            console.error('无效的消息:', raw.toString().slice(0, 100));
            return;
        }
        if (msg.type === 'hello') {
            console.log(`  · 用户标识：${msg.user || '(未设置)'}`);
            return;
        }
        handleMessage(msg);
    });

    ws.on('close', () => {
        console.log(`[${new Date().toLocaleTimeString()}] 断开连接，剩余 ${wss.clients.size} 人`);
        broadcastOnline();
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

function normalizeSubtasks(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 50).map(s => {
        if (typeof s === 'string') {
            return { id: newId(), text: s.slice(0, 200), completed: false };
        }
        if (s && typeof s === 'object') {
            return {
                id: String(s.id || newId()).slice(0, 50),
                text: String(s.text || '').slice(0, 200),
                completed: !!s.completed
            };
        }
        return null;
    }).filter(Boolean);
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
                description: String(msg.description || '').slice(0, 2000),
                subtasks: normalizeSubtasks(msg.subtasks),
                attachments: Array.isArray(msg.attachments) ? msg.attachments.slice(0, 20).map(a => String(a).slice(0, 500)) : [],
                createdAt: new Date().toISOString()
            };
            todos.push(todo);
            saveTodos();
            broadcast({ type: 'added', todo });
            const tags = [];
            if (todo.priority) tags.push('[' + ({high:'高',medium:'中',low:'低'}[todo.priority]) + ']');
            if (todo.dueDate) tags.push('到期 ' + todo.dueDate);
            if (todo.subtasks && todo.subtasks.length) tags.push(todo.subtasks.length + '个子任务');
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
                if ('description' in msg.updates) {
                    todo.description = String(msg.updates.description || '').slice(0, 2000);
                }
                if ('subtasks' in msg.updates) {
                    todo.subtasks = normalizeSubtasks(msg.updates.subtasks);
                }
                if ('attachments' in msg.updates) {
                    todo.attachments = Array.isArray(msg.updates.attachments)
                        ? msg.updates.attachments.slice(0, 20).map(a => String(a).slice(0, 500))
                        : [];
                }
            }
            saveTodos();
            broadcast({ type: 'updated', todo });
            const tags = [];
            if (todo.priority) tags.push('[' + ({high:'高',medium:'中',low:'低'}[todo.priority]) + ']');
            if (todo.dueDate) tags.push('到期 ' + todo.dueDate);
            if (todo.subtasks && todo.subtasks.length) tags.push(todo.subtasks.length + '个子任务');
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
