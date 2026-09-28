import { NextRequest, NextResponse } from 'next/server';
import {
  createProposal,
  updateProposalStatus,
  getProposal,
  getProposalById,
  getConversationOwnerId,
  canAccessConversation,
  addMessage,
  isStaffAccount,
  recordFunnelEvent,
  updateConversationStatus,
  inviteProposalAuthor,
  getTelegramChatIdForUser,
  getProfileDisplayName,
  countDeclinedProposals,
} from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { canSetProposalStatus } from '@/lib/money-authz.js';
import { notify, notifyUser } from '@/lib/notify';
import { notifyFounder } from '@/lib/stage-notify';
import { postOpsEvent, postPublicActivity } from '@/lib/ops-events';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { conversationId, title, scope, deliverables, totalAmount, estimatedWeeksMin, estimatedWeeksMax } = body;

    if (!conversationId || !title || !totalAmount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const hasAccess = await canAccessConversation(user.id, conversationId, { allowStaff: true });
    
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // A proposal is a priced offer from BrandForge; only staff may issue one. The founder's
    // job is to accept, decline or request changes via PATCH.
    const isStaff = await isStaffAccount(user.id);
    if (!isStaff) {
      return NextResponse.json(
        { error: 'Only BrandForge staff can issue proposals' },
        { status: 403 }
      );
    }

    // Two-declines-out: the founder declined this author twice on this brief, so the
    // author is out — another specialist may still propose.
    const priorDeclines = await countDeclinedProposals(conversationId, user.id);
    if (priorDeclines >= 2) {
      return NextResponse.json(
        { error: 'The founder declined two of your proposals on this brief — you are out. Another specialist may still propose.' },
        { status: 403 }
      );
    }

    const authorName = await getProfileDisplayName(user.id);

    const proposal = await createProposal({
      conversation_id: conversationId,
      title,
      scope,
      deliverables,
      total_amount: totalAmount,
      currency: 'EUR',
      estimated_weeks_min: estimatedWeeksMin,
      estimated_weeks_max: estimatedWeeksMax,
      created_by: user.id,
    });

    if (!proposal) {
      return NextResponse.json({ error: 'Failed to create proposal' }, { status: 500 });
    }

    await updateConversationStatus(conversationId, 'PROPOSED');
    await addMessage({
      conversation_id: conversationId,
      sender_type: 'ai',
      sender_name: 'BrandForge',
      content: `${authorName} sent a proposal: ${title}. Accept it here in the chat, or open the project panel to read the full scope.`,
      content_type: 'system',
      // The card carries its own priced-offer snapshot so it renders the price,
      // timeline and scope without another fetch — and keeps showing them forever.
      artifact_data: {
        type: 'proposal',
        id: proposal.id,
        status: proposal.status,
        title,
        totalAmount,
        currency: 'EUR',
        weeksMin: estimatedWeeksMin ?? null,
        weeksMax: estimatedWeeksMax ?? null,
        scope: scope ?? null,
      },
    });

    // Recorded server-side at the moment the proposal actually exists.
    await recordFunnelEvent('proposal_received', {
      signedIn: true,
      properties: { total_amount: totalAmount, currency: 'EUR', stage: 'proposal' },
    });

    await notify('proposal_sent', {
      title,
      totalAmount,
      currency: 'EUR',
      weeks:
        estimatedWeeksMin && estimatedWeeksMax
          ? `${estimatedWeeksMin}–${estimatedWeeksMax} weeks`
          : null,
    });

    // The offer must reach the founder even when Telegram is unlinked: email +
    // linked Telegram ping, best-effort, never blocks the proposal itself.
    await notifyFounder(conversationId, 'proposal_ready', {
      title,
      totalAmount,
      currency: 'EUR',
      weeks:
        estimatedWeeksMin && estimatedWeeksMax
          ? `${estimatedWeeksMin}–${estimatedWeeksMax} weeks`
          : null,
    });

    // Staff ops channel: priced terms stay off the public feed by design.
    await postOpsEvent('proposal_submitted', {
      title,
      totalAmount,
      currency: 'EUR',
      weeksMin: estimatedWeeksMin ?? null,
      weeksMax: estimatedWeeksMax ?? null,
      authorName,
    });

    return NextResponse.json({ success: true, proposal });
  } catch (error) {
    console.error('Create proposal API error:', error);
    return NextResponse.json(
      { error: 'Failed to create proposal' },
      { status: 500 }
    );
  }
}

// Counter terms arrive as explicit fields so a counter can never silently reuse the
// original offer. Returns { ok:false, error } for anything a founder or specialist
// should not be able to submit.
function readCounterTerms(body: Record<string, unknown>, status: string) {
  if (status !== 'countered' && status !== 'counter_back') {
    return { ok: true as const, counter: undefined };
  }
  const totalAmount = Math.floor(Number(body.counterTotalAmount));
  const weeksMin = Math.floor(Number(body.counterWeeksMin));
  const weeksMax = Math.floor(Number(body.counterWeeksMax));
  const noteRaw = typeof body.counterNote === 'string' ? body.counterNote.trim() : '';
  if (!Number.isFinite(totalAmount) || totalAmount < 1) {
    return { ok: false as const, error: 'A counter offer needs a total amount of at least EUR 1' };
  }
  if (!Number.isFinite(weeksMin) || weeksMin < 1 || !Number.isFinite(weeksMax) || weeksMax < 1) {
    return { ok: false as const, error: 'A counter offer needs a timeline of at least 1 week' };
  }
  if (weeksMax < weeksMin) {
    return { ok: false as const, error: 'The longest timeline must be at least the shortest one' };
  }
  return {
    ok: true as const,
    counter: {
      totalAmount,
      weeksMin,
      weeksMax,
      note: noteRaw ? noteRaw.slice(0, 1000) : null,
    },
  };
}

const weeksLabel = (min: number, max: number) => (min === max ? `${min} weeks` : `${min}–${max} weeks`);

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { proposalId, status } = body;

    if (!proposalId || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const allowed = [
      'pending',
      'changes_requested',
      'accepted',
      'declined',
      'expired',
      'countered',
      'counter_back',
    ];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'Invalid proposal status' }, { status: 400 });
    }

    const terms = readCounterTerms(body, status);
    if (!terms.ok) {
      return NextResponse.json({ error: terms.error }, { status: 400 });
    }

    // Only the founder who owns the conversation (or BrandForge staff) may change a proposal,
    // and founders may only answer it - lifecycle housekeeping is staff work.
    const existing = await getProposalById(proposalId);
    if (!existing) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    const isStaff = await isStaffAccount(user.id);
    const ownerId = await getConversationOwnerId(existing.conversation_id);

    // Shared, unit-tested decision (lib/money-authz.js): with the current status attached the
    // counter matrix decides who may do what in this round — 409 on a jump the lifecycle
    // does not allow (a second counter, accepting your own offer, a stale answer).
    const decision = canSetProposalStatus({
      actor: { userId: user.id, isStaff },
      ownerId,
      status,
      currentStatus: existing.status ?? undefined,
    });

    if (!decision.allowed) {
      return NextResponse.json({ error: decision.reason }, { status: decision.status });
    }

    const proposal = await updateProposalStatus(proposalId, status, terms.counter);

    if (!proposal) {
      return NextResponse.json({ error: 'Failed to update proposal' }, { status: 500 });
    }

    const isCounter = status === 'countered' || status === 'counter_back';
    const byFounder = decision.reason === 'founder';
    const counter = terms.counter;
    const currency = existing.currency ?? 'EUR';

    // Two-declines-out, counted after the update so the just-written decline is
    // included. The brief itself stays open: another specialist may still propose.
    let outNote = '';
    if (status === 'declined' && existing.created_by && proposal.conversation_id) {
      const declines = await countDeclinedProposals(proposal.conversation_id, existing.created_by);
      if (declines >= 2) {
        const outName = await getProfileDisplayName(existing.created_by);
        outNote = ` That is two declines. ${outName} is out of this brief.`;
      }
    }

    // The decision lives in the same chat as the proposal. Counters never move the
    // conversation status: the deal is still being negotiated.
    const statusLine = isCounter
      ? status === 'countered'
        ? `BrandForge countered the proposal at ${currency} ${counter!.totalAmount} over ${weeksLabel(counter!.weeksMin, counter!.weeksMax)}. The specialist may accept it or counter back once, and the counter back is the final offer.`
        : `The specialist countered back at ${currency} ${counter!.totalAmount} over ${weeksLabel(counter!.weeksMin, counter!.weeksMax)}. Accept it or decline to close the deal.`
      : status === 'accepted'
        ? 'Proposal accepted. The agreement and payment schedule are being prepared in this chat.'
        : status === 'changes_requested'
          ? 'The founder requested changes to the proposal. BrandForge will revise it here.'
          : status === 'declined'
            ? `${byFounder ? 'The founder declined the proposal.' : 'The specialist declined the proposal.'}${outNote}`
            : null;

    if (statusLine && proposal.conversation_id) {
      await addMessage({
        conversation_id: proposal.conversation_id,
        sender_type: 'ai',
        sender_name: 'BrandForge',
        content: statusLine,
        content_type: 'system',
        // Same snapshot as the send card, read from the updated row so an accepted
        // card keeps showing the settled terms.
        artifact_data: {
          type: 'proposal',
          id: proposalId,
          status,
          title: existing.title,
          totalAmount: proposal.total_amount,
          currency: proposal.currency ?? existing.currency ?? 'EUR',
          weeksMin: proposal.estimated_weeks_min,
          weeksMax: proposal.estimated_weeks_max,
          scope: existing.scope ?? null,
        },
      });
    }

    if (!isCounter && proposal.conversation_id) {
      if (status === 'accepted') {
        await updateConversationStatus(proposal.conversation_id, 'ACCEPTED');
        // The accept IS the invite: the proposal's author joins with a visible
        // system line, so the founder sees exactly who won the work. That same
        // moment introduces founder and specialist, so it lands in the ops
        // channel (names are staff-only) while the public feed gets one
        // anonymized line.
        const invited = await inviteProposalAuthor(existing);
        await postOpsEvent('match_made', {
          title: existing.title,
          specialistName: invited?.displayName ?? undefined,
        });
      } else if (status === 'changes_requested' || status === 'declined') {
        await updateConversationStatus(proposal.conversation_id, 'READY_FOR_REVIEW');
      }
    }

    if (isCounter && counter) {
      const counterDetails = {
        title: existing.title,
        totalAmount: counter.totalAmount,
        currency,
        weeks: weeksLabel(counter.weeksMin, counter.weeksMax),
      };

      // Team channel: who countered and what is on the table. The personal pings below
      // tell each side what they must do next.
      await notify('proposal_countered', {
        ...counterDetails,
        by: byFounder ? 'founder' : 'specialist',
      });

      // Staff ops channel: counters and their round stay off the public feed.
      await postOpsEvent('proposal_countered', {
        title: existing.title,
        totalAmount: counter.totalAmount,
        currency,
        weeksMin: counter.weeksMin,
        weeksMax: counter.weeksMax,
        by: byFounder ? 'founder' : 'specialist',
        round: status === 'countered' ? 1 : 2,
      });

      if (status === 'countered') {
        // The specialist's turn: ping the author's linked Telegram (skipped when they
        // countered their own proposal, which the matrix refuses anyway).
        if (existing.created_by && existing.created_by !== user.id) {
          const authorChatId = await getTelegramChatIdForUser(existing.created_by);
          if (authorChatId) {
            await notifyUser(authorChatId, 'proposal_countered', counterDetails);
          }
        }
      } else if (proposal.conversation_id) {
        // The founder's turn: the final counter needs a human decision — email + Telegram.
        await notifyFounder(proposal.conversation_id, 'counter_back_ready', counterDetails);
      }
    } else {
      await notify('proposal_answered', { title: existing.title, status });

      // Ops routing: accepts are priced but staff-only; declines never go public.
      if (status === 'accepted') {
        await postOpsEvent('proposal_accepted', {
          title: existing.title,
          totalAmount: proposal.total_amount,
          currency: proposal.currency ?? currency,
        });
        await postPublicActivity('match_made');
      } else {
        await postOpsEvent('proposal_declined', {
          title: existing.title,
          status,
          declinesOut: outNote !== '',
        });
      }

      // The author waits on this answer personally: ping their linked Telegram
      // (skipped when they answered it themselves). Unlinked or unconfigured is
      // a silent no-op, and the send never blocks the answer itself.
      if (existing.created_by && existing.created_by !== user.id) {
        const authorChatId = await getTelegramChatIdForUser(existing.created_by);
        if (authorChatId) {
          await notifyUser(authorChatId, 'proposal_answered', {
            title: existing.title,
            status,
          });
        }
      }

      if (status === 'accepted') {
        // proposal.total_amount, not existing.total_amount: acceptance may have promoted
        // an outstanding counter into the deal terms, and escrow must price that.
        await recordFunnelEvent('proposal_accepted', {
          signedIn: true,
          properties: { total_amount: proposal.total_amount, currency: proposal.currency ?? currency, stage: 'fund' },
        });
      }
    }

    return NextResponse.json({ success: true, proposal });
  } catch (error) {
    console.error('Update proposal API error:', error);
    return NextResponse.json(
      { error: 'Failed to update proposal' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
    }

    const isStaff = await isStaffAccount(user.id);
    const hasAccess = await canAccessConversation(user.id, conversationId, { allowStaff: true });
    
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const proposal = await getProposal(conversationId, isStaff);

    return NextResponse.json({ proposal });
  } catch (error) {
    console.error('Get proposal API error:', error);
    return NextResponse.json(
      { error: 'Failed to get proposal' },
      { status: 500 }
    );
  }
}
