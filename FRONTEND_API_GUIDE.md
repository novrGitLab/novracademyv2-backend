# GoPhish Integration — Frontend Implementation Guide

Base URL: `https://your-backend.up.railway.app`

All endpoints require `Authorization: Bearer <token>` (get via `POST /auth/login`).

---

## Backend Endpoints

| Endpoint | Method | Role | Description |
|---|---|---|---|
| `/campaigns` | POST | Admin | Launch a phishing campaign |
| `/campaigns` | GET | Admin | List all campaigns |
| `/campaigns/:id` | GET | Admin | Get campaign details |
| `/campaigns/:id/results` | GET | Admin | Get live results from GoPhish |
| `/campaigns/:id` | DELETE | Admin | Delete campaign |

Webhook (internal, not called by frontend):
| `/webhooks/gophish` | POST | None | GoPhish sends real-time events here |

---

## POST /campaigns — Launch Campaign

```json
Request: {
  "name": "Q3 Phishing Test",
  "employeeEmails": [
    { "email": "user1@company.com" },
    { "email": "user2@company.com", "firstName": "John", "lastName": "Doe" }
  ],
  "templateHtml": "<h1>Verify your account</h1><p>Click <a href='{{.URL}}'>here</a></p>",
  "landingPageHtml": "<h1>Employee Portal</h1><form><input name='email'><input name='password' type='password'><button>Login</button></form>"
}

Response: {
  "success": true,
  "campaignId": 123,
  "dbCampaignId": "clxyz..."
}
```

## GET /campaigns — List Campaigns

```json
Response: [
  {
    "id": "clxyz...",
    "gophishCampaignId": 123,
    "name": "Q3 Phishing Test",
    "status": "active",
    "launchedAt": "2026-08-08T10:00:00Z",
    "createdAt": "2026-08-08T10:00:00Z",
    "_count": { "campaignResults": 5 }
  }
]
```

## GET /campaigns/:id — Get Campaign

```json
Response: {
  "id": "clxyz...",
  "gophishCampaignId": 123,
  "name": "Q3 Phishing Test",
  "status": "active",
  "launchedAt": "2026-08-08T10:00:00Z",
  "results": { ... },
  "campaignResults": [
    { "employeeEmail": "user@co.com", "eventType": "clicked", "createdAt": "..." }
  ]
}
```

## GET /campaigns/:id/results — Live Results

```json
Response: {
  "total": 10,
  "sent": 10,
  "opened": 7,
  "clicked": 3,
  "submittedData": 1,
  "reported": 0,
  "clickedDetails": [
    { "email": "user@co.com", "firstName": "User", "lastName": "Doe", "clickedAt": "2026-08-08T...", "ip": "192.168.1.1" }
  ]
}
```

---

## Data Models

```typescript
interface Campaign {
  id: string;
  gophishCampaignId: number | null;
  name: string;
  type: string;            // "phishing"
  status: string;          // "draft" | "active" | "completed" | "archived"
  launchedAt: string | null;
  completedAt: string | null;
  results: CampaignResults;
  createdAt: string;
  updatedAt: string;
  _count: { campaignResults: number };
}

interface CampaignResults {
  total: number;
  sent: number;
  opened: number;
  clicked: number;
  submittedData: number;
  reported: number;
  clickedDetails: Array<{
    email: string;
    firstName: string;
    lastName: string;
    clickedAt: string;
    ip: string;
  }>;
}

interface CampaignResult {
  id: string;
  campaignId: string;
  gophishCampaignId: number;
  employeeEmail: string;
  eventType: string;       // "sent" | "opened" | "clicked" | "submitted" | "reported"
  metadata: Record<string, unknown>;
  createdAt: string;
}
```

---

## Frontend Pages to Build

### Campaign List Page
- Table of all campaigns with name, status, launched date, click rate
- "Launch New Campaign" button

### Launch Campaign Form
- Campaign name (text input)
- Employee emails (tag input or CSV upload)
- Email template (rich text / HTML editor with `{{.URL}}` placeholder)
- Landing page (rich text / HTML editor with form fields)
- Submit button → calls `POST /campaigns`

### Campaign Detail / Results Page
- Campaign name, status badge, launch date
- Live results dashboard:
  - Total sent / Opened / Clicked / Submitted / Reported (cards or bar chart)
  - Click rate percentage
  - Timeline of events
  - Table of clicked details (email, name, time, IP)
- Auto-refresh or polling on `GET /campaigns/:id/results`

### Real-time Tracking
- GoPhish sends webhooks to `/webhooks/gophish` for each event
- Frontend polls `GET /campaigns/:id/results` for live updates
- Optional: WebSocket connection for real-time dashboard updates
