// Discovery completeness is derived from persisted project state.
// The AI may suggest that discovery is finished, but the database decides.

const DISCOVERY_THRESHOLD = 0.7;

const DISCOVERY_STEPS = [
  { key: 'project_name', weight: 10, label: 'Project name' },
  { key: 'problem_statement', weight: 15, label: 'Problem statement' },
  { key: 'target_users', weight: 15, label: 'Target users' },
  { key: 'platforms', weight: 10, label: 'Platforms' },
  { key: 'requirements', weight: 20, label: 'At least 3 requirements' },
  { key: 'timeline', weight: 15, label: 'Timeline estimate' },
  { key: 'budget', weight: 15, label: 'Budget estimate' },
];

const REQUIREMENT_CATEGORIES = ['feature', 'constraint', 'preference', 'technical'];
const OPEN_QUESTION_CATEGORY = 'open_question';

function cleanString(value) {
  return String(value ?? '').trim();
}

function nonEmptyStrings(value) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanString).filter((item) => item.length > 0);
}

function isOpenQuestion(requirement) {
  if (!requirement || requirement.category !== OPEN_QUESTION_CATEGORY) return false;
  return requirement.status !== 'resolved' && requirement.status !== 'rejected';
}

function countCapturedRequirements(requirements) {
  if (!Array.isArray(requirements)) return 0;

  return requirements.filter((requirement) => {
    if (!requirement) return false;
    if (requirement.category === OPEN_QUESTION_CATEGORY) return false;
    if (requirement.status === 'rejected') return false;
    return cleanString(requirement.title).length > 0;
  }).length;
}

function isPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function computeDiscovery(context, requirements) {
  const ctx = context || {};
  const healthyRequirements = countCapturedRequirements(requirements);
  const openQuestions = (Array.isArray(requirements) ? requirements : []).filter(isOpenQuestion);

  const met = {
    project_name: cleanString(ctx.project_name).length > 0,
    problem_statement: cleanString(ctx.problem_statement).length > 0,
    target_users: nonEmptyStrings(ctx.target_users).length > 0,
    platforms: nonEmptyStrings(ctx.platforms).length > 0,
    requirements: healthyRequirements >= 3,
    timeline: isPositiveNumber(ctx.estimated_weeks_min) && isPositiveNumber(ctx.estimated_weeks_max),
    budget: isPositiveNumber(ctx.estimated_cost_min) && isPositiveNumber(ctx.estimated_cost_max),
  };

  let score = 0;
  const checklist = DISCOVERY_STEPS.map((step) => {
    const passed = Boolean(met[step.key]);
    if (passed) score += step.weight;
    return { key: step.key, label: step.label, met: passed, weight: step.weight };
  });

  const completeness = Math.min(1, Math.max(0, score / 100));

  return {
    completeness,
    percent: Math.round(completeness * 100),
    checklist,
    missing: checklist.filter((step) => !step.met).map((step) => step.label),
    requirementsCount: healthyRequirements,
    openQuestionsCount: openQuestions.length,
  };
}

function isDiscoveryComplete(completeness) {
  const parsed = Number(completeness);
  if (!Number.isFinite(parsed)) return false;
  return parsed >= DISCOVERY_THRESHOLD;
}

module.exports = {
  DISCOVERY_THRESHOLD,
  DISCOVERY_STEPS,
  REQUIREMENT_CATEGORIES,
  OPEN_QUESTION_CATEGORY,
  computeDiscovery,
  isDiscoveryComplete,
};
