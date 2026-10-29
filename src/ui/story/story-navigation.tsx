import { STORY_COLLECTIONS, type StorySection } from '../../application/story-query';

export function StoryNavigation({
  section,
  navigate,
}: {
  section: StorySection;
  navigate: (section: StorySection) => void;
}) {
  const sections = [{ id: 'overview' as const, label: 'Overview' }, ...STORY_COLLECTIONS];
  return (
    <nav className="tc-story-navigation" aria-label="Story sections">
      {sections.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={section === item.id ? 'page' : undefined}
          onClick={() => navigate(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
