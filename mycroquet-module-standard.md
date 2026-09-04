# MyCroquet Module Package Standard

**Version 1.0, 4 September 2026.**

This document is for anyone who wants to build something that plugs into MyCroquet. You do not need access to our code. Read this, build to it, and hand us one folder. We plug it in.

If you use an AI to build it, give the AI this whole document. The prompt to paste is in section 8.

---

## 1. What MyCroquet is, in one screen

MyCroquet is the member app for Croquet Queensland. Members log in at `my.croquetqld.org`. Clubs and the association run their business inside it.

The stack:

| Part | What we use |
|---|---|
| Framework | Next.js 16, App Router, React 19, TypeScript |
| Styling | Tailwind CSS 4, a shared shadcn-style component kit |
| Database | PocketBase (the `pocketbase` JS client, version 0.26) |
| Login | One login type. A member types their email and gets a code. No passwords. |
| Tests | Vitest for unit tests. Playwright for browser tests. |

**People and access.** Every person is one record in the `users` collection. Each has a `role` and an optional list of `capabilities`.

Roles: `player`, `club_captain`, `club_membership`, `curator`, `caq_admin`.

A role grants capability tags. A person can also hold extra tags granted one at a time. Every gate in the app checks tags, not roles. `admin` is a wildcard tag that passes every check. It belongs to `caq_admin` only.

**What a module is.** A module is one feature unit. It is one manifest file plus the pages and API routes it owns. From the manifest, the platform works out the menu entry, the page guard and the API guard. There is no other registration step.

Today there are about thirty modules. Almost all shipped dark. Dark means `enabled: false`. A dark module is invisible and unreachable until we flip one line.

---

## 2. How it plugs in

Your module lives inside MyCroquet. Your pages and API routes use our login, our database clients and our component kit. You write the code to this standard and hand it to us as one folder. We register it, test it on staging, and switch it on.

We do not embed outside products in a frame, and we do not open our login to outside sites. If your idea only works that way, talk to us first before building anything.

---

## 3. The manifest: the contract you sign

One file. Two halves. `contract` says what you own and who may enter. `nav` says how you appear in the menu.

These are the real types. Your manifest must satisfy them.

```ts
// The vocabulary of access. Your module adds ONE new tag to this list
// (we add it on intake). "admin" passes every check.
export type CapabilityTag =
  | "admin"
  | "member"          // any signed-in member
  | "membership"      // club membership officers, own club only
  | "membership_caq"  // CAQ-level membership admin
  | "captain"         // club captains
  | "curate"          // editorial curators
  // ... about twenty explicit per-person tags, one per module
  | "your_new_tag";   // <- yours

// OR-logic: user holds ANY listed tag. AND-logic: user holds EVERY listed tag.
export type Requirement =
  | { anyCapability: readonly CapabilityTag[] }
  | { allCapability: readonly CapabilityTag[] };

export interface ModuleContract {
  id: string;                        // kebab-case, unique, matches your folder names
  enabled: boolean;                  // ALWAYS false when you hand it in
  requires: Requirement;             // broadest audience for the whole module
  routes: readonly string[];         // page prefixes you own, e.g. ["/club-notices"]
  apis: readonly string[];           // API prefixes you own, e.g. ["/api/club-notices"]
  exemptApis?: readonly string[];    // never-gated endpoints (cron, webhook, public).
                                     // EACH ONE needs a comment saying who calls it.
  allowedHosts?: readonly string[];  // hosts where the module counts as enabled while dark
  collections?: readonly string[];   // PocketBase collections you own. Documentation only.
}

export interface NavItem {
  id: string;
  label: string;
  description: string;               // one sentence a member understands
  href: string;
  icon: string;                      // an icon NAME from the list under this block
  section: "Player" | "Membership" | "Come & Try" | "Come & Try Control"
         | "Club Captain" | "CAQ" | "Gifting" | "Community"
         | "Accreditations" | "Photos" | "Task Board";
  order: number;
  requires: Requirement;             // may be narrower than the contract
}

export interface ModuleManifest {
  contract: ModuleContract;
  nav: readonly NavItem[];
}
```

**Icons you may use.** The nav resolves icon names through a fixed map. A name not in this list silently falls back to the Home icon. Pick one of:

```
Home, User, UserPlus, Users, Target, ClipboardList, ClipboardCheck, Trophy,
CheckCircle, Search, BarChart3, Award, Activity, Shield, Calendar, CalendarCog,
Building2, Globe, FileText, Handshake, MessageSquare, HandCoins, Newspaper,
Video, Vote, Landmark, Camera, Radar, Gift, Image, History, Store
```

If none fits, name the lucide icon you want in `MODULE.md`. Adding it is a one-line change we make on intake.

**Rules for the manifest file.**

1. It lives at `src/modules/<id>.ts` and exports one `const` of type `ModuleManifest`.
2. It imports nothing except `./types`. No React. No Next. No icons. No helpers. The file is bundled into edge middleware. The build fails if you break this.
3. `enabled` is `false`. Always. We flip it, not you.
4. `allowedHosts` may contain `"staging.my.croquetwade.com"`. That lets us walk through your module on staging while it is still dark on live.
5. Use an existing `section`. A new section is a visible design change and needs our agreement first.
6. Ask for your own capability tag. Name it in `MODULE.md`. Do not reuse someone else's tag unless you write down why it is right.
7. Your new tag does not exist in our code until we add it. So your manifest will fail a type check on the tag alone until intake. That is expected. Do not work around it by using an existing tag.
8. `order` is where you sit inside your section. Pick any number from 40 to 99. We renumber on intake if it clashes. `section` is the audience who reads the entry. If readers and writers differ, pick the readers.

**Names already taken (as of 4 September 2026).** Check yours is not on either list.

Module ids: `accreditations-coaching`, `accreditations-refereeing`, `approvals`, `calendar`, `clip-review`, `club-mailer`, `club-profile`, `coaching-clips`, `come-and-try`, `committee`, `core`, `croquetvideos-search`, `ct-control`, `decisions`, `dev-personas`, `gifting`, `grants`, `handicap`, `healthy-mind`, `learn`, `meeting-minutes`, `membership`, `newsletter`, `newsroom`, `peg`, `pennants`, `photos`, `publisher`, `rankings`, `submit-news`, `task-board`, `tournaments`, `treasurer`, `website-editing`.

Capability tags: `admin`, `member`, `membership`, `membership_caq`, `approvals`, `captain`, `curate`, `come_and_try`, `committee`, `newsletter`, `meeting_minutes`, `treasurer`, `grants`, `publisher`, `coaching_clips`, `peg`, `clip_reviewer`, `club_mailer`, `club_profile`, `photos`, `accreditations_coaching_admin`, `accreditations_refereeing_admin`, `accreditations_coaching_assessor`, `accreditations_refereeing_assessor`, `ct_control`, `gifting`, `website_editing`, `calendar_review`.

---

## 4. Worked example: a tiny native module

The module is `club-notices`. A club captain posts a short notice. Members of that club read it. Nothing else.

Every file is complete. Copy the shapes.

### 4.1 `src/modules/club-notices.ts`

```ts
/**
 * Club Notices: a club captain posts a short notice, members of that club
 * read it. Read access is any member. Posting needs the club_notices tag.
 */

import type { ModuleManifest } from "./types";

export const clubNotices: ModuleManifest = {
  contract: {
    id: "club-notices",
    enabled: false,
    requires: { anyCapability: ["member"] },
    routes: ["/club-notices"],
    apis: ["/api/club-notices"],
    allowedHosts: ["staging.my.croquetwade.com"],
    collections: ["club_notices"],
  },
  nav: [
    {
      id: "club-notices",
      label: "Club Notices",
      description: "Short notices from your club captain",
      href: "/club-notices",
      icon: "MessageSquare",
      section: "Community",
      order: 40,
      requires: { anyCapability: ["member"] },
    },
  ],
};
```

### 4.2 `src/lib/club-notices.ts`

Pure types and logic. No Next imports here, so it is easy to unit test.

```ts
export interface NoticeRecord {
  id: string;
  club: string;        // relation to clubs
  author: string;      // relation to users
  body: string;
  created: string;
  updated: string;
}

export const MAX_BODY = 500;

/** Returns an error message, or null when the body is acceptable. */
export function validateBody(body: unknown): string | null {
  if (typeof body !== "string") return "Notice text is required";
  const trimmed = body.trim();
  if (!trimmed) return "Notice text is required";
  if (trimmed.length > MAX_BODY) return `Keep it under ${MAX_BODY} characters`;
  return null;
}
```

### 4.3 `src/app/(frontend)/api/club-notices/route.ts`

This is the most important file. Every authed API handler opens with the same three gates, in this order:

1. module gate
2. authenticate
3. authorise

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireModuleApi } from "@/lib/api-module-gate";
import { verifyAuth, hasCapabilityServer, AuthError } from "@/lib/api-auth";
import { getAdminPB } from "@/lib/pocketbase-admin";
import { validateBody, type NoticeRecord } from "@/lib/club-notices";

// GET /api/club-notices  -> the caller's own club's notices, newest first
export async function GET(req: NextRequest) {
  const gate = requireModuleApi("club-notices", req.headers.get("host"));
  if (gate) return gate;                                          // 1. module gate

  let user;
  try {
    user = await verifyAuth(req.headers.get("Authorization"));    // 2. authenticate
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 401;
    return NextResponse.json({ error: "Not authenticated" }, { status });
  }

  if (!hasCapabilityServer(user, "member")) {                     // 3. authorise
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }
  if (!user.clubId) {
    return NextResponse.json({ notices: [] });                    // no club, nothing to show
  }

  try {
    const pb = await getAdminPB();
    const notices = await pb.collection("club_notices").getList<NoticeRecord>(1, 50, {
      filter: pb.filter("club = {:club}", { club: user.clubId }),  // never string-build a filter
      sort: "-created",
    });
    return NextResponse.json({ notices: notices.items });
  } catch (e) {
    console.error("[club-notices] list failed:", e);
    return NextResponse.json({ error: "Failed to load notices" }, { status: 500 });
  }
}

// POST /api/club-notices  { body: string }  -> creates a notice for the caller's club
export async function POST(req: NextRequest) {
  const gate = requireModuleApi("club-notices", req.headers.get("host"));
  if (gate) return gate;

  let user;
  try {
    user = await verifyAuth(req.headers.get("Authorization"));
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 401;
    return NextResponse.json({ error: "Not authenticated" }, { status });
  }

  if (!hasCapabilityServer(user, "club_notices")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }
  if (!user.clubId) {
    return NextResponse.json({ error: "Your account has no club set" }, { status: 403 });
  }

  let payload: { body?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const problem = validateBody(payload.body);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    const pb = await getAdminPB();
    const created = await pb.collection("club_notices").create<NoticeRecord>({
      club: user.clubId,               // the server decides the club, never the client
      author: user.userId,
      body: (payload.body as string).trim(),
    });
    return NextResponse.json({ notice: created }, { status: 201 });
  } catch (e) {
    console.error("[club-notices] create failed:", e);
    return NextResponse.json({ error: "Failed to save notice" }, { status: 500 });
  }
}
```

Things to notice:

- `verifyAuth` gives you `user.userId`, `user.memberId`, `user.clubId`, `user.role`, `user.capabilities`.
- The club comes from the verified user, never from the request body. That is club scoping. Members of one club must never see another club's data.
- `pb.filter()` with named placeholders is the only way to build a filter.
- `getAdminPB()` is the only way to reach the database from a route. Do not create your own PocketBase client. It returns the full PocketBase JS SDK client, so `getList`, `getFullList`, `getFirstListItem`, `getOne`, `create`, `update` and `delete` all work.

**Update and delete.** Put them in a dynamic route file `src/app/(frontend)/api/club-notices/[id]/route.ts` exporting `PATCH` and `DELETE`. Same three gates in the same order. Then load the record with `getOne`, and refuse with 404 if its `club` is not `user.clubId`. Only then write. The club check on the record is what stops a captain editing another club's notice.

**Time and dates.** Queensland has no daylight saving. When "today" matters, decide it on the server in `Australia/Brisbane`. Format dates for people with `toLocaleDateString("en-AU", ...)`.

### 4.4 `src/app/(frontend)/club-notices/page.tsx`

A gated client page using the shared component kit.

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import CapabilityGuard from "@/components/CapabilityGuard";
import pb from "@/lib/pocketbase";
import { useAuth, hasCapability } from "@/lib/auth";
import { Button, Card, Notice, Spinner, Textarea } from "@/components/ui";
import { MAX_BODY, type NoticeRecord } from "@/lib/club-notices";

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${pb.authStore.token}` };
}

export default function ClubNoticesPage() {
  return (
    <AuthGuard>
      <CapabilityGuard capabilities={["member"]}>
        <NoticesInner />
      </CapabilityGuard>
    </AuthGuard>
  );
}

function NoticesInner() {
  const { capabilities } = useAuth();
  const canPost = hasCapability(capabilities, "club_notices");
  const [notices, setNotices] = useState<NoticeRecord[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/club-notices", { headers: authHeaders() });
    if (!res.ok) {
      setError("Could not load notices");
      setNotices([]);
      return;
    }
    const data = await res.json();
    setNotices(data.notices ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function post() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/club-notices", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save");
      return;
    }
    setDraft("");
    load();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Club Notices</h1>

      {canPost && (
        <Card>
          <Textarea
            label="New notice"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_BODY}
            placeholder="Write a short notice for your club"
          />
          <div className="mt-3 flex justify-end">
            <Button onClick={post} disabled={saving || !draft.trim()}>
              {saving ? "Posting" : "Post notice"}
            </Button>
          </div>
        </Card>
      )}

      {error && <Notice>{error}</Notice>}
      {notices === null && <Spinner />}
      {notices?.length === 0 && <p className="text-sm opacity-70">No notices yet.</p>}
      {notices?.map((n) => (
        <Card key={n.id}>
          <p className="whitespace-pre-wrap">{n.body}</p>
          <p className="mt-2 text-xs opacity-60">
            {new Date(n.created).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </Card>
      ))}
    </div>
  );
}
```

The shared kit exports: `Button, LinkButton, Card, Input, SearchInput, Select, Textarea, Checkbox, ListPicker, ToggleGroup, Table, ScheduleRow, Spinner, Notice, NavTile, DemoBadge, HonourBoard, SectionHead, ToastProvider, useToast, Skeleton, SkeletonCard, SkeletonTableRows, SkeletonMemberCard, RecordCard, RecordRow, RecordEditRow, RecordFieldRow`. Import them from `@/components/ui`. Guards are default exports one level up: `@/components/AuthGuard`, `@/components/CapabilityGuard`, `@/components/RoleGuard`.

Use the kit for every control. Do not bring in another component library.

Prop contracts you will need most:

- `Input`, `Textarea`, `Select` all **require** a `label` string. They accept every normal HTML attribute for their element (`value`, `onChange`, `placeholder`, `maxLength`, `disabled`) plus an optional `error` string.
- `Select` also takes `options: { value: string; label: string }[]` and an optional `placeholder`. It renders a native select, so `onChange` gives you `e.target.value`.
- `Card` takes an optional `title` and children. `Notice` takes children and an optional `variant`, default is an error style. `Button` is a normal button.

### 4.5 `src/lib/club-notices.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { validateBody, MAX_BODY } from "./club-notices";

describe("validateBody", () => {
  it("rejects empty", () => {
    expect(validateBody("")).toBeTruthy();
    expect(validateBody("   ")).toBeTruthy();
    expect(validateBody(undefined)).toBeTruthy();
  });
  it("rejects too long", () => {
    expect(validateBody("x".repeat(MAX_BODY + 1))).toBeTruthy();
  });
  it("accepts a normal notice", () => {
    expect(validateBody("Lawn 2 closed Tuesday for repairs.")).toBeNull();
  });
});
```

### 4.6 `tests/club-notices.staging.spec.ts`

A browser test that runs against our staging site. You cannot run it. Write it anyway so we can. Our helper file `./helpers` exports `login(page, email)`, `ADMIN_EMAIL`, `PLAYER_EMAIL`, `CLUBADMIN_EMAIL`, `CLUBADMIN2_EMAIL` (a second club, for cross-club tests), `TEST_PREFIX` and `uniqueName()`.

```ts
import { test, expect } from "@playwright/test";
import { login, ADMIN_EMAIL } from "./helpers";

test.describe("club-notices", () => {
  test("a member sees the notices page", async ({ page }) => {
    await login(page, ADMIN_EMAIL);
    await page.goto("/club-notices");
    await expect(page.getByRole("heading", { name: "Club Notices" })).toBeVisible();
  });

  test("the API refuses an unauthenticated call", async ({ request }) => {
    const res = await request.get("/api/club-notices");
    expect([401, 404]).toContain(res.status()); // 404 when dark, 401 when lit
  });
});
```

### 4.7 `collections.json`

Describe every PocketBase collection you need. We create it. All five API rules are `null`. That means only the server can touch it. Every read and write goes through your API routes. Do not ask for a permissive rule.

```json
{
  "instance": "core",
  "collections": [
    {
      "name": "club_notices",
      "type": "base",
      "fields": [
        { "name": "club",   "type": "relation", "collection": "clubs", "required": true, "maxSelect": 1 },
        { "name": "author", "type": "relation", "collection": "users", "required": true, "maxSelect": 1 },
        { "name": "body",   "type": "text", "required": true, "max": 500 }
      ],
      "indexes": ["CREATE INDEX idx_club_notices_club ON club_notices (club)"],
      "rules": { "list": null, "view": null, "create": null, "update": null, "delete": null }
    }
  ]
}
```

`created` and `updated` autodate fields are added for you. Field types available: `text`, `number`, `bool`, `email`, `url`, `date`, `select`, `relation`, `file`, `json`, `editor`.

A `select` field lists its choices: `{ "name": "status", "type": "select", "values": ["open", "closed"], "maxSelect": 1 }`.

**Collections that already exist and you may relate to:** `users` (the login record, holds `role` and `capabilities`), `members` (the person, holds names), `clubs` (the club). Relate to these by id. Do not copy their fields into your own collection.

If you suspect a collection for your idea already exists (lawns, events, documents), do not build a parallel one. Write it under "Open questions" in `MODULE.md` and we will tell you.

---

## 5. The rules that do not bend

Each rule has a reason. The reason is why we will not waive it.

- **Three gates, in code order.** `requireModuleApi` then `verifyAuth` then `hasCapabilityServer`. The middleware also gates the route, but the route must defend itself. A future middleware edit must not open your API.
- **`pb.filter()` for every filter.** String-built filters are an injection hole. We test for it.
- **Shared database clients only.** `getAdminPB()` on the server. `pb` from `@/lib/pocketbase` in the browser. A second client means a second auth state and bugs nobody can reproduce.
- **Collections are superuser-only.** All five rules `null`. A permissive rule once let a member promote themselves. Your API routes are the boundary.
- **Club scoping comes from the verified user.** Never trust a `clubId` in a request. Members of one club must not see another club's data.
- **No secrets in code.** Read config from `process.env`. List every variable you need in `MODULE.md`. We set them on staging first, then live.
- **Exempt endpoints are named and commented.** A cron, webhook or public endpoint goes in `exemptApis` with a comment saying who calls it. Otherwise it returns 404 the moment the module is dark.
- **Links to other modules use `hrefFor("<nav-item-id>")`** from `@/modules` guarded by `isModuleEnabled("<id>")` from `@/modules/gate`. Never a hardcoded path. `hrefFor` throws on an unknown id, which is the point.
- **The shared kit for every control.** `@/components/ui`. Tailwind classes for layout. No other UI library.
- **Server components by default.** Add `"use client"` only when you need state or browser APIs.
- **Manifest imports only `./types`.** Build-enforced.
- **Ship dark.** `enabled: false`. We flip it.
- **Do not touch shared files.** No edits to `src/modules/index.ts`, `src/modules/types.ts`, the middleware, the nav, or anything outside your own folders. We do the registration on intake.

---

## 6. What you hand in: the package

One folder. Name it `mycroquet-module-<id>/`. Nothing outside these paths.

```
mycroquet-module-club-notices/
  MODULE.md
  CHECKLIST.md
  collections.json
  src/
    modules/club-notices.ts
    lib/club-notices.ts
    lib/club-notices.test.ts
    app/(frontend)/club-notices/page.tsx
    app/(frontend)/api/club-notices/route.ts
    components/club-notices/          (optional, your own components)
  tests/
    club-notices.staging.spec.ts
```

The `src/` tree mirrors ours. We copy it straight in.

### `MODULE.md` must answer

1. **Name and id.** `Club Notices`, `club-notices`.
2. **What it does.** Three sentences at most.
3. **Who uses it.** Which roles. Which clubs.
4. **The member sentence.** The one line that appears under the menu entry.
5. **Capability tag requested.** `club_notices`. Who should hold it.
6. **Nav section and order.**
7. **Environment variables.** Name, purpose, example value. Or "none".
8. **Collections.** Or "none". Detail in `collections.json`.
9. **Exempt endpoints.** Or "none". Who calls each.
10. **Who to contact.** Name and email of the author.
11. **Open questions.** Anything the standard did not answer. An honest question here beats a guess in the code.

### `CHECKLIST.md`

Copy section 7. Tick each line. Under each tick, one line of evidence. "Tested" is not evidence. "Ran `npx vitest run src/lib/club-notices.test.ts`, 3 passed" is evidence.

---

## 7. Acceptance checklist

### You check before you hand in

- [ ] Manifest at `src/modules/<id>.ts`, `enabled: false`, imports only `./types`
- [ ] Own capability tag requested in `MODULE.md`, or a written reason an existing tag is right
- [ ] Every API handler: `requireModuleApi` then `verifyAuth` then `hasCapabilityServer`, in that order
- [ ] Every database filter uses `pb.filter()` with placeholders
- [ ] Database access only via `getAdminPB()` on the server, `pb` from `@/lib/pocketbase` in the browser
- [ ] Club scoping reads `user.clubId` from `verifyAuth`, never from the request
- [ ] Exempt endpoints listed and commented, or none
- [ ] `collections.json` present, all rules `null`, or an empty list
- [ ] No secrets in code. Every env var named in `MODULE.md`
- [ ] Unit tests exist and pass with `npx vitest run <your test file>`
- [ ] A staging spec exists at `tests/<id>.staging.spec.ts`
- [ ] Only the shared kit for UI controls
- [ ] No file outside the package layout in section 6
- [ ] `MODULE.md` answers all eleven questions

### We check on intake

- [ ] The id is not already taken
- [ ] Type check passes with your files in place
- [ ] Registry and gate invariant tests still pass
- [ ] Dark on staging: page redirects, API returns 404, no menu entry
- [ ] Lit on the staging host: works end to end
- [ ] Cross-club isolation probed
- [ ] Security harness run over your API routes
- [ ] Wade's go before anything reaches live

---

## 8. The prompt to give your AI

Paste this, then paste this whole document under it.

```
You are building a module package for MyCroquet, the Croquet Queensland member app.
Read the standard below in full before writing anything.

Build a module package for: <describe your idea in two or three sentences>

Rules:

- Follow the standard exactly. Where the standard shows a shape, copy the shape.
- Output the complete folder described in section 6. Every file in full. No placeholders.
- Every API handler opens with the three gates in the order shown in section 4.3.
- Do not create or edit any file outside the package layout.
- Fill CHECKLIST.md from section 7 with one line of real evidence per tick.
- If the standard does not answer a question, write the question in MODULE.md
  under "Open questions" instead of guessing.
```

---

## 9. Glossary

**Capability tag.** A short string like `club_notices` that a person holds. Gates check tags. Roles grant tags. Extra tags are granted one person at a time.

**Role.** One of five: `player`, `club_captain`, `club_membership`, `curator`, `caq_admin`. A role is a bundle of tags.

**Manifest.** The one file that declares a module. Section 3.

**Dark ship.** Handing in with `enabled: false`. The module is in the code but invisible. We flip it on later.

**Allowed host.** A domain where a dark module counts as enabled. We use it to test on staging.

**Family route.** An API route that a sibling Croquet Queensland website may call as the logged-in member. `GET /api/auth/me` is one. We build and register these. You do not.

**PocketBase.** The database. One record per row. Collections instead of tables. Five API rules per collection control who may list, view, create, update, delete. Ours are all `null`, which means server only.

**Gate.** A check that returns early. Module gate: is the module on? Auth gate: who is this? Capability gate: may they do this?

**Package.** The one folder you hand in. Section 6.

---

## Changes to this standard

| Date | Change |
|---|---|
| 2026-09-04 | Version 1.0. First public version. Native modules only; no embedded path. |
