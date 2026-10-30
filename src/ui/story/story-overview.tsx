import type { Entity } from '../../domain/entity';
import {
  latestStoryScene,
  storyCounts,
  storyEditedAt,
  type StorySection,
} from '../../application/story-query';

export function StoryOverview({
  entities,
  workspaceId,
  canCreateScene,
  createScene,
  write,
  modifiedAt,
  navigate,
  brainstorm,
}: {
  entities: readonly Entity[];
  workspaceId: string;
  canCreateScene: boolean;
  createScene: () => void;
  write: (id: string) => void;
  modifiedAt: (entity: Entity) => number | undefined;
  navigate: (section: StorySection) => void;
  brainstorm: () => void;
}) {
  const scene = latestStoryScene(entities, workspaceId, modifiedAt);
  const editedAt = scene ? storyEditedAt(scene, modifiedAt(scene)) : 0;
  return (
    <>
      <section className="tc-story-continue" aria-label="Continue writing">
        <h2>Continue writing</h2>
        {scene ? (
          <>
            <h3>{scene.title}</h3>
            <p className="tc-inspector-hint">
              Scene{editedAt > 0 ? ` · Last edited ${new Date(editedAt).toLocaleString()}` : ''}
            </p>
            <button
              className="mod-cta"
              aria-label={`Continue writing: ${scene.title}`}
              onClick={() => write(scene.id)}
            >
              Continue writing
            </button>
          </>
        ) : (
          <>
            <p>No scenes yet.</p>
            <button className="mod-cta" disabled={!canCreateScene} onClick={createScene}>
              Create your first scene
            </button>
            {!canCreateScene && (
              <p className="tc-inspector-hint">Enable Scene in Story setup to start writing.</p>
            )}
          </>
        )}
      </section>
      <section className="tc-story-material" aria-label="Story material">
        <h2>Story material</h2>
        <ul>
          {storyCounts(entities, workspaceId).map((item) => (
            <li key={item.id}>
              <button onClick={() => navigate(item.id)}>
                <span>{item.label}</span>
                <span className="tc-count">
                  {item.count} <span aria-hidden="true">→</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button onClick={() => navigate('plot')}>Open Plot</button>
        <button onClick={brainstorm}>Open Brainstorm</button>
      </section>
    </>
  );
}
