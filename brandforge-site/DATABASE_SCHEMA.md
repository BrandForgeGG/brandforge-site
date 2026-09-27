# BrandForge Chat-Centric Database Schema

## Core Principle
**1 conversation = 1 project**

## Tables

### conversations
The main entity. Each conversation is a project.

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Project',
  status TEXT NOT NULL DEFAULT 'DISCOVERY',
  -- DISCOVERY | READY_FOR_REVIEW | REVIEW | PROPOSED | ACCEPTED | ACTIVE | COMPLETED | CANCELLED
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### messages
All messages in the conversation (user, AI, humans).

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  
  -- sender info
  sender_type TEXT NOT NULL,
  -- 'user' | 'ai' | 'human_operator' | 'human_builder'
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name TEXT,
  
  -- message content
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text',
  -- 'text' | 'artifact' | 'proposal' | 'contract' | 'payment'
  
  -- structured data for artifacts
  artifact_data JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
```

### project_context
Structured project state maintained by AI through tool calling.

```sql
CREATE TABLE project_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE UNIQUE,
  
  -- core project info
  project_name TEXT,
  problem_statement TEXT,
  target_users JSONB, -- array of user personas
  platforms JSONB, -- ['iOS', 'Android', 'Web']
  
  -- requirements tracking
  requirements_count INTEGER DEFAULT 0,
  open_questions_count INTEGER DEFAULT 0,
  assumptions_count INTEGER DEFAULT 0,
  
  -- estimates (AI-generated, not final)
  estimated_weeks_min INTEGER,
  estimated_weeks_max INTEGER,
  estimated_cost_min INTEGER,
  estimated_cost_max INTEGER,
  currency TEXT DEFAULT 'EUR',
  
  -- discovery progress
  discovery_completeness DECIMAL(3,2) DEFAULT 0,
  -- 0.00 to 1.00
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### requirements
Individual requirements extracted by AI.

```sql
CREATE TABLE requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  
  category TEXT,
  -- 'feature' | 'constraint' | 'preference' | 'technical'
  
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  -- 'low' | 'medium' | 'high' | 'critical'
  
  status TEXT DEFAULT 'captured',
  -- 'captured' | 'clarified' | 'accepted' | 'rejected'
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_requirements_conversation ON requirements(conversation_id);
```

### milestones
Project milestones (from proposals).

```sql
CREATE TABLE milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,
  
  sequence INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  
  amount INTEGER,
  currency TEXT DEFAULT 'EUR',
  
  estimated_weeks INTEGER,
  
  status TEXT DEFAULT 'pending',
  -- 'pending' | 'in_progress' | 'completed' | 'cancelled'
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_milestones_conversation ON milestones(conversation_id, sequence);
```

### tasks
Tasks within milestones.

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  
  title TEXT NOT NULL,
  description TEXT,
  
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assignee_name TEXT,
  
  status TEXT DEFAULT 'TODO',
  -- 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE'
  
  due_date TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_conversation ON tasks(conversation_id);
```

### proposals
Human-generated proposals.

```sql
CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  
  title TEXT NOT NULL,
  scope TEXT, -- JSON array of scope items
  deliverables JSONB,
  
  total_amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'EUR',
  
  estimated_weeks_min INTEGER,
  estimated_weeks_max INTEGER,
  
  status TEXT DEFAULT 'pending',
  -- 'pending' | 'changes_requested' | 'accepted' | 'declined' | 'expired'
  
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- when accepted
  accepted_at TIMESTAMPTZ
);
```

### agreements
Accepted contracts.

```sql
CREATE TABLE agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE UNIQUE,
  
  terms TEXT NOT NULL,
  total_amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'EUR',
  
  status TEXT DEFAULT 'pending_funding',
  -- 'pending_funding' | 'funded' | 'active' | 'completed' | 'cancelled'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  funded_at TIMESTAMPTZ,

  -- Contract signature (migration 0013): both sides accept the CURRENT terms; any terms
  -- revision clears both. Absent until the migration is applied — the chat contract card
  -- stays read-only until these columns exist.
  founder_accepted_at TIMESTAMPTZ,
  team_accepted_at TIMESTAMPTZ,
  terms_updated_at TIMESTAMPTZ,
  terms_updated_by UUID
);
```

### payments
Payment milestones.

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  agreement_id UUID REFERENCES agreements(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  
  sequence INTEGER NOT NULL,
  title TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'EUR',
  
  status TEXT DEFAULT 'scheduled',
  -- 'scheduled' | 'pending' | 'paid' | 'released' | 'failed'
  
  scheduled_for TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,  -- 0007: when the client submitted the funding tx hash
  tx_hash TEXT,              -- 0007: client-submitted funding transaction hash
  network TEXT,              -- 0007: human-readable label, e.g. "USDT (TRC-20)"
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### participants
People in the conversation.

```sql
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  role TEXT NOT NULL,
  -- 'founder' | 'operator' | 'builder' | 'observer'
  
  display_name TEXT,
  
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(conversation_id, user_id)
);
```

### decisions
Recorded decisions from conversation.

```sql
CREATE TABLE decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  
  category TEXT,
  -- 'design' | 'scope' | 'technical' | 'timeline' | 'budget'
  
  title TEXT NOT NULL,
  description TEXT,
  decision TEXT NOT NULL,
  
  decided_by TEXT,
  -- 'user' | 'ai' | 'human_operator' | 'human_builder'
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### blockers
Issues blocking progress.

```sql
CREATE TABLE blockers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  
  title TEXT NOT NULL,
  description TEXT,
  
  severity TEXT DEFAULT 'medium',
  -- 'low' | 'medium' | 'high' | 'critical'
  
  status TEXT DEFAULT 'open',
  -- 'open' | 'in_progress' | 'resolved' | 'deferred'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
```

## Key Relationships

```
conversations (1) ────── (N) messages
conversations (1) ────── (1) project_context
conversations (1) ────── (N) requirements
conversations (1) ────── (N) milestones
conversations (1) ────── (N) tasks
conversations (1) ────── (N) proposals
conversations (1) ────── (1) agreements
conversations (1) ────── (N) payments
conversations (1) ────── (N) participants
conversations (1) ────── (N) decisions
conversations (1) ────── (N) blockers

proposals (1) ────── (N) milestones
proposals (1) ────── (1) agreements
agreements (1) ────── (N) payments
milestones (1) ────── (N) tasks
```

## Conversation Status Flow

```
DISCOVERY
  ↓ (AI determines sufficient info)
READY_FOR_REVIEW
  ↓ (User sends to review)
REVIEW
  ↓ (Human creates proposal)
PROPOSED
  ↓ (User accepts)
ACCEPTED
  ↓ (Agreement created)
PENDING_FUNDING
  ↓ (Payment received)
ACTIVE
  ↓ (All milestones complete)
COMPLETED
```

## AI Tool Functions

Implemented in `lib/ai-service.ts` (tool schema + streaming) and `lib/ai-tools.ts` (server-side
validation and execution). The model proposes, the server validates, Postgres stores.

1. `update_project_context` - project name, problem statement, target users, platforms
2. `add_requirement` - add to requirements (feature | constraint | preference | technical)
3. `update_requirement` - change status (captured | clarified | accepted | rejected)
4. `add_open_question` - adds a requirement with `category = 'open_question'`, `status = 'open'`
5. `resolve_open_question` - marks an open question `resolved` and appends the answer
6. `record_decision` - add to decisions
7. `calculate_estimate` - store the AI cost/time range on project_context
8. `set_project_milestones` - rewrite the AI draft milestones (`proposal_id IS NULL`)
9. `check_discovery_completeness` - server-computed discovery score, checklist and missing items
10. `request_human_review` - transition the conversation to READY_FOR_REVIEW

Notes:

- Open questions live in `requirements` with `category = 'open_question'`, so
  `open_questions_count` always mirrors real rows (`syncRequirementCounts`).
- Superseded AI milestones are marked `cancelled` instead of deleted, because the founder's RLS
  policies allow INSERT and UPDATE on `milestones` but not DELETE. See
  `supabase/migrations/0001_chat_first_rls.sql`.
- Discovery completeness is recomputed from rows on every turn and every sidebar load; the AI can
  never assert progress the database does not show.
- Planned but not implemented yet: `create_task`, `update_task`, `add_blocker`, `resolve_blocker`.
