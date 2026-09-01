import type { TelemetryAnalyticsSummary } from "@forgetbase/schema";
import { Box, Grid, Heading, HStack, Stack, Text } from "@chakra-ui/react";

import { DataTableShell } from "../app/data-table-shell.js";
import { Button } from "../ui/button.js";
import { Badge, type BadgeVariant } from "../ui/badge.js";
import { Skeleton } from "../ui/skeleton.js";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../ui/table.js";

export type AnalyticsWindowDays = 7 | 30 | 90;

export type AnalyticsDashboardProps = {
  summary: TelemetryAnalyticsSummary | null;
  windowDays: AnalyticsWindowDays;
  loading: boolean;
  onWindowDaysChange: (days: AnalyticsWindowDays) => void;
  onRefresh: () => void;
};

const windowOptions: AnalyticsWindowDays[] = [7, 30, 90];
const countFormatter = new Intl.NumberFormat("en-AU");
const percentFormatter = new Intl.NumberFormat("en-AU", {
  maximumFractionDigits: 0,
  style: "percent"
});
const dayFormatter = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  timeZone: "UTC"
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeStyle: "short"
});

export function formatAnalyticsCount(value: number) {
  return countFormatter.format(value);
}

export function formatAnalyticsRate(value: number, total: number) {
  return total > 0 ? percentFormatter.format(value / total) : "—";
}

export function formatAnalyticsDay(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? value : dayFormatter.format(parsed);
}

export function formatAnalyticsDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateTimeFormatter.format(parsed);
}

export function formatReviewState(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function reviewStateVariant(value: string): BadgeVariant {
  if (value === "fresh" || value === "current") return "success";
  if (value === "due-soon" || value === "due_soon" || value === "needs-review") return "warning";
  if (value === "overdue") return "destructive";
  return "neutral";
}

export function formatContentHealthSampleNote(input: {
  sampleLimit: number;
  sampleLimitReached: boolean;
  totalCount: number;
}) {
  return input.sampleLimitReached
    ? `The ${input.sampleLimit}-record sample limit was reached, so older content may be omitted.`
    : `${input.totalCount} governed content records are included in this bounded sample.`;
}

function AnalyticsLoadingState() {
  return (
    <Stack role="status" aria-live="polite" gap="4">
      <Text color="fg.muted">Loading analytics for this time window…</Text>
      <Grid templateColumns={{ base: "1fr", md: "repeat(4, minmax(0, 1fr))" }} gap="3">
        {windowOptions.map((days) => (
          <Stack key={days} gap="2" borderWidth="1px" rounded="md" p="3">
            <Skeleton style={{ height: "0.75rem", width: "7rem" }} />
            <Skeleton style={{ height: "2rem", width: "4rem" }} />
            <Skeleton style={{ height: "0.75rem", width: "6rem" }} />
          </Stack>
        ))}
        <Stack gap="2" borderWidth="1px" rounded="md" p="3">
          <Skeleton style={{ height: "0.75rem", width: "7rem" }} />
          <Skeleton style={{ height: "2rem", width: "4rem" }} />
          <Skeleton style={{ height: "0.75rem", width: "6rem" }} />
        </Stack>
      </Grid>
      <Skeleton style={{ height: "12rem", width: "100%" }} />
    </Stack>
  );
}

function MetricStrip({ summary }: { summary: TelemetryAnalyticsSummary }) {
  const metrics = [
    {
      label: "Searches",
      value: summary.searchQuality.searchEventCount,
      note: `${formatAnalyticsCount(summary.searchQuality.lowResultSearchCount)} matched ${summary.searchQuality.lowResultThreshold} or fewer unique pages`
    },
    {
      label: "Unanswered searches",
      value: summary.searchQuality.unansweredSearchCount,
      note: `${formatAnalyticsRate(summary.searchQuality.unansweredSearchCount, summary.searchQuality.searchEventCount)} of searches`
    },
    {
      label: "Page views",
      value: summary.pageViews.eventCount,
      note: "Authorized page opens across tracked surfaces"
    },
    {
      label: "Overdue content",
      value: summary.contentHealth.overdueCount,
      note: `${formatAnalyticsRate(summary.contentHealth.overdueCount, summary.contentHealth.totalCount)} of governed content`
    },
    {
      label: "Needs review",
      value: summary.contentHealth.needsReviewCount,
      note: "Not current or not approved"
    }
  ];

  return (
    <Grid
      as="dl"
      templateColumns={{ base: "1fr", sm: "repeat(2, minmax(0, 1fr))", xl: "repeat(5, minmax(0, 1fr))" }}
      borderWidth="1px"
      rounded="md"
      overflow="hidden"
      bg="bg.panel"
    >
      {metrics.map((metric) => (
        <Stack as="div" key={metric.label} gap="1" minW="0" p="3" borderEndWidth="1px" borderBottomWidth="1px">
          <Text as="dt" color="fg.muted" textStyle="sm" fontWeight="medium">
            {metric.label}
          </Text>
          <Text as="dd" fontSize="2xl" fontWeight="semibold" lineHeight="shorter">
            {formatAnalyticsCount(metric.value)}
          </Text>
          <Text color="fg.muted" textStyle="xs">
            {metric.note}
          </Text>
        </Stack>
      ))}
    </Grid>
  );
}

function SearchQualityTable({ summary }: { summary: TelemetryAnalyticsSummary }) {
  const rows = summary.searchQuality.topQueries;

  return (
    <DataTableShell
      title="Search activity"
      description={`Queries matching ${summary.searchQuality.lowResultThreshold} or fewer unique pages are counted as low-result searches.`}
      actions={(
        <>
          <Badge variant={summary.searchQuality.unansweredSearchCount > 0 ? "warning" : "success"}>
            {formatAnalyticsCount(summary.searchQuality.unansweredSearchCount)} unanswered
          </Badge>
          <Badge variant="neutral">{formatAnalyticsCount(summary.searchQuality.lowResultSearchCount)} low-result</Badge>
        </>
      )}
      isEmpty={rows.length === 0}
      emptyTitle="No search activity"
      emptyDescription="No search queries were recorded in this time window."
    >
      <Table>
        <TableCaption>Most frequent search queries in the selected time window</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Query</TableHead>
            <TableHead style={{ textAlign: "right" }}>Searches</TableHead>
            <TableHead style={{ textAlign: "right" }}>Results returned</TableHead>
            <TableHead style={{ textAlign: "right" }}>Unique pages</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.query}>
              <TableCell style={{ fontWeight: 500, maxWidth: "30rem", whiteSpace: "normal" }}>{row.query}</TableCell>
              <TableCell style={{ textAlign: "right" }}>{formatAnalyticsCount(row.count)}</TableCell>
              <TableCell style={{ textAlign: "right" }}>{formatAnalyticsCount(row.resultCount)}</TableCell>
              <TableCell style={{ textAlign: "right" }}>{formatAnalyticsCount(row.uniquePageCount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataTableShell>
  );
}

type PageCount = TelemetryAnalyticsSummary["pageViews"]["popularPages"][number];

function PageActivityTable({
  title,
  description,
  countLabel,
  rows
}: {
  title: string;
  description: string;
  countLabel: string;
  rows: PageCount[];
}) {
  return (
    <DataTableShell
      title={title}
      description={description}
      isEmpty={rows.length === 0}
      emptyTitle={`No ${title.toLocaleLowerCase()}`}
      emptyDescription="No matching events were recorded in this time window."
    >
      <Table>
        <TableCaption>{description}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Page</TableHead>
            <TableHead style={{ textAlign: "right" }}>{countLabel}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.stableId}>
              <TableCell>
                <Stack gap="0">
                  <Text fontWeight="medium">{row.stableId}</Text>
                  <Text color="fg.muted" textStyle="xs">{row.assetId ?? "Asset reference unavailable"}</Text>
                </Stack>
              </TableCell>
              <TableCell style={{ fontWeight: 600, textAlign: "right" }}>{formatAnalyticsCount(row.count)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataTableShell>
  );
}

function ContentHealthTable({ summary }: { summary: TelemetryAnalyticsSummary }) {
  const health = summary.contentHealth;
  const sampleNote = formatContentHealthSampleNote(health);

  return (
    <DataTableShell
      title="Content health"
      description={`Review state as of ${formatAnalyticsDay(health.asOf)}. Due soon means within ${health.dueSoonDays} days. ${sampleNote}`}
      actions={(
        <Badge variant={health.overdueCount > 0 ? "warning" : "success"}>
          {formatAnalyticsCount(health.freshCount)} fresh
        </Badge>
      )}
      isEmpty={health.byReviewState.length === 0}
      emptyTitle="No governed content"
      emptyDescription="No content health records are available."
    >
      <Table>
        <TableCaption>Governed content grouped by current review state</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Review state</TableHead>
            <TableHead style={{ textAlign: "right" }}>Pages</TableHead>
            <TableHead style={{ textAlign: "right" }}>Share</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {health.byReviewState.map((row) => (
            <TableRow key={row.key}>
              <TableCell><Badge variant={reviewStateVariant(row.key)}>{formatReviewState(row.key)}</Badge></TableCell>
              <TableCell style={{ textAlign: "right" }}>{formatAnalyticsCount(row.count)}</TableCell>
              <TableCell style={{ textAlign: "right" }}>{formatAnalyticsRate(row.count, health.totalCount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataTableShell>
  );
}

function DailyTrendsTable({ summary }: { summary: TelemetryAnalyticsSummary }) {
  const rows = summary.dailyTrends;

  return (
    <DataTableShell
      title="Daily trend"
      description="Search and reading activity by UTC day."
      isEmpty={rows.length === 0}
      emptyTitle="No daily trend"
      emptyDescription="Daily activity will appear after search or page-view events are recorded."
    >
      <Table>
        <TableCaption>Daily search, page-view, and unique-page activity in the selected time window</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead style={{ textAlign: "right" }}>Searches</TableHead>
            <TableHead style={{ textAlign: "right" }}>Unanswered</TableHead>
            <TableHead style={{ textAlign: "right" }}>Low-result</TableHead>
            <TableHead style={{ textAlign: "right" }}>Page views</TableHead>
            <TableHead style={{ textAlign: "right" }}>Unique pages</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.date}>
              <TableCell style={{ fontWeight: 500 }}>{formatAnalyticsDay(row.date)}</TableCell>
              <TableCell style={{ textAlign: "right" }}>{formatAnalyticsCount(row.searchCount)}</TableCell>
              <TableCell style={{ textAlign: "right" }}>{formatAnalyticsCount(row.unansweredSearchCount)}</TableCell>
              <TableCell style={{ textAlign: "right" }}>{formatAnalyticsCount(row.lowResultSearchCount)}</TableCell>
              <TableCell style={{ textAlign: "right" }}>{formatAnalyticsCount(row.pageViewCount)}</TableCell>
              <TableCell style={{ textAlign: "right" }}>{formatAnalyticsCount(row.uniquePageCount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataTableShell>
  );
}

export function AnalyticsDashboard({
  summary,
  windowDays,
  loading,
  onWindowDaysChange,
  onRefresh
}: AnalyticsDashboardProps) {
  return (
    <Stack as="section" aria-labelledby="analytics-dashboard-title" aria-busy={loading} gap="4" minW="0">
      <Stack direction={{ base: "column", lg: "row" }} align={{ base: "stretch", lg: "end" }} justify="space-between" gap="3">
        <Stack gap="1" minW="0">
          <HStack gap="2" align="center" flexWrap="wrap">
            <Heading as="h2" id="analytics-dashboard-title" size="lg">Knowledge activity</Heading>
            {loading && summary ? <Badge variant="info">Refreshing</Badge> : null}
          </HStack>
          <Text color="fg.muted" textStyle="sm">
            Search quality, page activity, and content review signals from privacy-filtered operational telemetry.
          </Text>
          {summary ? (
            <Text color="fg.muted" textStyle="xs">
              Generated {formatAnalyticsDateTime(summary.generatedAt)} · UTC daily boundaries
            </Text>
          ) : null}
        </Stack>
        <HStack gap="2" align="center" flexWrap="wrap">
          <HStack role="group" aria-label="Analytics time window" gap="1">
            {windowOptions.map((days) => (
              <Button
                key={days}
                type="button"
                size="sm"
                variant={windowDays === days ? "primary" : "ghost"}
                aria-pressed={windowDays === days}
                disabled={loading}
                onClick={() => {
                  if (days !== windowDays) onWindowDaysChange(days);
                }}
              >
                {days} days
              </Button>
            ))}
          </HStack>
          <Button type="button" size="sm" disabled={loading} onClick={onRefresh}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </HStack>
      </Stack>

      {!summary && loading ? <AnalyticsLoadingState /> : null}

      {!summary && !loading ? (
        <DataTableShell
          title="Analytics unavailable"
          description="No analytics summary is available for this time window."
          isEmpty
          emptyTitle="No analytics data"
          emptyDescription="Refresh to retry. Activity will appear after search or page-view events are recorded."
          actions={<Button type="button" size="sm" onClick={onRefresh}>Retry</Button>}
        />
      ) : null}

      {summary ? (
        <>
          <MetricStrip summary={summary} />
          <Grid templateColumns={{ base: "minmax(0, 1fr)", xl: "minmax(0, 3fr) minmax(20rem, 2fr)" }} gap="4" alignItems="start">
            <SearchQualityTable summary={summary} />
            <ContentHealthTable summary={summary} />
          </Grid>
          <Grid templateColumns={{ base: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }} gap="4" alignItems="start">
            <PageActivityTable
              title="Popular pages"
              description="Authorized pages opened across tracked surfaces, ranked by page-view events."
              countLabel="Page views"
              rows={summary.pageViews.popularPages}
            />
            <PageActivityTable
              title="Most returned in search"
              description="Pages included in search results, ranked by return count. This is not page-view activity."
              countLabel="Times returned"
              rows={summary.searchQuality.mostReturnedPages}
            />
          </Grid>
          <DailyTrendsTable summary={summary} />
          <Box borderTopWidth="1px" pt="3">
            <Text color="fg.muted" textStyle="xs">
              Counts reflect retained telemetry within the selected window. They are operational signals, not a complete history or an audience measurement system.
            </Text>
          </Box>
        </>
      ) : null}
    </Stack>
  );
}
