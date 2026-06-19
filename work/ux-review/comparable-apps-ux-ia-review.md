# ForgetBase Comparable Apps UX / IA Review

Date: 2026-06-19
Scope: Human-perspective information architecture and page-purpose review for the current ForgetBase / ForgetBase web UI.

## Executive Summary

- The broad `Read / Work / Distribute / Operate` frame is directionally right for an agent-native instruction control plane.
- The human problem is underneath that frame: pages need to behave like real destinations, not debug panels that require manual loader buttons.
- Comparable products separate content browsing, review work, publishing/distribution, activity/logs, and scoped settings.
- Credentials and API URL controls should not sit as persistent global UI for normal signed-in users.
- Asset detail should be a first-class object destination with content, versions, review, distribution, and activity context.
- Review, approval, telemetry, and settings should be explicit workflows with route-owned loading, refresh, empty states, and breadcrumbs.

## Comparable Product Evidence

| Product | Official UI evidence | Screenshot reference | Pattern to borrow |
| --- | --- | --- | --- |
| Notion | [Sidebar navigation](https://www.notion.com/help/navigate-with-the-sidebar), [Workspace settings](https://www.notion.com/help/workspace-settings) | [Workspace settings image](https://images.ctfassets.net/spoqsaf9291f/36DSq2EcSv3Q9uUUnRXdMo/9f8e7900ef53569a84c8625097bcc271/Workspace_settings_-_hero.png) | Content tree is separate from workspace/admin settings. |
| Confluence | [Content tree manager](https://support.atlassian.com/confluence-cloud/docs/manage-your-content-tree/), [Space permissions](https://support.atlassian.com/confluence-cloud/docs/assign-space-permissions/) | Official docs pages include UI images. | Space/page hierarchy plus scoped admin. |
| Guru | [Verification](https://help.getguru.com/docs/what-is-verifcation), [Card Manager](https://help.getguru.com/docs/performing-bulk-actions-in-the-card-manager), [Pages](https://help.getguru.com/docs/creating-and-managing-pages) | [Pages management GIF](https://files.readme.io/027cd2e907c57a7922ee9390c669496030ada83d0b5742387b5915b613a6e068-Hide_Pages_.gif) | Trust and verification state are first-class work, not hidden admin metadata. |
| GitBook | [Change requests](https://gitbook.com/docs/collaboration/change-requests/change-requests-in-a-space), [Sidebar structure](https://gitbook.com/docs/editing-content/page-structure/sidebar), [Publishing](https://gitbook.com/docs/publishing-documentation/publish-your-docs) | [Docs sites product image](https://framerusercontent.com/images/CsJlkNhGN7YFnqQnmm6TzG6rM.png?scale-down-to=1024&width=1933&height=1043) | Browse tree, review mode, and publish action are distinct. |
| ReadMe | [Hub navigation](https://docs.readme.com/main/docs/navigating-your-hub-1), [Reference pages](https://docs.readme.com/main/docs/reference-core-pages) | [Navigation image](https://files.readme.io/4e937794bdc0ca55c2ab0799d970b7ae7c63b24de68b478f5cd2d65be5f325ff-Navigation.png), [Version picker](https://files.readme.io/7bbcb33859e763f156ea22cf22d50713438db83fd44b75d0f37a2c92eb84f737-version_picker.png) | Public docs hub and admin dashboard concepts stay separated. |
| Vercel | [Projects](https://vercel.com/docs/projects), [Deployments](https://vercel.com/docs/deployments), [Runtime logs](https://vercel.com/docs/logs/runtime) | [Deployment resources](https://7nyt0uhk7sse4zvn.public.blob.vercel-storage.com/docs-assets/static/docs/concepts/deployments/deployment-resources-page-light.png), [Runtime logs overview](https://7nyt0uhk7sse4zvn.public.blob.vercel-storage.com/front/docs/observability/request-log-overview-light.png?lightbox) | Object-scoped deploys, logs, and settings. |
| Datadog | [Log Explorer](https://docs.datadoghq.com/logs/explorer/), [Log side panel](https://docs.datadoghq.com/logs/explorer/side_panel/) | Official docs pages include UI examples. | Observability is an explorer/list/detail flow with filters. |
| LaunchDarkly | [Flags list](https://launchdarkly.com/docs/home/flags/list), [Compare/copy](https://launchdarkly.com/docs/home/flags/compare-copy), [Approvals](https://launchdarkly.com/docs/home/releases/approvals) | Official docs include screenshots. | Compare, audit, approval, and environment state are object-scoped. |
| Postman | [Navigating Postman](https://learning.postman.com/docs/getting-started/basics/navigating-postman), [Audit logs](https://learning.postman.com/docs/administration/managing-your-team/audit-logs/) | [Audit logs screenshot](https://assets.postman.com/postman-docs/audit-logs-dashboard-v9.jpg) | Workspace objects, environments, APIs, and team audit are separated. |
| Retool | [App IDE](https://docs.retool.com/apps/concepts/ide), [Workflow logs](https://docs.retool.com/workflows/concepts/logs), [Permissions](https://docs.retool.com/permissions/quickstart) | Official docs pages include UI examples. | Builder/editor, workflow runs, logs, and permissions are distinct surfaces. |
| Linear | [Navigation](https://linear.app/docs/navigation), [Projects](https://linear.app/docs/projects), [Workspace settings](https://linear.app/docs/workspace-settings) | Official docs pages are the stable references. | Inbox/work/views/projects/settings map to clear user intents. |

## Current ForgetBase Gaps

P0:
- `Operate` is still too broad. Long-term, split it into `Activity`, `Health`, `Sources / Integrations`, and `Settings`.
- Asset detail should become an object route: `Asset -> Read / Versions / Review / Distribution / Activity`.
- Distribution vocabulary should be consistent: top-level `Distribute`, then `Exports`, `Bundles`, `Channels`, and `Delivery history`.
- Manual loader buttons should become automatic initial load plus refresh/retry states.

P1:
- API URL and API key belong in a developer/settings surface, not normal global chrome.
- Breadcrumbs should be object-aware once real asset/export/run routes exist.
- Review queue needs status chips, owners/approvers, due states, and direct object navigation.
- Telemetry should be an explorer with filters and detail inspection, not paragraph lists.

P2:
- Add side-panel inspection for assets, exports, runs, reviews, and logs.
- Add saved views/filters for library, review, and activity.
- Normalize object tabs as `Overview`, `Content`, `Versions`, `Review`, `Activity`, `Settings`.

## Implemented In This Pass

- Added route headers and breadcrumbs to Library/Reading Room/Versions, Search, Distribute, and Operate routes.
- Converted visible `#exports` navigation into a backward-compatible alias for `#distribute`.
- Removed export actions from the Library surface; package generation now lives in Distribute.
- Made the Reading Room route meaningful by opening it from Library and Review queue row selection.
- Replaced cryptic folder abbreviations with section icons while preserving iconless leaf rows.
- Removed fake collapsible affordances from nav folder rows.
- Hid the API URL/API key bar for cookie-session users and moved it behind a Developer connection disclosure for bearer/dev mode.
- Added route-owned auto-loading for operation workspaces with a single refresh action.
- Added a separate reader-role web interface for published material so consumer users can read/search approved content without the manager control system.

## Next Implementation Lane

1. Split `Operate` into `Activity`, `Health`, `Integrations`, and `Settings` routes.
2. Move API clients/environment settings into `Settings`.
3. Extend the reader interface with table-of-contents/navigation affordances once real published content has richer structure.
4. Convert telemetry, audit, users, providers, and action requests from paragraph lists to `DataTableShell` plus side-panel detail.
5. Add saved filters and route-specific empty/error/retry states.
