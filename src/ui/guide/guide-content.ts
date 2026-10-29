export const RELATION_GUIDE = [
  {
    label: 'Related to',
    meaning:
      'Use when two entities are meaningfully connected but no stronger relation applies yet.',
    example: 'Train mystery → Related to → Old station.',
  },
  {
    label: 'Supports',
    meaning: 'A strengthens, enables, justifies or contributes to B.',
    example: 'A witness account → Supports → The conductor knew.',
  },
  {
    label: 'Alternative to',
    meaning:
      'A and B are competing or substitutable directions. Store the link once, from the option you are considering.',
    example: 'A ferry journey → Alternative to → A train journey.',
  },
  {
    label: 'Depends on',
    meaning: 'A requires B to function, exist or remain coherent.',
    example: 'The reveal → Depends on → An earlier clue.',
  },
  {
    label: 'Originated from',
    meaning: 'A was created from B. Create from records this provenance automatically.',
    example: 'Mira → Originated from → An idea for a traveller.',
  },
] as const;
export const GUIDE_TOPICS = {
  'Getting started':
    'Capture an idea, open it to develop its content and properties, then place thoughts on Brainstorm when you want spatial context.',
  Entities:
    'Ideas, characters, scenes, projects and custom types are ordinary Markdown notes. Their identity follows them when files are renamed. Focus opens the same note, and Open Markdown note lets you edit it.',
  Properties:
    'Type properties reuse a schema. Local properties belong to one entity. Defaults stay virtual until you choose a value. Use Manage entity types to configure reusable fields.',
  Workspaces:
    'A Workspace scopes your current list and board. Switching Workspace does not move notes. Each Workspace enables entity types and may define custom relations.',
  Brainstorm:
    'Create an idea or use Add Existing to place notes. Rectangle-select cards, then drag any selected card to move the block. Groups persist spatial organization; selection is temporary. Brainstorm around enters Focus: roots plus direct neighbors. Show all restores every placed card. Handles or Connect create real relations; connected ideas link new idea → chosen root. Pan and zoom without changing card positions.',
  Story:
    'Enable Story under Specialized experiences in Manage workspaces; enable only the entity types you need. Overview offers Continue writing for the latest edited Scene and links to Scenes, Characters, Locations, Plot Threads and Ideas. Collections search titles and sort by dates or name, not narrative order. New Scenes and Continue writing open the real Markdown editor: Thoughtcraft organizes, Obsidian writes. Other creations open generic Focus with properties and relations; Back returns to your collection. Story shares the Workspace Brainstorm board. Disabling Story hides its tools and preserves every note. Plot Boards, Chapters and Timelines are not part of this foundation.',
  Relations:
    'Relationships are directed: A → kind → B. They are stored once on A; incoming links are derived. Removing a card or group does not remove relationships. Trashing a target leaves a readable unavailable link in the source.',
} as const;
export type GuideTopic = keyof typeof GUIDE_TOPICS;
