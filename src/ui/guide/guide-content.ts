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
    'Enable Story under Specialized experiences in Manage workspaces; enable only the entity types you need. Overview offers Continue writing for the latest edited Scene and links to Scenes, Characters, Locations, Plot Threads and Ideas. Collections search titles and sort by dates or name, not narrative order. New Scenes and Continue writing open the real Markdown editor: Thoughtcraft organizes, Obsidian writes. Other creations open generic Focus with properties and relations; Back returns to your collection. Story shares the Workspace Brainstorm board. Disabling Story hides its tools and preserves every note. Plot adds ordered Story Sections and Scenes; Chapters and Timelines remain future work.',
  Plot: 'Brainstorm organizes ideas spatially. Plot organizes Scenes narratively. Enable Story Section in Story setup and create sections such as Act I or Prologue. Existing Scenes start Unplaced. Drag a Scene before another or onto a section’s append area; drag section headers before another header or to the end. Drop a Scene on Unplaced to clear its assignment without deleting it. Actions offer Move to section, Move earlier/later and Move to Unplaced for keyboard use. Select a Scene with one click; double-click or Write opens its native Markdown note, and Open Focus manages properties/relations. Narrative order lives in bs_story in Markdown; Brainstorm coordinates stay independent. Search filters titles without changing placement. There is no global Plot undo, nested hierarchy, Chapter semantics or Timeline.',
  'Plot Threads':
    'A Plot Thread follows something that develops across scenes: a question, a relationship, a conflict or a discovery. Use threads when they help you see how these developments unfold. They are optional; you can write and organize a complete story without them.',
  Relations:
    'Relationships are directed: A → kind → B. They are stored once on A; incoming links are derived. Removing a card or group does not remove relationships. Trashing a target leaves a readable unavailable link in the source.',
} as const;
export type GuideTopic = keyof typeof GUIDE_TOPICS;

export const PLOT_THREAD_GUIDE = [
  {
    title: 'Section, Scene, Thread',
    text: 'A Section groups the narrative structure, such as a prologue or Act I. A Scene is one moment of narrative content. A Thread connects a development across those moments and can cross several Sections. It does not contain a second copy of a Scene.',
  },
  {
    title: 'One scene, several developments',
    text: 'Imagine three threads: The Missing Artifact (a mystery), Maya and Eli (a relationship), and The Royal Conspiracy (a political conflict). Maya finds a clue while Eli admits a secret. This single scene may advance both the mystery and their relationship. Associate it with both threads; write it only once.',
  },
  {
    title: 'Start with a question you care about',
    text: 'In Story → Plot, expand Plot Threads and choose + Plot Thread. If the button is unavailable, enable Plot Thread in Story setup or Manage workspaces. Give it a name and optional notes. The usual Focus view lets you develop its Markdown, properties and relationships. Back returns to Plot. The Plot Threads collection also lists and manages these same notes.',
  },
  {
    title: 'Connect scenes as you discover them',
    text: 'Use a Scene’s actions → Plot Threads… . Add or Remove the threads that develop in that scene, then choose Done. A Scene can have none, one or several. These are ordinary Related to links between Scene and Plot Thread, readable in either direction. New links are stored on the Scene. Other relation kinds, including custom kinds, keep their own meanings and do not count as membership. Removing membership removes those Related to links, never the notes or other relations.',
  },
  {
    title: 'Read a development across the story',
    text: 'Select thread checkboxes to inspect their scene sequences. Each progression follows the existing Plot Section and Scene order. Unplaced scenes appear separately without narrative positions, in the same deterministic order as the Unplaced tray. There is no separate thread ordering or invented completion percentage. Open a Scene in Focus, or choose Write to use its real Markdown editor.',
  },
  {
    title: 'Highlight or filter deliberately',
    text: 'Highlight matches keeps all Plot scenes visible and marks matches. Filter to matches hides other scenes; the interface says when filtering is active. Multiple selections include scenes belonging to any selected thread. Show full Plot clears the selection. Title search may further narrow the Plot. None of these viewing choices changes your notes, ranks or relationships.',
  },
  {
    title: 'Explore freely, structure when useful',
    text: 'Brainstorm is a free spatial space for exploring ideas. Plot gives Scenes a narrative order. Moving cards on Brainstorm does not order scenes or assign threads. You can begin with fragments, write freely, add Sections later, and introduce Threads only when they clarify your work. There is no required writing method: adapt these tools to your own questions and creative rhythm.',
  },
] as const;
