import { sanitizeItems } from './policy.mjs';

const query = `query($org:String!,$number:Int!,$cursor:String){
  organization(login:$org){projectV2(number:$number){
    fields(first:100){pageInfo{hasNextPage} nodes{... on ProjectV2Field{name} ... on ProjectV2SingleSelectField{name}}}
    items(first:100,after:$cursor){pageInfo{hasNextPage endCursor} nodes{
      id isArchived
      fieldValues(first:100){pageInfo{hasNextPage} nodes{... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{name}}}}}
      content{
        __typename
        ... on Issue{title assignees(first:100){pageInfo{hasNextPage} nodes{login}} labels(first:100){pageInfo{hasNextPage} nodes{name}} repository{nameWithOwner}}
        ... on PullRequest{title assignees(first:100){pageInfo{hasNextPage} nodes{login}} labels(first:100){pageInfo{hasNextPage} nodes{name}} repository{nameWithOwner}}
        ... on DraftIssue{title assignees(first:100){pageInfo{hasNextPage} nodes{login}}}
      }
    }}
  }}
}`;

export async function fetchBoard(config, fetcher = fetch) {
  // GitHub can silently omit every item when a token has Project access but
  // cannot read the private repositories. Check access before trusting an empty
  // project response. HEAD checks permissions without fetching issue bodies.
  for (const repository of config.repositories) {
    for (const resource of ['issues', 'pulls']) {
      const access = await fetcher(`https://api.github.com/repos/${repository}/${resource}`, {
        method: 'HEAD',
        headers: { Authorization: `Bearer ${config.githubToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'ylockers-work-board' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!access.ok) throw new Error('GitHub repository read access is missing; publication stopped.');
    }
  }
  let cursor = null;
  const safeItems = [];
  for (let page = 0; page < 100; page++) {
    const response = await fetcher('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.githubToken}`, 'Content-Type': 'application/json', 'User-Agent': 'ylockers-work-board' },
      body: JSON.stringify({ query, variables: { org: config.org, number: config.projectNumber, cursor } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub request failed (${response.status}). The previous snapshot was kept.`);
    const result = await response.json();
    if (result.errors?.length) throw new Error('GitHub could not read the complete project. Check Projects read access and repository access.');
    const project = result.data?.organization?.projectV2;
    if (!project || project.fields.pageInfo.hasNextPage) throw new Error('The source project or its complete field definitions could not be read.');
    const fields = project.fields.nodes.map(v => v.name);
    if (!fields.includes(config.projectField) || !fields.includes('Status')) throw new Error('The source Project or Status field was renamed or is missing.');
    // A redacted row may be a formerly public item. Stop rather than silently treating lost access as deletion.
    if (project.items.nodes.some(v => !v.content || v.content.__typename === 'RedactedProjectV2Item')) throw new Error('Some source items are inaccessible. Restore source access before publishing.');
    safeItems.push(...sanitizeItems(project.items.nodes, { projectField: config.projectField, allowedProjects: config.allowedProjects }));
    if (!project.items.pageInfo.hasNextPage) return safeItems;
    const next = project.items.pageInfo.endCursor;
    if (!next || next === cursor) throw new Error('GitHub pagination was incomplete; publication stopped.');
    cursor = next;
  }
  throw new Error('The project exceeded the sync limit; publication stopped.');
}
