# 版本变更日志

## v1.7.0 - 实时新闻模块（与待办平级 Tab）🚀 NEW
**分支：** `v1.7.0-news-tab`  
**基于版本：** v1.6.0（继承所有功能）  
**状态：** ✅ 待 Railway 切换分支部署

### 📰 实时新闻
- ✅ 新增「资讯」Tab（与「待办」平级）
- ✅ 顶部 Tab 切换：📋 待办 / 📰 资讯
- ✅ Tab 显示数量徽章

### 🔌 数据源
- ✅ **Hacker News**（内置推荐，🟠 无需 key）
  - 30 条热门/最新
  - 真实时（HN API 即时更新）
  - 含分数、评论数、作者、时间
- ✅ **NewsAPI**（可选，需在环境变量配置 `NEWS_API_KEY`）
  - 支持多种分类：business / tech / health / sports 等
  - 缓存 5 分钟
- ✅ **全部源** 聚合展示

### 🎨 新闻 UI
- ✅ 卡片式列表（带排名 1/2/3 高亮）
- ✅ 来源徽章（HN 🟠、NewsAPI 📰）
- ✅ hover 整卡可点
- ✅ 标题 + 来源 + 作者 + 时间 + 分数 + 评论数
- ✅ 点击外链跳转到原文
- ✅ 刷新按钮（旋转动画）
- ✅ 来源/分类切换器

### 🔧 后端改动
- 新增 `cacheGet()` / `cacheSet()` 函数（5 分钟缓存）
- 新增 `fetchHackerNews()` 函数（抓取 HN 热门/最新）
- 新增 `fetchNewsAPI()` 函数（带 key 调用 NewsAPI）
- 新增 `fetchNews()` 路由函数（按 source + category）
- 新增 `/api/news?source=...&category=...` HTTP 端点
- 新增环境变量 `NEWS_API_KEY`（可选）

---

## v1.6.0 - 桌面悬浮小组件
**分支：** `v1.6.0-floating-widget`  
**状态：** ✅ 已完成

### 🪟 桌面小组件
- widget.html 极简小组件（340×520 弹窗）
- 主应用顶部 📌 按钮（弹窗定位右下角）
- 快速勾选 / 删除 / 添加
- 显示前 10 条任务（按优先级 + 截止排序）

---

## v1.5.0 - 数据隔离 + PWA

## v1.0.0 - 基础

---

## 📋 版本约定
- 分支命名：`v1.X.Y-功能名`
- 推送流程：checkout 新分支 → 实现 → commit → push → Railway 切分支
