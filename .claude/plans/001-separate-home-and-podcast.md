# 首页与播客转录页面分离

## 问题

当前 `src/app/page.tsx`（根路由 `/`）同时承担了「首页」和「播客转录」两个角色：
- Sidebar 中「首页」和「播客转录」都导航到 `/`
- `app-shell.tsx` 中 `pathname === '/'` 时 activePage 固定为 `'podcast'`
- 实际上没有独立的首页内容，首页就是播客转录页面

## 方案

将播客转录功能从根路由移到 `/podcast`，根路由 `/` 作为独立首页。

### 改动清单

1. **新建 `src/app/podcast/page.tsx`**
   - 将当前 `src/app/page.tsx` 的全部播客转录代码移入此文件

2. **重写 `src/app/page.tsx`（首页）**
   - 作为首页占位页面，展示欢迎信息和功能入口卡片（播客转录、转录历史等）
   - 简洁的 dashboard 风格，提供快速导航到各功能模块

3. **更新 `src/components/sidebar.tsx`**
   - `'podcast'` 菜单项导航到 `/podcast`
   - `'home'` 菜单项导航到 `/`

4. **更新 `src/components/app-shell.tsx`**
   - 增加 `pathname === '/podcast'` 或 `pathname.startsWith('/podcast')` 时设置 `activePage = 'podcast'`
   - `pathname === '/'` 时设置 `activePage = 'home'`
