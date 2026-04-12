═══════════════════════════════════════════════════════════════════════════════
ADMIN DASHBOARD - COMPLETE IMPLEMENTATION STRUCTURE
═══════════════════════════════════════════════════════════════════════════════

CREATED FILE SUMMARY
═══════════════════════════════════════════════════════════════════════════════

## TYPES & CONTRACTS (Foundation Layer)
────────────────────────────────────────────────────────────────────────────

/src/types/admin.ts (COMPLETE)
├─ UserRole enum: PLAYER, DEV, ADMIN
├─ User interface: id, username, role, level, isBanned, createdAt, lastLogin
├─ UserDetailResponse: Extended user with progress, activity
├─ UserActivity: Tracks level completion, failures, logins
├─ Request types: UpdateRoleRequest, BanUserRequest, SetLevelRequest
├─ Filter types: UserFilters, PaginationParams  
├─ Toast interface: type, message, duration, id
├─ ConfirmDialogPayload: Typed confirm dialogs by type
├─ AdminStore interface: Complete store definition
└─ UsersListResponse: Paginated users list

## API & SERVICES (Integration Layer)
────────────────────────────────────────────────────────────────────────────

/src/services/adminApi.ts (COMPLETE)
├─ getUsers(page, pageSize, filters)
│  └─ GET /admin/users?page=&pageSize=&search=&role=&status=
│  └─ Returns: { users[], total, page, pageSize }
│
├─ getUserDetail(userId)
│  └─ GET /admin/users/:userId
│  └─ Returns: UserDetailResponse with activity
│
├─ changeUserRole(userId, role)
│  └─ PUT /admin/users/:userId/role
│  └─ Body: { role }
│  └─ Returns: User
│
├─ toggleUserBan(userId, isBanned)
│  └─ PUT /admin/users/:userId/ban
│  └─ Body: { isBanned }
│  └─ Returns: User
│
├─ setUserLevel(userId, level)
│  └─ PUT /admin/users/:userId/level
│  └─ Body: { level }
│  └─ Returns: User
│
├─ resetUserProgress(userId)
│  └─ POST /admin/users/:userId/reset-progress
│  └─ Returns: User
│
└─ invalidateUserSession(userId)
   └─ POST /admin/users/:userId/invalidate-session
   └─ Note: Not fully implemented yet

JWT Handling:
├─ Auto-retrieves token from localStorage
├─ Includes in Authorization header: `Bearer <token>`
├─ Error handling: Throws Error with API message
└─ All requests use fetch API directly

## STATE MANAGEMENT (Store Layer)
────────────────────────────────────────────────────────────────────────────

/src/store/adminStore.ts (COMPLETE)
├─ State Properties:
│  ├─ selectedUserId: string | null
│  ├─ filters: UserFilters
│  ├─ userDetailModalOpen: boolean
│  ├─ levelControlModalOpen: boolean
│  ├─ confirmDialogOpen: boolean
│  ├─ loadingActions: Record<string, boolean>
│  ├─ toast: Toast | null
│  └─ confirmDialog: ConfirmDialogPayload | null
│
├─ Modal Actions (8 methods):
│  ├─ openUserDetailModal / closeUserDetailModal
│  ├─ openLevelControlModal / closeLevelControlModal
│  ├─ openUserModal / openRoleModal / openLevelModal
│  └─ openConfirmDialog / closeConfirmDialog
│
├─ Critical Actions (5 methods):
│  ├─ confirmResetProgress(userId)
│  ├─ confirmToggleBan(userId, isBanned)
│  └─ setSelectedUser / setFilters
│
├─ Toast Management (2 methods):
│  ├─ showToast(type, message, duration)
│  │  └─ Auto-clears after duration using setTimeout
│  └─ clearToast()
│
└─ Loading Management (2 methods):
   ├─ setActionLoading(action, loading)
   └─ isActionLoading(action): boolean

Zustand Configuration:
├─ Single create() call with reducer pattern
├─ get/set destructuring for complex operations
├─ Auto toast-clearing with setTimeout
└─ Loading tracked per action key (e.g., 'change_role_user-123')

## REACT QUERY (Data Fetching Layer)
────────────────────────────────────────────────────────────────────────────

/src/hooks/useAdminQueries.ts (COMPLETE)
├─ Query Hooks (2):
│  ├─ useAdminUsers(page, pageSize, filters)
│  │  ├─ staleTime: 30s
│  │  ├─ cacheTime: 5m
│  │  ├─ retry: 1
│  │  ├─ keepPreviousData: true
│  │  └─ Returns: { data, isLoading, error }
│  │
│  └─ useAdminUserDetail(userId | null)
│     ├─ enabled: !!userId
│     ├─ staleTime: 30s
│     └─ Returns: { data, isLoading, error }
│
└─ Mutation Hooks (6):
   ├─ useChangeUserRoleMutation()
   │  ├─ onSuccess: invalidateQueries('admin_users')
   │  └─ Returns: { mutate, isLoading, error }
   │
   ├─ useToggleUserBanMutation()
   ├─ useSetUserLevelMutation()
   ├─ useResetUserProgressMutation()
   ├─ useInvalidateUserSessionMutation()
   └─ All invalidate queries on success

Query Key Structure:
├─ 'admin_users': Base key for users list
├─ ['admin_users', page, pageSize, filters]: Specific query
├─ 'admin_user_detail': Base key for detail
└─ ['admin_user_detail', userId]: Specific user detail

## UI COMPONENTS - Primitives (Component Layer)
────────────────────────────────────────────────────────────────────────────

/src/components/ui/Button.tsx
├─ Props: variant, size, isLoading, disabled, children
├─ Variants: primary, secondary, danger, success
├─ Sizes: sm, md, lg
├─ Shows "Loading..." when isLoading=true
└─ Type: Base component for all buttons

/src/components/ui/Badge.tsx
├─ Props: variant, children
├─ Variants: default, role, status, banned
└─ Variants use colors for semantic meaning

/src/components/ui/Modal.tsx
├─ Props: isOpen, onClose, title, children, footer, size
├─ Sizes: sm, md, lg
├─ Click outside to close? No (improved UX)
└─ Footer slot for action buttons

/src/components/ui/Input.tsx
├─ Props: label, error, helperText, standard HTML attrs
├─ Validation: Shows error message in red
├─ HelperText: Gray subtext for guidance
└─ Disabled state: Gray background

/src/components/ui/Checkbox.tsx
├─ Props: label, standard HTML attrs
├─ Styled radio button look
└─ Label clickable

/src/components/ui/Dropdown.tsx
├─ Props: options, onSelect, triggerLabel
├─ Click outside detection to close
├─ Options: { label, value, color? }
└─ No default close-on-click (menu stays open)

/src/components/ui/Toast.tsx
├─ Props: message, type, onClose, duration
├─ Types: success, error, info, warning
├─ Auto-closes after duration
├─ Positioned: bottom-right, z-50
└─ Manual close button included

/src/components/ui/ConfirmDialog.tsx
├─ Props: isOpen, title, description, confirmLabel, cancelLabel, isDangerous, isLoading, onConfirm, onCancel
├─ Wraps Modal component
├─ Dangerous actions: Red confirm button
└─ Returns: Buttons footer

/src/components/ui/Pagination.tsx
├─ Props: currentPage, totalPages, onPageChange, isLoading
├─ Shows: [Prev Button] [Page Numbers] [Next Button]
├─ Ellipsis: Shows ... when pages skipped
└─ Smart: Only shows up to 5 page buttons

## UI COMPONENTS - Admin Specific (Feature Layer)
────────────────────────────────────────────────────────────────────────────

/src/components/admin/AdminLayout.tsx (WRAPPER)
├─ Props: children, currentPage, onNavigation
├─ Sidebar:
│  ├─ Collapsible (narrows to icons)
│  ├─ Menu: Users | Levels | Dev Tools
│  ├─ Current page highlighted in blue
│  └─ Back to Game button
├─ Main content area
└─ Full height responsive layout

/src/components/admin/UserTable.tsx
├─ Props: page, pageSize, filters, onPageChange, onUserSelect
├─ Query: useAdminUsers(page, pageSize, filters)
├─ Displays:
│  ├─ Username (clickable)
│  ├─ Role badge
│  ├─ Level
│  ├─ Status badge (Active/Banned)
│  └─ Action dropdown
├─ Rows: UserRow component
├─ Pagination: Pagination component
└─ States: loading, error, empty

/src/components/admin/UserRow.tsx
├─ Props: user, onSelect
├─ Displays single user row
├─ Colors:
│  ├─ PLAYER: Gray
│  ├─ DEV: Yellow
│  └─ ADMIN: Red
├─ Status: Green (Active) / Red (Banned)
└─ Action button: ActionDropdown

/src/components/admin/ActionDropdown.tsx
├─ Props: userId, user
├─ Options:
│  ├─ 👁️ View Details → openUserModal
│  ├─ 🎯 Change Role → openRoleModal
│  ├─ 📊 Set Level → openLevelModal
│  ├─ 🔄 Reset Progress → confirmResetProgress
│  └─ ⛔ Ban / ✅ Unban → confirmToggleBan
└─ Uses store to trigger actions

/src/components/admin/UserDetailModal.tsx
├─ Props: None (reads from store)
├─ Query: useAdminUserDetail(selectedUserId)
├─ Displays:
│  ├─ Grid: Username, Role, Level, Status, Created, Last Login
│  ├─ Progress bar and percentage
│  ├─ Recent activity list (scrollable)
│  └─ Close button
└─ Loading state while fetching

/src/components/admin/LevelControlModal.tsx
├─ Props: None (reads from store)
├─ Input: Number field (1-100)
├─ Quick buttons: Reset to 1, Set to 20, Halfway (50)
├─ Validation: Must be 1-100
├─ Mutation: useSetUserLevelMutation()
├─ On success: Modal closes, toast shows
└─ On error: Toast shows error, modal stays open

/src/components/admin/RoleChangeModal.tsx
├─ Props: None (reads from store)
├─ Radio buttons: PLAYER | DEV | ADMIN
├─ Descriptions: Brief role explanations
├─ Mutation: useChangeUserRoleMutation()
└─ Closes on success

/src/components/admin/ConfirmActionDialog.tsx
├─ Props: None (reads from store)
├─ Handles:
│  ├─ confirmDialog.type === 'reset_progress'
│  ├─ confirmDialog.type === 'toggle_ban'
│  └─ Uses appropriate mutation
├─ Triggers mutations on confirm
└─ Toast messages on success/error

## PAGES (Screen Layer)
────────────────────────────────────────────────────────────────────────────

/src/pages/AdminDashboard.tsx (MAIN WRAPPER)
├─ Props: onBack callback
├─ State: currentPage ('users' | 'levels' | 'devtools')
├─ Navigation:
│  ├─ Users / Levels / Dev Tools → Switch pages
│  └─ Game → onBack()
├─ Renders:
│  ├─ AdminLayout
│  └─ Current page component
└─ Integrated: All modals included

/src/pages/UsersPage.tsx
├─ Header: Title and description
├─ Search input: Updates filters.search
├─ Filters:
│  ├─ Role dropdown: ALL | PLAYER | DEV | ADMIN
│  └─ Status dropdown: all | active | banned
├─ UserTable: With pagination
├─ Modals:
│  ├─ UserDetailModal
│  ├─ LevelControlModal
│  ├─ RoleChangeModal
│  └─ ConfirmActionDialog
└─ Integration: All modals work together

/src/pages/LevelControlPage.tsx
├─ Level selector: Grid of 1-50 buttons
├─ Level details:
│  ├─ Name input
│  ├─ Difficulty select: easy | medium | hard
│  ├─ Buttons: Reset, Save, Delete
│  └─ Statistics: Players completed, Avg time, Completion %
└─ Placeholder for future implementation

/src/pages/DevToolsPage.tsx
├─ Quick actions:
│  ├─ Database: Backup, Export, Clear Cache
│  └─ Server: Logs, Stats, Restart
├─ Developer console:
│  ├─ Command input
│  ├─ Output display (scrollable)
│  └─ Execute button
├─ Command examples: help, clear, server-status, reset-all
└─ Settings: Toggle debug mode, verbose logging, performance monitoring

## INTEGRATION POINTS
────────────────────────────────────────────────────────────────────────────

App.tsx UPDATED
├─ New state: currentPage ('auth' | 'game' | 'admin')
├─ Checks user.role for admin access (ADMIN or DEV)
├─ Routes:
│  ├─ No user → AuthPage
│  ├─ User logged → GamePage
│  ├─ currentPage='admin' → AdminDashboard
│  └─ User not admin → Can't access admin
└─ Callbacks:
   ├─ handleAccessAdmin() → setCurrentPage('admin')
   └─ handleBackFromAdmin() → setCurrentPage('game')

GamePage UPDATED
├─ New prop: onAdmin? callback
├─ New button: "⚙️ ADMIN" (top-right if user is admin)
├─ Positioned above game canvas (z-index: 100)
├─ Calls onAdmin() when clicked
└─ Not shown to regular players

## DEPENDENCY REQUIREMENTS
────────────────────────────────────────────────────────────────────────────

Already Installed (package.json exists):
├─ react: ^18.3.1
├─ react-dom: ^18.3.1
└─ typescript: ^5.6.3

Must Install (npm install):
├─ zustand@^4.4.0 (State management)
├─ react-query@^3.39.3 (Data fetching) OR @tanstack/react-query@^4.0.0
└─ tailwind@^3.3.0 OR already configured (CSS styling assumed)

Installation:
```bash
npm install zustand react-query tailwindcss
# OR use npm install zustand @tanstack/react-query tailwindcss
```

## STYLING ASSUMPTIONS
────────────────────────────────────────────────────────────────────────────

All components use Tailwind CSS classNames:
├─ Colors: bg-blue-600, text-gray-900, border-gray-200
├─ Spacing: p-6, px-4, py-2, gap-3, mt-2, mb-4
├─ Sizing: w-full, h-2, px-4 py-3
├─ Effects: hover:bg-gray-100, transition-colors, shadow-lg
├─ Layout: grid, flex, absolute, fixed, relative, z-50
└─ States: disabled:opacity-50, focus:ring-2, focus:outline-none

If Tailwind not configured: Convert all className to CSS modules or inline styles.

## FOLDER STRUCTURE CREATED
────────────────────────────────────────────────────────────────────────────

/src/
├─ types/
│  └─ admin.ts ✓
│
├─ services/
│  ├─ api.ts (UPDATED with JWT)
│  └─ adminApi.ts ✓
│
├─ store/
│  └─ adminStore.ts ✓
│
├─ hooks/
│  └─ useAdminQueries.ts ✓
│
├─ components/
│  ├─ ui/
│  │  ├─ Button.tsx ✓
│  │  ├─ Badge.tsx ✓
│  │  ├─ Modal.tsx ✓
│  │  ├─ Input.tsx ✓
│  │  ├─ Checkbox.tsx ✓
│  │  ├─ Dropdown.tsx ✓
│  │  ├─ Toast.tsx ✓
│  │  ├─ ConfirmDialog.tsx ✓
│  │  └─ Pagination.tsx ✓
│  │
│  └─ admin/
│     ├─ AdminLayout.tsx ✓
│     ├─ UserTable.tsx ✓
│     ├─ UserRow.tsx ✓
│     ├─ ActionDropdown.tsx ✓
│     ├─ UserDetailModal.tsx ✓
│     ├─ LevelControlModal.tsx ✓
│     ├─ RoleChangeModal.tsx ✓
│     └─ ConfirmActionDialog.tsx ✓
│
├─ pages/
│  ├─ AdminDashboard.tsx ✓
│  ├─ UsersPage.tsx ✓
│  ├─ LevelControlPage.tsx ✓
│  ├─ DevToolsPage.tsx ✓
│  ├─ GamePage.tsx (UPDATED)
│  └─ AuthPage.tsx
│
├─ App.tsx (UPDATED)
└─ main.tsx

═════════════════════════════════════════════════════════════════════════════════
IMPLEMENTATION PATH
═════════════════════════════════════════════════════════════════════════════════

1. Install dependencies:
   npm install zustand react-query tailwindcss

2. Verify Tailwind CSS is configured in project

3. Verify all created files have correct imports

4. Start dev server:
   npm run dev

5. Navigate to:
   - Game page (as ADMIN or DEV user)
   - Click "⚙️ ADMIN" button
   - Explore admin dashboard

6. Test flows according to ADMIN_DASHBOARD_UX_FLOWS.md

═════════════════════════════════════════════════════════════════════════════════

COMPLETE IMPLEMENTATION BLUEPRINT DELIVERED.

All files created and integrated.
Ready for final testing and deployment.

═════════════════════════════════════════════════════════════════════════════════
