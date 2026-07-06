# 版本变更日志

## v1.5.0 - 个人模式（数据隔离）+ PWA 桌面小组件 🚀 NEW
**分支：** `v1.5.0-personal-mode`  
**状态：** ✅ 待 Railway 切换分支部署

### 🔒 数据隔离（每用户独立）
- ✅ 后端按 userId 过滤 todos，每个人只能看到自己的任务
- ✅ 强制实名：首次访问必须设置名字（自动生成 userId）
- ✅ 操作权限：只能改/删自己的任务（跨用户操作被拒绝）
- ✅ 在线用户列表：仍能看到谁在线（保留社交感）
- ✅ 「清空我的任务」按钮（只清自己的）
- ✅ 顶部用户徽章：显示当前用户

### 📲 PWA 桌面小组件
- ✅ `manifest.json`：应用清单（名称、图标、启动方式）
- ✅ `service-worker.js`：离线缓存 + 安装支持
- ✅ 紫色渐变图标（192x192 + 512x512）
- ✅ 浏览器右上角/地址栏出现「📥 安装到桌面」按钮
- ✅ Chrome / Edge 浏览器支持（双击桌面图标直接打开，独立窗口）
- ✅ 离线时仍可访问已缓存的页面

### 🔧 后端改动
- 每个 todo 加 `ownerId` 字段
- `state` 消息只返回 `ownerId === userId` 的任务
- `broadcastToOwner()` 函数（只推给特定用户）
- 在线用户追踪：userId -> { id, name, ip, since, wsSet }
- /status 显示 totalTodos + users + online 数量

### 📦 文件结构
```
public/
├── index.html       # 主应用
├── manifest.json    # PWA 清单
├── service-worker.js # 离线缓存
├── icon-192.png     # PWA 小图标
└── icon-512.png     # PWA 大图标
```

---

## v1.0.0 - 基础同步 + 截止日期 + 优先级
**分支：** `main`  
**部署地址：** https://todo-server-production-bee1.up.railway.app

---

## 📋 版本约定

### 分支命名
- 格式：`v1.X.Y-功能名`

### 推送流程
1. 切到新分支：`git checkout -b v1.5.0-personal-mode`
2. 实现功能 + 加版本注释头
3. 提交推送
4. Railway 切到该分支部署
