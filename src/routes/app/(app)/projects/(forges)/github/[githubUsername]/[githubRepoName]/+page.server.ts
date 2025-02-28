import { error } from '@sveltejs/kit';
import fetchUnclaimedFunds from '$lib/utils/project/unclaimed-funds';
import type { PageServerLoad } from './$types';
import fetchEarnedFunds from '$lib/utils/project/earned-funds';
import uriDecodeParams from '$lib/utils/url-decode-params';
import getIncomingSplits from '$lib/utils/splits/get-incoming-splits';
import query from '$lib/graphql/dripsQL';
import { gql } from 'graphql-request';
import type { ProjectByUrlQuery } from './__generated__/gql.generated';
import type { QueryProjectByUrlArgs } from '$lib/graphql/__generated__/base-types';
import isClaimed from '$lib/utils/project/is-claimed';
import { PROJECT_PROFILE_FRAGMENT } from '../../../components/project-profile/project-profile.svelte';

export const load = (async ({ params, fetch }) => {
  const { githubUsername, githubRepoName } = uriDecodeParams(params);

  try {
    const url = `https://github.com/${githubUsername}/${githubRepoName}`;

    const repoRes = await fetch(`/api/github/${encodeURIComponent(url)}`);
    const repo = await repoRes.json();

    const { url: gitHubUrl } = repo;

    const getProjectsQuery = gql`
      ${PROJECT_PROFILE_FRAGMENT}
      query ProjectByUrl($url: String!) {
        projectByUrl(url: $url) {
          ...ProjectProfile
        }
      }
    `;

    const { projectByUrl: project } = await query<ProjectByUrlQuery, QueryProjectByUrlArgs>(
      getProjectsQuery,
      {
        url: gitHubUrl,
      },
      fetch,
    );

    if (!project) {
      throw error(404);
    }

    const unclaimedFunds = !isClaimed(project)
      ? fetchUnclaimedFunds(project.account.accountId)
      : undefined;

    const earnedFunds = isClaimed(project)
      ? fetchEarnedFunds(project.account.accountId)
      : undefined;

    if (isClaimed(project) && !project.splits) {
      throw new Error('Claimed project somehow does not have splits');
    }

    return {
      project,
      streamed: {
        unclaimedFunds,
        earnedFunds,
        incomingSplits: getIncomingSplits(project.account.accountId, fetch),
      },
      blockWhileInitializing: false,
    };
  } catch (e) {
    const status =
      typeof e === 'object' && e && 'status' in e && typeof e.status === 'number' ? e.status : 500;

    // eslint-disable-next-line no-console
    console.error(e);
    throw error(status);
  }
}) satisfies PageServerLoad;
