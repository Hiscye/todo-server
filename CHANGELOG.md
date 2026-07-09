# 版本变更日志

## v1.9.0 - AI 对话框（与待办/资讯平级）🚀 NEW
**分支：** `v1.9.0-ai-chat`  
**基于版本：** v1.8.1（继承所有功能）  
**状态：** ✅ 待 Railway 切换分支部署

### 💬 AI 对话
- ✅ 新增「💬 聊天」Tab（第三个选项）
- ✅ 现代化聊天 UI（消息气泡、自动滚动）
- ✅ 消息流式渲染（用户右、助手左）
- ✅ 多行输入支持（Enter 发送 / Shift+Enter 换行）
- ✅ 历史记录保存到 localStorage（最多 100 条）
- ✅ 调用上下文（最近 20 条）
- ✅ 清空对话功能

### 🔧 后端改动
- 新增 `POST /api/chat` 端点
- 调用 Anthropic API（claude-haiku-4-5）
- 读取 `ANTHROPIC_API_KEY` 环境变量
- 60 秒超时
- 未配置 key 返回友好提示

### 📋 部署后配置（重要！）

1. Railway → 项目 → **Variables**
2. 添加：`ANTHROPIC_API_KEY = sk-ant-...`
3. 从 https://console.anthropic.com 获取
4. 重启服务

---

## v1.8.1 - 搜索历史可视化侧栏
**分支：** `v1.8.1-search-history`

### 📜 搜索历史
- 可视化面板（搜索时显示）
- 对象数组存储（keyword/count/lastUsed）
- 单条删除 + 一键清空
- 热门词始终显示
- 按最近使用排序

---

## v1.8.0 - 资讯搜索
**分支：** `v1.8.0-news-search`
- HN Algolia 搜索 API
- 搜索结果关键词高亮
- 热门词快捷入口

## v1.7.1 - 多源新闻
**分支：** `v1.7.0-news-tab`
- ESPN（体育）
- 中新网/人民网/头条（中文）

## v1.7.0 - 实时新闻模块

## v1.6.0 - 桌面悬浮小组件

## v1.5.0 - 数据隔离 + PWA

## v1.0.0 - 基础

---

## 📋 版本约定
- 分支命名：`v1.X.Y-功能名`
- 推送流程：切分支 → 实现 → commit → push → Railway 切分支
- 紧急回滚：Railway 切回 main 即可
