-- BrandForge Chat-Centric Database Schema
-- Run this in your Supabase SQL Editor

-- Drop all tables in reverse order of dependencies
DROP TABLE IF EXISTS blockers CASCADE;
DROP TABLE IF EXISTS decisions CASCADE;
DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS agreements CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS milestones CASCADE;
DROP TABLE IF EXISTS proposals CASCADE;
DROP TABLE IF EXISTS requirements CASCADE;
DROP TABLE IF EXISTS project_context CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Project',
  status TEXT NOT NULL DEFAULT 'DISCOVERY',
  -- DISCOVERY | READY_FOR_REVIEW | REVIEW | PROPOSED | ACCEPTED | ACTIVE | COMPLETED | CANCELLED
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
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

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- Project context table
CREATE TABLE IF NOT EXISTS project_context (
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

-- Requirements table
CREATE TABLE IF NOT EXISTS requirements (
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

CREATE INDEX IF NOT EXISTS idx_requirements_conversation ON requirements(conversation_id);

-- Proposals table
CREATE TABLE IF NOT EXISTS proposals (
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

-- Milestones table (must come after proposals since it references it)
CREATE TABLE IF NOT EXISTS milestones (
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

CREATE INDEX IF NOT EXISTS idx_milestones_conversation ON milestones(conversation_id, sequence);

-- Tasks table (must come after milestones since it references it)
CREATE TABLE IF NOT EXISTS tasks (
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

CREATE INDEX IF NOT EXISTS idx_tasks_conversation ON tasks(conversation_id);

-- Agreements table
CREATE TABLE IF NOT EXISTS agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE UNIQUE,
  
  terms TEXT NOT NULL,
  total_amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'EUR',
  
  status TEXT DEFAULT 'pending_funding',
  -- 'pending_funding' | 'funded' | 'active' | 'completed' | 'cancelled'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  funded_at TIMESTAMPTZ
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
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
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Participants table
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  role TEXT NOT NULL,
  -- 'founder' | 'operator' | 'builder' | 'observer'
  
  display_name TEXT,
  
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(conversation_id, user_id)
);

-- Decisions table
CREATE TABLE IF NOT EXISTS decisions (
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

-- Blockers table
CREATE TABLE IF NOT EXISTS blockers (
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

-- Enable Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blockers ENABLE ROW LEVEL SECURITY;

-- RLS Policies (basic - you may want to customize these)
-- Users can only access their own conversations
CREATE POLICY "Users can view own conversations" ON conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations" ON conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations" ON conversations
  FOR UPDATE USING (auth.uid() = user_id);

-- Messages are accessible via conversation ownership
CREATE POLICY "Users can view messages in own conversations" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = messages.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages in own conversations" ON messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = messages.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

-- Similar policies for other tables...
CREATE POLICY "Users can view project_context for own conversations" ON project_context
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = project_context.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update project_context for own conversations" ON project_context
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = project_context.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

-- Requirements: Access via conversation ownership
CREATE POLICY "Users can view requirements in own conversations" ON requirements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = requirements.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert requirements in own conversations" ON requirements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = requirements.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update requirements in own conversations" ON requirements
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = requirements.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

-- Milestones: Access via conversation ownership
CREATE POLICY "Users can view milestones in own conversations" ON milestones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = milestones.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert milestones in own conversations" ON milestones
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = milestones.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update milestones in own conversations" ON milestones
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = milestones.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

-- Tasks: Access via conversation ownership
CREATE POLICY "Users can view tasks in own conversations" ON tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = tasks.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert tasks in own conversations" ON tasks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = tasks.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update tasks in own conversations" ON tasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = tasks.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

-- Proposals: Access via conversation ownership
CREATE POLICY "Users can view proposals in own conversations" ON proposals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = proposals.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert proposals in own conversations" ON proposals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = proposals.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update proposals in own conversations" ON proposals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = proposals.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

-- Agreements: Access via conversation ownership
CREATE POLICY "Users can view agreements in own conversations" ON agreements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = agreements.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert agreements in own conversations" ON agreements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = agreements.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update agreements in own conversations" ON agreements
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = agreements.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

-- Payments: Access via conversation ownership
CREATE POLICY "Users can view payments in own conversations" ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = payments.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert payments in own conversations" ON payments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = payments.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update payments in own conversations" ON payments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = payments.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

-- Participants: Access via conversation ownership or being a participant
CREATE POLICY "Users can view participants in own conversations" ON participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = participants.conversation_id 
      AND conversations.user_id = auth.uid()
    )
    OR participants.user_id = auth.uid()
  );

CREATE POLICY "Users can insert participants in own conversations" ON participants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = participants.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

-- Decisions: Access via conversation ownership
CREATE POLICY "Users can view decisions in own conversations" ON decisions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = decisions.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert decisions in own conversations" ON decisions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = decisions.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

-- Blockers: Access via conversation ownership
CREATE POLICY "Users can view blockers in own conversations" ON blockers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = blockers.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert blockers in own conversations" ON blockers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = blockers.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update blockers in own conversations" ON blockers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = blockers.conversation_id 
      AND conversations.user_id = auth.uid()
    )
  );
