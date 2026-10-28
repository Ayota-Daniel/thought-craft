import { useSyncExternalStore } from 'react';
import type { EntityIndex } from '../../infrastructure/entity-index';

interface InboxProps { index: EntityIndex; capture: () => void; open: (id: string) => void }
const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function Inbox({ index, capture, open }: InboxProps) {
  const entities = useSyncExternalStore(index.subscribe, index.getInbox);
  return <div className="tc-inbox">
    <header className="tc-inbox-header"><div><span className="tc-eyebrow">Thought Craft</span><h1>Inbox <span className="tc-count">{entities.length}</span></h1><p>A place for thoughts before their next step.</p></div><button className="mod-cta" onClick={capture}>Capture idea</button></header>
    {entities.length === 0 ? <section className="tc-empty"><h2>Your next idea starts here.</h2><p>Capture a thought to save it as a Markdown note in your vault.</p><button onClick={capture}>Capture your first idea</button></section> : <ul className="tc-inbox-list">{entities.map((entity) => <li key={entity.id}><button className="tc-inbox-row" onClick={() => open(entity.id)}><span className="tc-row-main"><span className="tc-row-title">{entity.title}</span><span className="tc-row-workspace">{entity.workspaceId}</span></span><time dateTime={entity.createdAt} title={`Created: ${entity.createdAt}\nUpdated: ${entity.updatedAt}`}>{formatter.format(new Date(entity.createdAt))}</time></button></li>)}</ul>}
    <footer className="tc-inbox-footer">Ideas stay in your vault as ordinary Markdown notes.</footer>
  </div>;
}
