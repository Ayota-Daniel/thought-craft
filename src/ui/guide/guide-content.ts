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
    'Add existing thoughts or create an idea. Drag empty canvas to select; Space-drag or middle-drag pans. Groups persist spatial organization; selection is temporary. Brainstorm around enters Focus: roots plus their direct neighbors. Show all restores every placed card. Connected ideas link new idea → chosen root.',
  Relations:
    'Relationships are directed: A → kind → B. They are stored once on A; incoming links are derived. Removing a card or group does not remove relationships. Trashing a target leaves a readable unavailable link in the source.',
} as const;
export type GuideTopic = keyof typeof GUIDE_TOPICS;
