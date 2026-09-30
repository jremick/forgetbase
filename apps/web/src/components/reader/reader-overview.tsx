import type { MouseEvent } from "react";
import { BookOpen } from "@phosphor-icons/react/dist/icons/BookOpen";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/icons/MagnifyingGlass";
import { Button } from "../ui/button.js";
import { readerPageHref } from "../../lib/reader-navigation.js";
import { formatAssetTypeLabel, readerNavLabel, type ReaderNavNode } from "../../lib/reader-ui.js";

type ReaderOverviewProps = {
  nodes: ReaderNavNode[];
  onOpenPage: (event: MouseEvent<HTMLAnchorElement>, stableId: string) => void;
  onSearch: () => void;
};

export function ReaderOverview({ nodes, onOpenPage, onSearch }: ReaderOverviewProps) {
  return <section className="reader-overview" aria-labelledby="reader-page-title">
    <header className="reader-overview-header">
      <p className="eyebrow">Overview</p>
      <h1 id="reader-page-title" tabIndex={-1}>Knowledge and instructions</h1>
      <p>Browse the published sources available to your account.</p>
      <Button className="reader-overview-search" variant="default" onClick={onSearch}>
        <MagnifyingGlass aria-hidden="true" />Find a source
      </Button>
    </header>
    <div className="reader-overview-collection" aria-label="Published sources">
      {nodes.map((node) => <section className="reader-overview-group" key={node.asset.stableId}>
        <a className="reader-overview-source" href={readerPageHref(window.location, node.asset.stableId)} onClick={(event) => onOpenPage(event, node.asset.stableId)}>
          <span className="reader-overview-icon"><BookOpen aria-hidden="true" /></span>
          <span><span className="reader-overview-type">{formatAssetTypeLabel(node.asset.type)}</span><h2>{readerNavLabel(node.asset)}</h2>
            {node.asset.summary ? <p>{node.asset.summary}</p> : null}</span>
        </a>
        {node.children.length ? <ul className="reader-overview-children">{node.children.map((child) => <li key={child.asset.stableId}>
          <a href={readerPageHref(window.location, child.asset.stableId)} onClick={(event) => onOpenPage(event, child.asset.stableId)}>{readerNavLabel(child.asset)}</a>
          <span>{formatAssetTypeLabel(child.asset.type)}</span>
        </li>)}</ul> : null}
      </section>)}
    </div>
  </section>;
}
