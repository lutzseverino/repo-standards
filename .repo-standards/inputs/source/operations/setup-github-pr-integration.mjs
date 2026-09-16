import {
  apiEndpoint,
  githubApi,
  jsonFrom,
  prepareGithubRepository,
  readFixesRequest,
  writeOperationResult as result,
} from './lib/github-operation.mjs';

const operationName = 'GitHub PR integration setup';
const checkName = 'PR metadata';
const rulesetName = 'Repo Canon required PR checks';
const mergeSettings = {
  allow_squash_merge: true,
  allow_merge_commit: false,
  allow_rebase_merge: false,
  squash_merge_commit_title: 'PR_TITLE',
  squash_merge_commit_message: 'PR_BODY',
};

function matchingMergeSettings(repository) {
  return Object.entries(mergeSettings).every(([name, value]) => repository[name] === value);
}

function readBranchProtection(identity, defaultBranch, projectRoot) {
  const endpoint = apiEndpoint(
    identity,
    `/branches/${encodeURIComponent(defaultBranch)}/protection`,
  );
  const response = githubApi([endpoint], projectRoot);
  if (!response.ok
      && /Branch not protected/i.test(response.stderr ?? '')
      && /HTTP 404/i.test(response.stderr ?? '')) {
    return { value: null };
  }
  const parsed = jsonFrom(response);
  if (parsed.error) return parsed;
  const protection = parsed.value;
  if (!protection || typeof protection !== 'object' || Array.isArray(protection)) {
    return { error: 'invalid branch protection response' };
  }
  const statusChecks = protection.required_status_checks;
  if (statusChecks === undefined || statusChecks === null) {
    return { value: { protection, statusChecks: null } };
  }
  if (typeof statusChecks !== 'object' || Array.isArray(statusChecks)
      || !Array.isArray(statusChecks.contexts)
      || (statusChecks.checks !== undefined && !Array.isArray(statusChecks.checks))) {
    return { error: 'invalid required status checks in branch protection response' };
  }
  if (!statusChecks.contexts.every(context => typeof context === 'string')
      || !(statusChecks.checks ?? []).every(check => check && typeof check.context === 'string')) {
    return { error: 'invalid required status checks in branch protection response' };
  }
  return {
    value: {
      protection,
      statusChecks: { ...statusChecks, checks: statusChecks.checks ?? [] },
    },
  };
}

function hasRequiredCheck(statusChecks) {
  return statusChecks !== null
    && (statusChecks.contexts.includes(checkName)
      || statusChecks.checks.some(check => check.context === checkName));
}

function flattenPages(value) {
  return Array.isArray(value) && value.every(Array.isArray) ? value.flat() : value;
}

function readRulesets(identity, projectRoot) {
  const list = jsonFrom(githubApi([
    '--paginate',
    '--slurp',
    `${apiEndpoint(identity, '/rulesets')}?includes_parents=false&per_page=100`,
  ], projectRoot));
  if (list.error) return list;
  const summaries = flattenPages(list.value);
  if (!Array.isArray(summaries)
      || !summaries.every(ruleset => ruleset && Number.isInteger(ruleset.id))) {
    return { error: 'invalid repository rulesets response' };
  }

  const rulesets = [];
  for (const summary of summaries) {
    const detail = jsonFrom(githubApi([
      apiEndpoint(identity, `/rulesets/${summary.id}`),
    ], projectRoot));
    if (detail.error) return { error: `could not inspect ruleset ${summary.id} (${detail.error})` };
    if (!detail.value || detail.value.id !== summary.id || typeof detail.value.name !== 'string') {
      return { error: `invalid repository ruleset ${summary.id} response` };
    }
    rulesets.push(detail.value);
  }
  return { value: rulesets };
}

function canonicalRuleset() {
  return {
    name: rulesetName,
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [],
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    rules: [{
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: false,
        required_status_checks: [{ context: checkName }],
      },
    }],
  };
}

function matchesDefaultRef(pattern, defaultRef) {
  if (pattern === '~DEFAULT_BRANCH' || pattern === '~ALL') return true;
  if (pattern === '~NON_DEFAULT_BRANCH') return false;
  if (typeof pattern !== 'string' || /[\\[\]{}]/.test(pattern)) return null;

  let expression = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/') {
        expression += '(?:.*/)?';
        index += 2;
      } else {
        expression += '.*';
        index += 1;
      }
    } else if (character === '*') {
      expression += '[^/]*';
    } else if (character === '?') {
      expression += '[^/]';
    } else {
      expression += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${expression}$`).test(defaultRef);
}

function managedRulesetPlan(rulesets, defaultBranch) {
  const matches = rulesets.filter(ruleset => ruleset.name.toLowerCase() === rulesetName.toLowerCase());
  if (matches.length > 1) {
    return { error: `multiple rulesets are named ${rulesetName}; resolve the ambiguous managed rule before setup` };
  }
  if (matches.length === 0) return { kind: 'create', payload: canonicalRuleset() };

  const existing = matches[0];
  if (existing.target !== 'branch') {
    return { error: `${rulesetName} targets ${existing.target ?? 'an unknown resource'} instead of branches` };
  }
  const conditions = structuredClone(existing.conditions ?? {});
  const refName = conditions.ref_name;
  if (!refName || !Array.isArray(refName.include) || !Array.isArray(refName.exclude)) {
    return { error: `${rulesetName} has invalid branch conditions` };
  }
  const rules = structuredClone(existing.rules ?? []);
  if (!Array.isArray(rules) || !rules.every(rule => rule && typeof rule.type === 'string')) {
    return { error: `${rulesetName} has invalid rules` };
  }
  const statusRules = rules.filter(rule => rule.type === 'required_status_checks');
  if (statusRules.length > 1) {
    return { error: `${rulesetName} has multiple required status check rules` };
  }

  let changed = existing.enforcement !== 'active';
  const defaultRef = `refs/heads/${defaultBranch}`;
  const evaluatedExclusions = refName.exclude.map(pattern => ({
    pattern,
    matches: matchesDefaultRef(pattern, defaultRef),
  }));
  const ambiguousExclusion = evaluatedExclusions.find(({ matches }) => matches === null);
  if (ambiguousExclusion) {
    return {
      error: `${rulesetName} excludes ${ambiguousExclusion.pattern}; default-branch applicability cannot be established safely`,
    };
  }
  if (!refName.include.some(pattern => matchesDefaultRef(pattern, defaultRef) === true)) {
    refName.include.push('~DEFAULT_BRANCH');
    changed = true;
  }
  if (evaluatedExclusions.some(({ matches }) => matches)) {
    refName.exclude = evaluatedExclusions
      .filter(({ matches }) => !matches)
      .map(({ pattern }) => pattern);
    conditions.ref_name = refName;
    changed = true;
  }

  if (statusRules.length === 0) {
    rules.push(canonicalRuleset().rules[0]);
    changed = true;
  } else {
    const parameters = statusRules[0].parameters;
    if (!parameters || !Array.isArray(parameters.required_status_checks)
        || !parameters.required_status_checks.every(check => check && typeof check.context === 'string')) {
      return { error: `${rulesetName} has invalid required status checks` };
    }
    if (!parameters.required_status_checks.some(check => check.context === checkName)) {
      parameters.required_status_checks.push({ context: checkName });
      changed = true;
    }
  }

  const payload = {
    name: existing.name,
    target: existing.target,
    enforcement: 'active',
    bypass_actors: structuredClone(existing.bypass_actors ?? []),
    conditions,
    rules,
  };
  return changed ? { kind: 'update', id: existing.id, payload } : { kind: 'none', id: existing.id };
}

function rulesetMatches(rulesets, id, defaultBranch) {
  const existing = rulesets.find(ruleset => ruleset.id === id);
  if (!existing || existing.enforcement !== 'active' || existing.target !== 'branch') return false;
  const refName = existing.conditions?.ref_name;
  const defaultRef = `refs/heads/${defaultBranch}`;
  if (!refName?.include?.some(pattern => matchesDefaultRef(pattern, defaultRef) === true)
      || refName.exclude?.some(pattern => matchesDefaultRef(pattern, defaultRef) !== false)) return false;
  return existing.rules?.some(rule => rule.type === 'required_status_checks'
    && rule.parameters?.required_status_checks?.some(check => check.context === checkName));
}

function effectSummary(effects) {
  if (effects.length === 0) return 'No changes were confirmed.';
  return `Confirmed partial effects: ${effects.join(' and ')}.`;
}

function setupIntegration(request) {
  const prepared = prepareGithubRepository(request, operationName);
  if (prepared.blocked) {
    result('blocked', prepared.blocked);
    return;
  }
  const inferred = { identity: prepared.identity };
  const repository = prepared.repository;
  if (!repository.permissions?.admin) {
    result('blocked', `${operationName} requires admin access to ${inferred.identity} to manage repository rules and merge settings.`);
    return;
  }
  if (typeof repository.default_branch !== 'string' || repository.default_branch.length === 0) {
    result('blocked', `${operationName} could not identify the default branch for ${inferred.identity}.`);
    return;
  }

  const branchBefore = readBranchProtection(
    inferred.identity,
    repository.default_branch,
    request.projectRoot,
  );
  if (branchBefore.error) {
    result('blocked', `${operationName} could not inspect required checks on ${repository.default_branch} (${branchBefore.error}).`);
    return;
  }
  const rulesetsBefore = readRulesets(inferred.identity, request.projectRoot);
  if (rulesetsBefore.error) {
    result('blocked', `${operationName} could not inspect repository rulesets for ${inferred.identity} (${rulesetsBefore.error}).`);
    return;
  }

  let checkAction;
  let checkLocation;
  let managedRulesetId;
  if (branchBefore.value?.statusChecks) {
    checkLocation = 'branch';
    if (!hasRequiredCheck(branchBefore.value.statusChecks)) checkAction = { type: 'branch' };
  } else {
    const plan = managedRulesetPlan(rulesetsBefore.value, repository.default_branch);
    if (plan.error) {
      result('blocked', `${operationName} cannot reconcile required checks for ${inferred.identity}: ${plan.error}.`);
      return;
    }
    checkLocation = 'ruleset';
    managedRulesetId = plan.id;
    if (plan.kind !== 'none') checkAction = { type: 'ruleset', plan };
  }
  const settingsNeedUpdate = !matchingMergeSettings(repository);
  const effects = [];

  if (checkAction?.type === 'branch') {
    const endpoint = apiEndpoint(
      inferred.identity,
      `/branches/${encodeURIComponent(repository.default_branch)}/protection/required_status_checks/contexts`,
    );
    const mutation = githubApi([endpoint, '--method', 'POST', '--input', '-'], request.projectRoot, {
      contexts: [checkName],
    });
    if (!mutation.ok) {
      result('blocked', `${operationName} is incomplete for ${inferred.identity}; adding ${checkName} to ${repository.default_branch} branch protection failed (${mutation.detail}). ${effectSummary(effects)} Required-check enforcement${settingsNeedUpdate ? ' and squash merge settings remain' : ' remains'}; inspect remote state and retry.`);
      return;
    }
    effects.push(`required ${checkName} through ${repository.default_branch} branch protection`);
  }

  if (checkAction?.type === 'ruleset') {
    const suffix = checkAction.plan.id
      ? `/rulesets/${checkAction.plan.id}`
      : '/rulesets';
    const method = checkAction.plan.id ? 'PUT' : 'POST';
    const mutation = githubApi(
      [apiEndpoint(inferred.identity, suffix), '--method', method, '--input', '-'],
      request.projectRoot,
      checkAction.plan.payload,
    );
    if (!mutation.ok) {
      result('blocked', `${operationName} is incomplete for ${inferred.identity}; the required-check ruleset mutation failed (${mutation.detail}). ${effectSummary(effects)} Required-check enforcement${settingsNeedUpdate ? ' and squash merge settings remain' : ' remains'}; inspect remote state and retry.`);
      return;
    }
    const parsed = jsonFrom(mutation);
    if (parsed.error || !Number.isInteger(parsed.value?.id)) {
      result('blocked', `${operationName} is incomplete for ${inferred.identity}; the required-check ruleset mutation returned an invalid response. ${effectSummary(effects)} Inspect remote state and retry.`);
      return;
    }
    checkAction.rulesetId = parsed.value.id;
    managedRulesetId = parsed.value.id;
    effects.push(method === 'POST'
      ? 'created required-check ruleset'
      : 'updated required-check ruleset');
  }

  if (settingsNeedUpdate) {
    const mutation = githubApi(
      [apiEndpoint(inferred.identity), '--method', 'PATCH', '--input', '-'],
      request.projectRoot,
      mergeSettings,
    );
    if (!mutation.ok) {
      result('blocked', `${operationName} is incomplete for ${inferred.identity}; the squash merge settings mutation failed (${mutation.detail}). ${effectSummary(effects)} Squash merge settings remain; inspect remote state and retry.`);
      return;
    }
    effects.push('updated squash merge settings');
  }

  const repositoryAfter = jsonFrom(githubApi([apiEndpoint(inferred.identity)], request.projectRoot));
  const branchAfter = readBranchProtection(
    inferred.identity,
    repository.default_branch,
    request.projectRoot,
  );
  const rulesetsAfter = readRulesets(inferred.identity, request.projectRoot);
  const mismatches = [];
  if (repositoryAfter.error || !matchingMergeSettings(repositoryAfter.value)) {
    mismatches.push('squash merge settings');
  }
  if (branchAfter.error) {
    mismatches.push('branch protection readback');
  }
  if (checkLocation === 'ruleset') {
    if (rulesetsAfter.error
        || !rulesetMatches(rulesetsAfter.value, managedRulesetId, repository.default_branch)) {
      mismatches.push(`${checkName} ruleset enforcement`);
    }
  } else if (!branchAfter.error
      && !hasRequiredCheck(branchAfter.value?.statusChecks ?? null)) {
    mismatches.push(`${checkName} branch enforcement`);
  }
  if (rulesetsAfter.error && checkLocation !== 'ruleset') {
    mismatches.push('repository ruleset readback');
  }
  if (mismatches.length > 0) {
    const applied = effects.length > 0 ? ` Applied changes: ${effects.join(' and ')}.` : ' No changes were applied.';
    result('blocked', `${operationName} is incomplete for ${inferred.identity}; final readback did not match ${mismatches.join(' and ')}.${applied}`);
    return;
  }

  if (effects.length === 0) {
    result('unchanged', `GitHub PR integration already matches the canonical configuration for ${inferred.identity}.`);
    return;
  }
  result('changed', `${operationName} changed ${inferred.identity}: ${effects.join(' and ')}. Final readback confirmed ${checkName}, squash-only integration, PR-title subjects, and PR-body messages; unrelated settings and rules were preserved.`);
}

try {
  setupIntegration(readFixesRequest(operationName));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
