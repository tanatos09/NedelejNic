═══════════════════════════════════════════════════════════════════════════════
ADMIN DASHBOARD - API CONTRACT (Request/Response Specifications)
═══════════════════════════════════════════════════════════════════════════════

All requests require JWT token in Authorization header:
Authorization: Bearer <JWT_TOKEN>

═══════════════════════════════════════════════════════════════════════════════
1. GET /admin/users - LIST USERS WITH PAGINATION & FILTERING
═════════════════════════════════════════════════════════════════════════════════

REQUEST:
┌─ Method: GET
├─ Path: /admin/users
├─ Query Parameters:
│  ├─ page: number (0-indexed, default 0)
│  ├─ pageSize: number (default 10, max 100)
│  ├─ search?: string (optional, searches username)
│  ├─ role?: 'PLAYER' | 'DEV' | 'ADMIN' | 'ALL' (optional)
│  └─ status?: 'active' | 'banned' | 'all' (optional)
│
├─ Headers:
│  ├─ Authorization: Bearer <JWT>
│  └─ Content-Type: application/json
│
└─ Example URL:
   /admin/users?page=0&pageSize=10&search=john&role=ALL&status=all

RESPONSE (200 OK):
┌─ Status: 200
└─ Body:
   {
     "users": [
       {
         "id": "cuid-user-123",
         "username": "john_player",
         "role": "PLAYER",
         "level": 15,
         "isBanned": false,
         "createdAt": "2026-04-01T10:00:00Z",
         "lastLogin": "2026-04-12T14:30:00Z"
       },
       {
         "id": "cuid-user-456",
         "username": "admin_frank",
         "role": "ADMIN",
         "level": 100,
         "isBanned": false,
         "createdAt": "2026-01-01T00:00:00Z",
         "lastLogin": "2026-04-12T15:00:00Z"
       }
     ],
     "total": 42,
     "page": 0,
     "pageSize": 10
   }

ERROR RESPONSES:
┌─ 400 Bad Request (invalid query params)
│  └─ { "message": "Invalid pageSize" }
│
├─ 401 Unauthorized (missing/invalid JWT)
│  └─ { "message": "Unauthorized" }
│
└─ 403 Forbidden (not ADMIN/DEV)
   └─ { "message": "Forbidden - admin access required" }

IMPLEMENTATION:
fetch("/admin/users?page=0&pageSize=10&search=&role=ALL&status=all", {
  headers: {
    Authorization: `Bearer ${token}`,
  }
})
.then(res => res.json())
.then(data => console.log(data))


═══════════════════════════════════════════════════════════════════════════════
2. GET /admin/users/:userId - GET USER DETAILS WITH ACTIVITY
═════════════════════════════════════════════════════════════════════════════════

REQUEST:
┌─ Method: GET
├─ Path: /admin/users/:userId
├─ Path Parameters:
│  └─ userId: string (CUID format)
├─ Headers:
│  ├─ Authorization: Bearer <JWT>
│  └─ Content-Type: application/json
└─ Example: /admin/users/clq7zkn4m0000qz0g8q8z8q0g

RESPONSE (200 OK):
┌─ Status: 200
└─ Body:
   {
     "id": "clq7zkn4m0000qz0g8q8z8q0g",
     "username": "john_player",
     "role": "PLAYER",
     "level": 15,
     "isBanned": false,
     "createdAt": "2026-04-01T10:00:00Z",
     "lastLogin": "2026-04-12T14:30:00Z",
     "totalLevels": 50,
     "progressPercentage": 30,
     "recentActivity": [
       {
         "id": "activity-123",
         "type": "level_complete",
         "levelId": 15,
         "timestamp": "2026-04-12T14:30:00Z",
         "description": "Completed level 15"
       },
       {
         "id": "activity-124",
         "type": "level_fail",
         "levelId": 16,
         "timestamp": "2026-04-12T13:45:00Z",
         "description": "Failed level 16 (3 attempts)"
       },
       {
         "id": "activity-125",
         "type": "login",
         "timestamp": "2026-04-12T10:00:00Z",
         "description": "User logged in"
       }
     ]
   }

ERROR RESPONSES:
┌─ 400 Bad Request (invalid userId format)
│  └─ { "message": "Invalid user ID" }
│
├─ 401 Unauthorized
│  └─ { "message": "Unauthorized" }
│
├─ 403 Forbidden
│  └─ { "message": "Forbidden" }
│
└─ 404 Not Found (user doesn't exist)
   └─ { "message": "User not found" }

IMPLEMENTATION:
fetch("/admin/users/clq7zkn4m", {
  headers: { Authorization: `Bearer ${token}` }
})
.then(res => res.json())
.then(data => console.log(data))


═══════════════════════════════════════════════════════════════════════════════
3. PUT /admin/users/:userId/role - CHANGE USER ROLE
═════════════════════════════════════════════════════════════════════════════════

REQUEST:
┌─ Method: PUT
├─ Path: /admin/users/:userId/role
├─ Headers:
│  ├─ Authorization: Bearer <JWT>
│  └─ Content-Type: application/json
├─ Body:
│  └─ {
│      "role": "ADMIN" | "DEV" | "PLAYER"
│     }
└─ Example:
   PUT /admin/users/clq7zkn4m/role
   { "role": "ADMIN" }

RESPONSE (200 OK):
┌─ Status: 200
└─ Body:
   {
     "id": "clq7zkn4m",
     "username": "john_player",
     "role": "ADMIN",              // Changed from PLAYER to ADMIN
     "level": 15,
     "isBanned": false,
     "createdAt": "2026-04-01T10:00:00Z",
     "lastLogin": "2026-04-12T14:30:00Z"
   }

ERROR RESPONSES:
┌─ 400 Bad Request (invalid role)
│  └─ { "message": "Invalid role: SUPERADMIN" }
│
├─ 401 Unauthorized
│  └─ { "message": "Unauthorized" }
│
├─ 403 Forbidden
│  └─ { "message": "Forbidden" }
│
└─ 404 Not Found
   └─ { "message": "User not found" }

IMPLEMENTATION:
fetch("/admin/users/clq7zkn4m/role", {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ role: "ADMIN" })
})
.then(res => {
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
})
.then(data => console.log("Role changed:", data))


═══════════════════════════════════════════════════════════════════════════════
4. PUT /admin/users/:userId/ban - BAN OR UNBAN USER
═════════════════════════════════════════════════════════════════════════════════

REQUEST:
┌─ Method: PUT
├─ Path: /admin/users/:userId/ban
├─ Headers:
│  ├─ Authorization: Bearer <JWT>
│  └─ Content-Type: application/json
├─ Body:
│  └─ {
│      "isBanned": true | false
│     }
└─ Example:
   PUT /admin/users/clq7zkn4m/ban
   { "isBanned": true }

RESPONSE (200 OK):
┌─ Status: 200
└─ Body:
   {
     "id": "clq7zkn4m",
     "username": "john_player",
     "role": "PLAYER",
     "level": 15,
     "isBanned": true,             // Changed from false to true (banned)
     "createdAt": "2026-04-01T10:00:00Z",
     "lastLogin": "2026-04-12T14:30:00Z"
   }

ERROR RESPONSES:
┌─ 400 Bad Request
│  └─ { "message": "isBanned must be boolean" }
│
├─ 401 Unauthorized
│  └─ { "message": "Unauthorized" }
│
├─ 403 Forbidden
│  └─ { "message": "Forbidden" }
│
└─ 404 Not Found
   └─ { "message": "User not found" }

IMPLEMENTATION:
fetch("/admin/users/clq7zkn4m/ban", {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ isBanned: true })
})
.then(res => res.json())
.then(data => console.log("Ban status:", data.isBanned))


═════════════════════════════════════════════════════════════════════════════════
5. PUT /admin/users/:userId/level - SET USER LEVEL
═════════════════════════════════════════════════════════════════════════════════

REQUEST:
┌─ Method: PUT
├─ Path: /admin/users/:userId/level
├─ Headers:
│  ├─ Authorization: Bearer <JWT>
│  └─ Content-Type: application/json
├─ Body:
│  └─ {
│      "level": 1..100  (integer)
│     }
└─ Example:
   PUT /admin/users/clq7zkn4m/level
   { "level": 50 }

RESPONSE (200 OK):
┌─ Status: 200
└─ Body:
   {
     "id": "clq7zkn4m",
     "username": "john_player",
     "role": "PLAYER",
     "level": 50,                  // Changed from 15 to 50
     "isBanned": false,
     "createdAt": "2026-04-01T10:00:00Z",
     "lastLogin": "2026-04-12T14:30:00Z"
   }

ERROR RESPONSES:
┌─ 400 Bad Request (invalid level)
│  └─ { "message": "Level must be between 1 and 100" }
│
├─ 400 Bad Request (not a number)
│  └─ { "message": "Level must be a number" }
│
├─ 401 Unauthorized
│  └─ { "message": "Unauthorized" }
│
├─ 403 Forbidden
│  └─ { "message": "Forbidden" }
│
└─ 404 Not Found
   └─ { "message": "User not found" }

VALID INPUTS:
├─ level: 1 ✓
├─ level: 50 ✓
├─ level: 100 ✓
└─ INVALID:
  ├─ level: 0 ✗
  ├─ level: 101 ✗
  ├─ level: -5 ✗
  └─ level: "abc" ✗

IMPLEMENTATION:
const level = 50;
if (level < 1 || level > 100) {
  throw new Error("Level must be 1-100");
}

fetch("/admin/users/clq7zkn4m/level", {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ level })
})


═════════════════════════════════════════════════════════════════════════════════
6. POST /admin/users/:userId/reset-progress - RESET USER TO LEVEL 1
═════════════════════════════════════════════════════════════════════════════════

REQUEST:
┌─ Method: POST
├─ Path: /admin/users/:userId/reset-progress
├─ Headers:
│  ├─ Authorization: Bearer <JWT>
│  └─ Content-Type: application/json
├─ Body: {} (empty)
└─ Example:
   POST /admin/users/clq7zkn4m/reset-progress
   {}

RESPONSE (200 OK):
┌─ Status: 200
└─ Body:
   {
     "id": "clq7zkn4m",
     "username": "john_player",
     "role": "PLAYER",
     "level": 1,                   // Reset to 1
     "isBanned": false,
     "createdAt": "2026-04-01T10:00:00Z",
     "lastLogin": "2026-04-12T14:30:00Z"
   }

SIDE EFFECTS:
├─ User's level set to 1
├─ User's progress cleared
├─ User's session may be invalidated (depends on implementation)
└─ CANNOT BE UNDONE (except by manual database fix)

ERROR RESPONSES:
┌─ 401 Unauthorized
│  └─ { "message": "Unauthorized" }
│
├─ 403 Forbidden
│  └─ { "message": "Forbidden" }
│
└─ 404 Not Found
   └─ { "message": "User not found" }

IMPLEMENTATION:
fetch("/admin/users/clq7zkn4m/reset-progress", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({})
})


═════════════════════════════════════════════════════════════════════════════════
7. POST /admin/users/:userId/invalidate-session - FORCE USER LOGOUT
═════════════════════════════════════════════════════════════════════════════════

REQUEST:
┌─ Method: POST
├─ Path: /admin/users/:userId/invalidate-session
├─ Headers:
│  ├─ Authorization: Bearer <JWT>
│  └─ Content-Type: application/json
├─ Body: {} (empty)
└─ Example:
   POST /admin/users/clq7zkn4m/invalidate-session
   {}

RESPONSE (200 OK):
┌─ Status: 200
└─ Body:
   {
     "message": "Session invalidated",
     "userId": "clq7zkn4m"
   }

SIDE EFFECTS:
├─ User's current JWT token becomes invalid
├─ User is force-logged out
├─ User must login again
└─ If user is currently playing: Game ends, redirected to login

ERROR RESPONSES:
┌─ 401 Unauthorized
│  └─ { "message": "Unauthorized" }
│
├─ 403 Forbidden
│  └─ { "message": "Forbidden" }
│
└─ 404 Not Found
   └─ { "message": "User not found" }

IMPLEMENTATION:
fetch("/admin/users/clq7zkn4m/invalidate-session", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({})
})


═════════════════════════════════════════════════════════════════════════════════
ERROR CODE REFERENCE
═════════════════════════════════════════════════════════════════════════════════

200 OK
├─ Request successful
└─ Data returned

400 Bad Request
├─ Invalid input (validation failed)
├─ Common reasons:
│  ├─ Invalid role value
│  ├─ Level out of range (1-100)
│  ├─ isBanned not boolean
│  └─ Invalid user ID format

401 Unauthorized
├─ JWT token missing or invalid
├─ Action: User needs to login again
└─ Frontend: Redirect to AuthPage

403 Forbidden
├─ User exists but doesn't have permission
├─ Common reasons:
│  ├─ User is not ADMIN or DEV
│  ├─ User is banned (for normal users)
│  └─ User role doesn't allow action
└─ Action: Show error toast, disable admin access

404 Not Found
├─ Resource doesn't exist
├─ Common reasons:
│  ├─ User was deleted by another admin
│  ├─ Invalid user ID
│  └─ User_id doesn't exist in database
└─ Frontend: Remove from table, show toast

500 Internal Server Error
├─ Server-side error occurred
├─ Cause: Bug in backend code
├─ Frontend: Show error toast "Server error, please try again"
└─ Action: Retry mutation with React Query retry logic


═════════════════════════════════════════════════════════════════════════════════
COMMON REQUEST PATTERNS (Frontend Implementation)
═════════════════════════════════════════════════════════════════════════════════

PATTERN 1: GET LIST WITH FILTERS
```typescript
const url = new URL('http://localhost:3001/admin/users');
url.searchParams.set('page', String(page));
url.searchParams.set('pageSize', String(pageSize));
if (search) url.searchParams.set('search', search);
if (role !== 'ALL') url.searchParams.set('role', role);
if (status !== 'all') url.searchParams.set('status', status);

const response = await fetch(url, {
  headers: { Authorization: `Bearer ${token}` }
});
```

PATTERN 2: MUTATION WITH JSON BODY
```typescript
const response = await fetch(`/admin/users/${userId}/role`, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ role: 'ADMIN' })
});

if (!response.ok) {
  const error = await response.json();
  throw new Error(error.message);
}

return response.json();
```

PATTERN 3: ERROR HANDLING
```typescript
try {
  const res = await fetch(...);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || res.statusText);
  }
  return res.json();
} catch (error) {
  console.error('API Error:', error.message);
  throw error;
}
```


═════════════════════════════════════════════════════════════════════════════════

This API contract is PRODUCTION-READY and matches the backend implementation.
Frontend can use these specifications for fetch() implementation.
All Response types match TypeScript interface definitions in types/admin.ts

═════════════════════════════════════════════════════════════════════════════════
ACCESS CONTROL RULES
═════════════════════════════════════════════════════════════════════════════════

All /admin/* routes require ADMIN or DEV role.

ADMIN-only actions (DEV cannot perform):
├─ PUT /admin/users/:userId/role — change roles
├─ PUT /admin/users/:userId/ban — ban/unban users
└─ These return 403 if caller is DEV

ADMIN → ADMIN protection:
├─ ADMIN cannot change another ADMIN's role
├─ ADMIN cannot ban another ADMIN
├─ ADMIN cannot change another ADMIN's level
└─ These return 403 with "Cannot modify another admin"

═════════════════════════════════════════════════════════════════════════════════
8. GET /admin/audit - AUDIT LOG
═════════════════════════════════════════════════════════════════════════════════

REQUEST:
┌─ Method: GET
├─ Path: /admin/audit
├─ Query Parameters:
│  ├─ page: number (0-indexed, default 0)
│  └─ pageSize: number (default 50, max 200)
│
├─ Headers:
│  └─ Authorization: Bearer <JWT>
│
└─ Example URL:
   /admin/audit?page=0&pageSize=50

RESPONSE (200 OK):
┌─ Status: 200
└─ Body:
   {
     "entries": [
       {
         "id": "cuid-audit-123",
         "action": "ROLE_CHANGE",
         "detail": "PLAYER → DEV",
         "createdAt": "2026-04-12T16:00:00Z",
         "actor": {
           "id": "cuid-admin-1",
           "username": "admin_frank"
         },
         "target": {
           "id": "cuid-user-2",
           "username": "john_player"
         }
       }
     ],
     "total": 150,
     "page": 0,
     "pageSize": 50
   }

AUDIT ACTIONS:
├─ ROLE_CHANGE — detail: "OLD_ROLE → NEW_ROLE"
├─ BAN — detail: "banned" or "unbanned"
├─ LEVEL_CHANGE — detail: "level set to N"
├─ RESET_PROGRESS — detail: "progress reset"
└─ SESSION_INVALIDATE — detail: "session invalidated"

ERROR RESPONSES:
├─ 401 Unauthorized
│  └─ { "message": "Unauthorized" }
│
└─ 403 Forbidden
   └─ { "message": "Forbidden - admin access required" }

═════════════════════════════════════════════════════════════════════════════════
