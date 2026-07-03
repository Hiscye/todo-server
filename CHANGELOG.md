# 版本变更日志

## v1.0.2 - 实时在线用户列表 + 后台 IP 日志 🚀 NEW
**分支：** `1.0.2-online-users`  
**基于版本：** v1.0.1  
**状态：** ✅ 待 Railway 切换分支部署

### ✨ 新增功能
- ✅ 顶部面板实时显示所有在线用户（彩色头像 + 名字）
- ✅ hover 用户卡片查看 IP 地址
- ✅ 自己显示「我」蓝色徽章
- ✅ 用户加入/离开时实时更新
- ✅ 支持同用户多端连接（如同时开手机+电脑）
- ✅ /status API 返回完整 onlineUsers 列表

### 📋 后台日志增强
- ✅ 每个用户连接/断开记录公网 IP（适配 Railway/Cloudflare 代理）
- ✅ 日志格式：`✓ 用户加入: Alice [IP: 1.2.3.4]` / `✗ 用户离开: Bob [IP: 1.2.3.4]`
- ✅ 多端连接同一个账号时正确计数

### 🔧 后端改动
- 新增 `onlineUsers` Map 追踪所有在线用户
- 新增 `getPublicIp()` 函数（兼容 X-Forwarded-For / X-Real-IP / CF-Connecting-IP）
- 新增 `registerOnline()` / `unregisterOnline()` / `broadcastOnlineList()` 函数
- 新增消息类型 `online-list`（包含完整用户列表）
- /status 接口返回 `onlineUsers` 数组

---

## v1.0.1 - 用户识别（谁添加 / 谁完成）+ 强制实名制 ✅
**分支：** `1.0.1-user-attribution`  
**基于版本：** v1.0.0  
**状态：** ✅ 待 Railway 切换分支部署

### ✨ 用户识别功能
- ✅ 用户名设置（设置弹窗里可填）
- ✅ 每个用户自动生成固定颜色头像（基于 userId 哈希）
- ✅ 任务显示「添加者」：彩色头像 + 名字 + 相对时间（"小明 · 2小时前"）
- ✅ 任务完成后切换显示「完成者」：绿色头像 + 名字 + 完成时间
- ✅ 名字未设置时显示「匿名」，首字母作为头像

### 🔒 强制实名制
- ✅ **首次访问强制弹窗** 要求填写名字，红色边框 + 「必填」标记
- ✅ **匿名用户无法添加任务**：输入框、日期、优先级全部锁定（半透明 + 禁用点击）
- ✅ **匿名用户可查看**：其他人的任务正常显示，只读模式
- ✅ 顶部红色 banner：「⚠️ 请先设置你的名字才能添加任务」+ 一键设置按钮
- ✅ 必填模式下「取消」按钮被隐藏，无法绕过
- ✅ 已设置名字后，正常使用

### 🔧 后端改动
- todo 数据结构新增字段：`createdBy` / `createdByName` / `completedBy` / `completedByName` / `completedAt`
- add 消息记录创建者
- update 消息（completed=true）记录完成者

---

## v1.0.0（稳定生产版 · Railway 当前部署）
**部署时间：** 2026-07-03  
**分支：** main  
**部署地址：** https://todo-server-production-bee1.up.railway.app

### ✨ 包含功能
- ✅ 多人实时同步（WebSocket）
- ✅ 添加 / 勾选 / 删除 / 筛选
- ✅ 数据持久化（Railway 容器）
- ✅ 截止日期 + 智能高亮（已过期 / 今天 / 即将 / 未来）
- ✅ 任务优先级（高 / 中 / 低），左侧色条 + 整行背景

---

## 📋 版本约定

### 分支命名
- 格式：`v1.0.X-功能名`（如 `v1.0.1-user-attribution`）

### 推送流程
```
1. 切到新分支：git checkout -b 1.0.1-user-attribution
2. 实现功能，加注释头
3. 提交：git add . && git commit -m "feat: ..."
4. 推送分支：git push -u origin 1.0.1-user-attribution
5. Railway 切到该分支部署（Settings → Source → Branch）
6. 测试通过后合并到 main
```

---

## 🔄 回滚方案
- 当前 Railway 部署的是 `main` 分支（v1.0.0）
- 如果新版本出问题，Railway 切回 main 即可
- 永远不会丢代码（旧版本都在 tag 里）