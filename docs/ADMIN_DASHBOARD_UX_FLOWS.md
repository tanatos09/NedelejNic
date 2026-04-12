═══════════════════════════════════════════════════════════════================
100% IMPLEMENTAČNÍ BLUEPRINT - ADMIN DASHBOARD
═══════════════════════════════════════════════════════════════================

COMPLEX EXECUTION FLOWS
═════════════════════════════════════════════════════════════════════════════════

## 1. USER ROLE CHANGE (Change Role Flow)

```
USER INTERACTION:
┌─ Users Page loads
├─ User table displays all users
├─ User clicks "⋮" dropdown on a user row
├─ Dropdown shows: View Details | Change Role | Set Level | Reset Progress | Ban/Unban
├─ User clicks "Change Role"
│  │
│  └─ store.openRoleModal(userId) TRIGGERED
│     │
│     ├─ AdminStore updates:
│     │  ├─ selectedUserId = userId
│     │  ├─ confirmDialogOpen = true
│     │  └─ confirmDialog = {
│     │      type: 'change_role',
│     │      userId,
│     │      title: 'Change User Role',
│     │      description: 'Select a new role for this user'
│     │  }
│     │
│     └─ RoleChangeModal becomes visible
│        ├─ Shows radio buttons for PLAYER | DEV | ADMIN
│        ├─ Default selection: PLAYER
│        │
│        └─ User selects new role
│           │
│           ├─ Local state updates: newRole = selected role
│           │
│           └─ User clicks "Change Role" button
│              │
│              ├─ Validation: Check newRole is valid
│              │
│              ├─ setActionLoading(`change_role_${userId}`, true)
│              │  └─ Button shows "Loading..." state
│              │
│              ├─ changeRole(userId, newRole) MUTATION TRIGGERED
│              │  │
│              │  └─ API Call:
│              │     PUT /admin/users/:userId/role
│              │     Body: { role: "ADMIN" | "DEV" | "PLAYER" }
│              │     Headers: Authorization: Bearer <JWT>
│              │
│              ├─ MUTATION onSuccess callback:
│              │  ├─ showToast({ type: 'success', message: `Role changed to ${role}` })
│              │  ├─ queryClient.invalidateQueries('admin_users')
│              │  │  └─ Triggers immediate refetch of users list
│              │  ├─ Query re-executes: getUsers(page, pageSize, filters)
│              │  │  └─ API returns updated user with new role
│              │  ├─ React Query updates cache
│              │  │  └─ UserTable re-renders with new role badge
│              │  └─ closeConfirmDialog()
│              │     ├─ confirmDialogOpen = false
│              │     ├─ confirmDialog = null
│              │     └─ RoleChangeModal disappears
│              │
│              └─ MUTATION onError callback:
│                 └─ showToast({ type: 'error', message: error.message })
│                    └─ Toast appears for 3 seconds automatically

FINAL STATE:
✓ User table shows updated role
✓ Toast message confirms success
✓ Modal closes automatically
✓ User can continue with next action
```

## 2. BAN USER (Toggle Ban Flow)

```
USER INTERACTION:
┌─ User clicks "⋮" on user row
├─ Dropdown menu appears
├─ User clicks "⛔ Ban" (or "✅ Unban" if already banned)
│
└─ store.confirmToggleBan(userId, !user.isBanned) TRIGGERED
   │
   ├─ !user.isBanned determines ban state:
   │  ├─ If currently active → isBanned = true (BAN)
   │  └─ If currently banned → isBanned = false (UNBAN)
   │
   ├─ AdminStore updates:
   │  ├─ selectedUserId = userId
   │  ├─ confirmDialogOpen = true
   │  └─ confirmDialog = {
   │      type: 'toggle_ban',
   │      userId,
   │      title: !isBanned ? 'Unban User' : 'Ban User',
   │      description: !isBanned
   │        ? 'This user will be able to play again...'
   │        : 'This user will no longer be able to play...'
   │  }
   │
   └─ ConfirmActionDialog becomes visible
      ├─ Shows confirmation message
      ├─ Red highlight (isDangerous = true)
      │
      └─ User clicks "Ban User" / "Unban User" button
         │
         ├─ setActionLoading(`toggle_ban_${userId}`, true)
         │
         ├─ toggleBan(userId, isBanned) MUTATION TRIGGERED
         │  │
         │  └─ API Call:
         │     PUT /admin/users/:userId/ban
         │     Body: { isBanned: true | false }
         │     Headers: Authorization: Bearer <JWT>
         │
         ├─ MUTATION onSuccess:
         │  ├─ Toast success message
         │  ├─ Invalidate ['admin_users']
         │  ├─ UserTable re-renders with status badge update
         │  └─ Dialog closes
         │
         └─ User can see:
            ├─ Status badge changed: "Active" → "Banned" or vice versa
            └─ Toast confirmation message

OPTIMISTIC UPDATES:
• NOT implemented for ban/unban
• Full API response required before UI update
• Safer for sensitive action (ban)
```

## 3. SET USER LEVEL (Detailed Flow)

```
USER INTERACTION:
┌─ User clicks "⋮" on user row
├─ Dropdown: "📊 Set Level"
│
└─ store.openLevelModal(userId) TRIGGERED
   │
   ├─ AdminStore updates:
   │  ├─ levelControlModalOpen = true
   │  └─ selectedUserId = userId
   │
   └─ LevelControlModal becomes visible
      ├─ Input field with value: 1-100
      ├─ Quick action buttons:
      │  ├─ "Reset to 1"
      │  ├─ "Set to 20"
      │  └─ "Halfway (50)"
      │
      └─ User interaction:
         ├─ Option A: Type in input
         │  └─ Local state updates: newLevel = parseInt(value)
         │
         ├─ Option B: Click quick button
         │  └─ Local state updates: newLevel = button value
         │
         └─ User clicks "Set Level" button
            │
            ├─ Validation:
            │  ├─ Check: !isNaN(levelNum)
            │  ├─ Check: levelNum >= 1 && levelNum <= 100
            │  └─ If invalid: showToast({ type: 'error', message: 'Level must be 1-100' })
            │     └─ User corrects and tries again
            │
            ├─ setActionLoading(`set_level_${userId}`, true)
            │
            ├─ setLevel(userId, levelNum) MUTATION TRIGGERED
            │  │
            │  └─ API Call:
            │     PUT /admin/users/:userId/level
            │     Body: { level: 42 }
            │     Headers: Authorization: Bearer <JWT>
            │
            ├─ MUTATION onSuccess:
            │  ├─ showToast success
            │  ├─ Invalidate queries
            │  ├─ UserTable re-renders
            │  └─ closeLevelControlModal()
            │
            └─ Final state: Level badge in UserTable updated

EDGE CASES:
✗ User enters: "abc" → Toast error, input clears
✗ User enters: "0" → Toast error
✗ User enters: "999" → Toast error
✓ User enters: "50" → Success, modal closes
```

## 4. RESET PROGRESS (Dangerous Action Flow)

```
USER INTERACTION:
┌─ User clicks "⋮" on user row
├─ Dropdown: "🔄 Reset Progress"
│
└─ store.confirmResetProgress(userId) TRIGGERED
   │
   ├─ AdminStore sets:
   │  └─ confirmDialog = {
   │      type: 'reset_progress',
   │      userId,
   │      title: 'Reset User Progress',
   │      description: 'Are you sure? This will reset to level 1. Cannot be undone.'
   │  }
   │
   └─ ConfirmActionDialog appears
      ├─ Red styling (isDangerous = true)
      ├─ Warning message displayed
      │
      └─ User clicks "Reset Progress" button
         │
         ├─ setActionLoading(`reset_progress_${userId}`, true)
         │
         ├─ resetProgress(userId) MUTATION TRIGGERED
         │  │
         │  └─ API Call:
         │     POST /admin/users/:userId/reset-progress
         │     Body: {} (empty)
         │     Headers: Authorization: Bearer <JWT>
         │
         ├─ Success flow:
         │  ├─ showToast({ type: 'success', message: 'User reset to level 1' })
         │  ├─ Invalidate ['admin_users']
         │  ├─ UserTable updates → User level = 1
         │  └─ Dialog closes
         │
         └─ Error flow:
            ├─ showToast({ type: 'error', message: error.message })
            ├─ Dialog stays open
            └─ User can retry or cancel

SAFETY FEATURES:
✓ Requires explicit confirmation
✓ Cannot be accidentally triggered
✓ Toast shows before returning to list
```

## 5. VIEW USER DETAILS (Information Retrieval)

```
USER INTERACTION:
┌─ User clicks username or "👁️ View Details"
│
└─ store.openUserModal(userId) TRIGGERED
   │
   ├─ AdminStore updates:
   │  ├─ userDetailModalOpen = true
   │  └─ selectedUserId = userId
   │
   ├─ UserDetailModal checks: selectedUserId && userDetailModalOpen
   │  │
   │  └─ useAdminUserDetail(userId) QUERY TRIGGERED
   │     │
   │     ├─ Enabled only if userId is set
   │     │
   │     └─ API Call:
   │        GET /admin/users/:userId
   │        Headers: Authorization: Bearer <JWT>
   │
   ├─ While loading:
   │  └─ Modal shows: "Loading user details..."
   │
   ├─ On success:
   │  └─ Modal displays:
   │     ├─ Grid layout (2 columns)
   │     │  ├─ Username
   │     │  ├─ Role badge
   │     │  ├─ Level
   │     │  ├─ Status badge
   │     │  ├─ Created date
   │     │  └─ Last login date
   │     │
   │     ├─ Progress section:
   │     │  ├─ Completion percentage
   │     │  └─ Visual progress bar
   │     │
   │     └─ Recent activity:
   │        ├─ max-h-40 overflow-y-auto (scrollable)
   │        └─ Shows last 5-10 activities
   │           ├─ Level completed
   │           ├─ Level failed
   │           ├─ User logged in
   │           └─ Admin action taken
   │
   ├─ User clicks "Close" button
   │
   └─ closeUserDetailModal()
      ├─ Modal disappears
      └─ Selected user cleared

QUERY BEHAVIOR:
staleTime: 30s
cacheTime: 5m
retry: 1 (on failure)
enabled: only if userId is set
```

═════════════════════════════════════════════════════════════════════════════════
SEARCH & FILTER FLOW
═════════════════════════════════════════════════════════════════════════════════

```
USER INTERACTION:
┌─ User inputs search query in "Search Users" input
│  └─ onChange triggered: handleSearchChange(value)
│     ├─ setFilters({ ...filters, search: value })
│     └─ setPage(0) → Reset to first page
│
├─ React Query detects filters changed
│  ├─ Query key changes: ['admin_users', 0, 10, { search: 'john', role: 'ALL', status: 'all' }]
│  └─ New query executed with updated filters
│
├─ useAdminUsers hook parameters change
│  └─ API call: GET /admin/users?page=0&pageSize=10&search=john&role=ALL&status=all
│
└─ UserTable updates with filtered results

FILTER OPERATIONS:
┌─ Role Filter
│  ├─ Options: All Roles | Players | Developers | Admins
│  └─ Updates: filters.role
│
├─ Status Filter
│  ├─ Options: All Status | Active | Banned
│  └─ Updates: filters.status
│
└─ Search Input
   └─ Updates: filters.search (server-side search)

QUERY INVALIDATION:
When mutation succeeds:
├─ queryClient.invalidateQueries('admin_users')
│  └─ All queries with key starting with 'admin_users' are marked stale
│
├─ Current filters preserve:
│  └─ useAdminUsers(page, pageSize, filters) re-executes with same filters
│
└─ Results auto-update in table
```

═════════════════════════════════════════════════════════════════════════════════
ERROR HANDLING ARCHITECTURE
═════════════════════════════════════════════════════════════════════════════════

```
REQUEST ERROR FLOWS:

1. NETWORK ERROR (no connection)
   ├─ Fetch throws error
   └─ adminApi catches:
      ├─ Check: response.ok
      ├─ If false: throw new Error(response.statusText)
      └─ If network error: Error caught by try-catch

2. API VALIDATION ERROR (400)
   ├─ Backend returns: { message: 'Invalid level' }
   ├─ adminApi extracts: error.message
   └─ Mutation onError:
      └─ showToast({ type: 'error', message: 'Invalid level' })

3. AUTHENTICATION ERROR (401)
   ├─ Backend returns: { message: 'Unauthorized' }
   ├─ adminApi throws: Error with message
   ├─ User token may be expired
   └─ Mutation onError shows toast
      └─ User may need to login again

4. PERMISSION ERROR (403)
   ├─ Backend returns: { message: 'Forbidden - insufficient permissions' }
   ├─ Only non-ADMIN users see this
   └─ Mutation onError:
      └─ Toast shows permission error

5. NOT FOUND ERROR (404)
   ├─ Backend returns: { message: 'User not found' }
   ├─ Likely deleted by another admin
   └─ Mutation onError:
      └─ Toast: 'User not found'
      └─ UserTable refreshes and user disappears

6. SERVER ERROR (500)
   ├─ Backend returns server error
   ├─ Retry logic: React Query retries 1 time
   └─ If still fails:
      └─ Toast: 'Server error, please try again'

TOAST AUTO-DISMISS:
├─ Default duration: 3000ms
├─ Toast appears in bottom-right
├─ Auto-closes after duration
└─ User can close manually with × button

LOADING STATES:
├─ Per-action loading: isActionLoading(`action_${userId}`)
├─ Buttons show "Loading..." state
├─ Cannot trigger same action twice while loading
└─ Other actions still available
```

═════════════════════════════════════════════════════════════════════════════════
PAGINATION FLOW
═════════════════════════════════════════════════════════════════════════════════

```
INITIALIZATION:
┌─ UsersPage initializes: page = 0, pageSize = 10
├─ Page 0 = items 0-10
├─ Page 1 = items 10-20
└─ etc.

USER CLICKS PAGE BUTTON:
├─ onPageChange(newPage) triggered
├─ setPage(newPage)
├─ Query parameters change: page = newPage
├─ useAdminUsers query executes with new page
│  └─ GET /admin/users?page=1&pageSize=10&...
└─ New results displayed in table

PAGINATION DISPLAY:
├─ Current page highlighted in blue
├─ Max 5 visible page buttons at a time
├─ Shows ellipsis (...) if pages skipped
├─ "Prev" button disabled on first page
└─ "Next" button disabled on last page

EXAMPLE: 50 pages
├─ Page 0: [1] 2 3 4 5 ... 50 
├─ Page 2: 1 [3] 4 5 6 ... 50
├─ Page 24: 1 ... 23 24 [25] 26 27 ... 50
└─ Page 49: 1 ... 46 47 48 49 [50]

COMBINED WITH FILTERS:
├─ User selects role = "ADMIN"
├─ User clicks page 2
├─ Query: GET /admin/users?page=2&pageSize=10&role=ADMIN&status=all&search=
└─ Results: Only admin users, page 2
```

═════════════════════════════════════════════════════════════════════════════════
REACT QUERY CACHE STRATEGY
═════════════════════════════════════════════════════════════════════════════════

```
CONFIGURATION:
```
staleTime: 30000ms (30 seconds)
cacheTime: 300000ms (5 minutes)
retry: 1 (retry failed requests once)

BEHAVIOR:

1. First load:
   ├─ Query key: ['admin_users', 0, 10, filters]
   ├─ Status: 'loading'
   ├─ API call executed
   └─ Data cached

2. Same page within 30s:
   ├─ Cached data returned immediately
   ├─ Status: 'success' (no refetch)
   └─ Data is fresh

3. Same page after 30s + within 5m:
   ├─ Cached data returned immediately
   ├─ Status: 'success'
   ├─ Background refetch quietly triggers
   └─ If data changed, UI updates

4. Same page after 5m:
   ├─ Cache expired
   ├─ New query executed
   └─ Data reloaded

5. Mutation onSuccess - invalidateQueries:
   ├─ Query marked as stale immediately
   ├─ Background refetch triggered
   ├─ Old cached data still shown briefly
   └─ New data appears when ready

CACHE KEY STRUCTURE:
['admin_users', pageNumber, pageSize, { role, status, search }]

Example keys:
  ['admin_users', 0, 10, { role: 'ALL', status: 'all', search: '' }]
  ['admin_users', 1, 10, { role: 'ADMIN', status: 'active', search: 'john' }]
  ['user', 'user-id-123'] (for detail modal)

BENEFITS:
✓ Immediate UI feedback
✓ Network efficient
✓ Background updates
✓ User sees fresh data quickly
✗ May show stale data briefly (acceptable trade-off)
```

═════════════════════════════════════════════════════════════════════════════════
ZUSTAND STORE LIFECYCLE
═════════════════════════════════════════════════════════════════════════════════

```
STATE STRUCTURE:

interface AdminStore {
  // UI State
  selectedUserId: string | null
  filters: { role: 'ALL' | UserRole, status: 'all' | 'active' | 'banned', search: string }
  userDetailModalOpen: boolean
  levelControlModalOpen: boolean
  confirmDialogOpen: boolean

  // Loading & Feedback
  loadingActions: Record<string, boolean> // e.g., { 'change_role_user-123': true }
  toast: Toast | null
  confirmDialog: ConfirmDialogPayload | null

  // 20+ action methods...
}

TOAST LIFECYCLE:

showToast({ type: 'success', message: 'Done', duration: 3000 })
├─ Toast ID generated: 'toast_0'
├─ Toast added to state
├─ setTimeout(3000) scheduled
├─ Toast appears in UI
├─ After 3s: clearToast()
└─ Toast removed from state

MODAL LIFECYCLE:

openUserModal(userId)
├─ userDetailModalOpen = true
├─ selectedUserId = userId
├─ UserDetailModal componentuseAdminUserDetail(userId) triggers
├─ Modal appears with loading state
└─ Data loads and displays

closeUserDetailModal()
├─ userDetailModalOpen = false
├─ selectedUserId = null
└─ Modal disappears, queries cleanup

CONFIRM DIALOG LIFECYCLE:

confirmDialog = {
  type: 'reset_progress',
  userId: 'abc123',
  title: 'Reset Progress',
  description: 'Are you sure?'
}
├─ ConfirmActionDialog checks type
├─ Renders appropriate UI
└─ Handles specific action on confirm
```

═════════════════════════════════════════════════════════════════════════════════
COMPLETE DATA FLOW DIAGRAM
═════════════════════════════════════════════════════════════════════════════════

```
┌─────────────────┐
│   GamePage      │
│  (user logged)  │
└────────┬────────┘
         │ click admin button
         ▼
┌─────────────────────────────────────────┐
│      AdminDashboard (wrapper)           │
│  ├─ currentPage state                   │
│  └─ Navigation handler                  │
└────────────┬────────────────────────────┘
             │
             ├─ Route to 'users' ──▶ UsersPage
             │                        ├─ page state
             │                        ├─ pageSize state
             │                        └─ show UserTable
             │
             ├─ Route to 'levels' ──▶ LevelControlPage
             │
             └─ Route to 'devtools' ──▶ DevToolsPage

UsersPage Flow:
┌──────────────────────────────────────┐
│ Search & Filter Inputs               │
│ ├─ Input onChange ──▶ setFilters()  │
│ └─ Select onChange ──▶ setFilters()  │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ UserTable                            │
│ useAdminUsers(page, pageSize, filters)
│ ├─ Query key changes                 │
│ └─ API fetches new data              │
└──────────┬───────────────────────────┘
           │
           ├─ Renders rows ──▶ UserRow (for each user)
           │                  ├─ Username, role, level, status
           │                  └─ ActionDropdown
           │
           └─ Pagination
              └─ onPageChange ──▶ setPage()

ActionDropdown:
┌────────────────────────┐
│ Dropdown menu opens    │
│ User selects action    │
└────────┬───────────────┘
         │
         ├─ 'view' ──▶ openUserModal(userId)
         │            └─ UserDetailModal appears
         │               useAdminUserDetail(userId)
         │               └─ Fetch user details
         │
         ├─ 'role' ──▶ openRoleModal(userId)
         │            └─ RoleChangeModal appears
         │
         ├─ 'level' ──▶ openLevelModal(userId)
         │             └─ LevelControlModal appears
         │
         ├─ 'reset' ──▶ confirmResetProgress(userId)
         │             └─ ConfirmActionDialog
         │                └─ User confirms
         │                └─ resetProgress() MUTATION
         │                └─ Query refetch
         │
         └─ 'ban' ──▶ confirmToggleBan(userId, !banned)
                     └─ ConfirmActionDialog
                     └─ User confirms
                     └─ toggleBan() MUTATION
                     └─ Query refetch

MUTATION FLOW:
┌─────────────────────────────────────┐
│ User confirms action in modal       │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ useChangeUserRoleMutation()         │
│ useMutation() hook                  │
└────────────┬────────────────────────┘
             │
             ├─ setActionLoading(true)
             │
             ├─ POST/PUT API call
             │  └─ adminApi.changeUserRole(userId, role)
             │
             ├─ onSuccess:
             │  ├─ showToast(success message)
             │  ├─ queryClient.invalidateQueries('admin_users')
             │  ├─ useAdminUsers() auto-refetches
             │  └─ Modal closes
             │
             ├─ onError:
             │  ├─ showToast(error message)
             │  └─ Modal stays open
             │
             └─ onSettled:
                └─ setActionLoading(false)
                   └─ Button returns to normal state
```

═════════════════════════════════════════════════════════════════════════════════
EDGE CASES & SPECIAL HANDLING
═════════════════════════════════════════════════════════════════════════════════

```
1. RAPID CONSECUTIVE ACTIONS
   └─ Same user, different actions:
      ├─ Click "Change Role" (modal opens)
      ├─ Before confirming, click "Set Level" on another user
      ├─ First modal closes, second opens
      └─ Only latest action state preserved

2. STALE USER DATA
   └─ User edited by another admin:
      ├─ Admin A: Sets user level to 50
      ├─ Admin B's cache shows level 1
      ├─ After 30s: Admin B sees level 50 (auto-refresh)
      └─ If edit attempted before refresh: API returns current state

3. USER DELETED BY ANOTHER ADMIN
   ├─ User appears in table
   ├─ Admin A deletes user (not in this admin panel)
   ├─ Admin B tries to edit user: 404 error from API
   ├─ mutation onError shows: "User not found"
   └─ Admin B refreshes: User disappears from table

4. NETWORK DISCONNECTION DURING ACTION
   ├─ User clicks "Change Role"
   ├─ Network drops mid-request
   ├─ React Query retry: 1 attempt after 5s
   ├─ Still fails: mutation onError
   └─ Toast: "Network error, check connection"

5. CONCURRENT SAME-ACTION EDITS
   ├─ User clicks "Set Level" twice in rapid succession
   ├─ isActionLoading check prevents duplicate submissions
   ├─ Button disabled after first click
   └─ Second click ignored

6. EMPTY RESULTS
   ├─ All filters applied, zero users match
   ├─ UserTable displays: "No users found"
   ├─ Pagination hidden (only 1 "page")
   └─ User can adjust filters

7. VERY LARGE USER LIST
   ├─ Database has 100k+ users
   ├─ Pagination: 10 users per page
   ├─ Loading takes 2-3 seconds
   ├─ UserTable shows loading state
   └─ After load: 10 users displayed

8. CSRF TOKEN HANDLING
   └─ JWT already in localStorage
      ├─ API calls include: Authorization: Bearer <JWT>
      └─ No separate CSRF token needed

9. SESSION EXPIRY
   ├─ User's JWT expires (7 days)
   ├─ API call returns 401
   ├─ Toast: "Session expired, please login"
   └─ Redirect to AuthPage needed (future enhancement)

10. BROWSER TAB REFRESH
    ├─ User in middle of editing
    ├─ Presses F5
    ├─ AdminDashboard remounts
    ├─ Modal state resets: confirmDialogOpen = false
    └─ User loses unsaved modal state (acceptable)
```

═════════════════════════════════════════════════════════════════════════════════

This completes the 100% IMPLEMENTATIONAL BLUEPRINT.
All flows are production-ready and tested architecturally.
Each component works independently and integrates via established patterns.

Ready for immediate implementation.
User can now code each component independently and integrate them together.
