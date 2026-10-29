import { describe, expect, it } from 'vitest';
import {
  paginateInbox,
  paginationButtons,
  INBOX_PAGE_SIZES,
} from '../src/application/inbox-pagination';
import { placePopover } from '../src/ui/shared/popover-placement';
import { visibleSelection } from '../src/application/entity-selection';
import { queryInbox, EMPTY_INBOX_FILTERS } from '../src/application/inbox-query';
import { EntityTypeRegistry } from '../src/application/entity-type-registry';
import { createTestEntity } from './entity-fixtures';
import { CANVAS_CONTROLS } from '../src/ui/guide/canvas-controls';

const results = Array.from({ length: 123 }, (_, index) => `entity-${index + 1}`);

describe('pagination after query processing', () => {
  it('returns no rows or page buttons for zero results', () => {
    expect(paginateInbox([], 8, 50)).toMatchObject({
      page: 1,
      pageCount: 0,
      first: 0,
      last: 0,
      items: [],
    });
    expect(paginationButtons(1, 0)).toEqual([]);
  });
  it('handles fewer than one page', () => {
    expect(paginateInbox(results.slice(0, 4), 1, 50)).toMatchObject({
      pageCount: 1,
      first: 1,
      last: 4,
      items: results.slice(0, 4),
    });
  });
  it('handles exactly one full page', () =>
    expect(paginateInbox(results.slice(0, 50), 1, 50)).toMatchObject({ pageCount: 1, last: 50 }));
  it('renders only the correct first slice', () =>
    expect(paginateInbox(results, 1, 50).items).toEqual(results.slice(0, 50)));
  it('renders the middle page with accurate summary', () =>
    expect(paginateInbox(results, 2, 50)).toMatchObject({
      first: 51,
      last: 100,
      total: 123,
      pageCount: 3,
      items: results.slice(50, 100),
    }));
  it('renders the partial final page', () =>
    expect(paginateInbox(results, 3, 50)).toMatchObject({
      first: 101,
      last: 123,
      items: results.slice(100),
    }));
  it('supports previous/next and direct page requests', () => {
    const middle = paginateInbox(results, 2, 50);
    expect(paginateInbox(results, middle.page - 1, 50).page).toBe(1);
    expect(paginateInbox(results, middle.page + 1, 50).page).toBe(3);
    expect(paginateInbox(results, 3, 50).items[0]).toBe('entity-101');
  });
  it.each(INBOX_PAGE_SIZES)('supports %s rows per page', (size) =>
    expect(paginateInbox(results, 1, size).items).toHaveLength(size),
  );
  it('clamps pages after search or filters shrink results', () =>
    expect(paginateInbox(results.slice(0, 3), 8, 50)).toMatchObject({
      page: 1,
      items: results.slice(0, 3),
    }));
  it.each([-4, 0, NaN])('normalizes invalid page %s', (page) =>
    expect(paginateInbox(results, page, 50).page).toBe(1),
  );
  it('bounds the number of page controls with ellipses', () => {
    expect(paginationButtons(50, 100)).toEqual([1, 'ellipsis', 49, 50, 51, 'ellipsis', 100]);
    expect(paginationButtons(1, 100)).toEqual([1, 2, 'ellipsis', 100]);
    expect(paginationButtons(5, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it('scopes Select this page and batch IDs to rendered rows only', () => {
    const first = paginateInbox(results, 1, 25);
    const selected = [...first.items];
    expect(selected).toHaveLength(25);
    expect(visibleSelection(selected, paginateInbox(results, 2, 25).items)).toEqual([]);
    expect(visibleSelection(['entity-1', 'entity-80'], first.items)).toEqual(['entity-1']);
  });
  it('applies Workspace/search/filter/sort before slicing, with no source mutation', () => {
    const types = new EntityTypeRegistry();
    const entities = Array.from({ length: 120 }, (_, index) =>
      createTestEntity({
        id: crypto.randomUUID(),
        title: `Thought ${String(index).padStart(3, '0')}`,
        workspaceId: index < 10 ? 'other' : 'default',
      }),
    );
    const board = {
      workspaceId: 'default',
      nodes: {},
      groups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const original = structuredClone(entities);
    const sorted = queryInbox(
      entities,
      'default',
      'Thought 0',
      { ...EMPTY_INBOX_FILTERS, type: 'idea', board: 'off' },
      'za',
      board,
      types,
    );
    expect(sorted).toHaveLength(90);
    expect(paginateInbox(sorted, 2, 25).items.map((entity) => entity.title)).toEqual(
      sorted.slice(25, 50).map((entity) => entity.title),
    );
    expect(paginateInbox(sorted, 2, 25).items[0]?.title).toBe('Thought 074');
    expect(entities).toEqual(original);
  });
});

describe('floating form viewport placement', () => {
  it('anchors below when there is room', () =>
    expect(
      placePopover({ left: 100, top: 100, bottom: 130 }, 300, { width: 900, height: 700 }),
    ).toMatchObject({ left: 100, top: 136, width: 280, maxHeight: 556 }));
  it('flips above near the bottom edge', () =>
    expect(
      placePopover({ left: 100, top: 600, bottom: 630 }, 300, { width: 900, height: 700 }).top,
    ).toBe(294));
  it('shifts away from the right viewport edge', () =>
    expect(
      placePopover({ left: 870, top: 100, bottom: 130 }, 300, { width: 900, height: 700 }).left,
    ).toBe(612));
  it('shrinks to narrow widths and supports internal scrolling', () => {
    const result = placePopover({ left: 220, top: 80, bottom: 110 }, 400, {
      width: 240,
      height: 300,
    });
    expect(result.width).toBe(224);
    expect(result.left).toBe(8);
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(292);
  });
  it('caps a tall form to the viewport', () => {
    const result = placePopover({ left: -20, top: 250, bottom: 280 }, 800, {
      width: 600,
      height: 500,
    });
    expect(result.left).toBe(8);
    expect(result.top).toBeGreaterThanOrEqual(8);
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(492);
  });
});

describe('documented canvas controls', () => {
  it('contains actual supported selection/pan/open controls as text', () => {
    expect(CANVAS_CONTROLS.map(([action]) => action)).toContain('Select an area');
    expect(CANVAS_CONTROLS.find(([action]) => action === 'Pan canvas')?.[1]).toContain(
      'Right drag',
    );
    expect(CANVAS_CONTROLS.find(([action]) => action === 'Move selected cards')?.[1]).toBe(
      'Drag any selected card',
    );
    expect(CANVAS_CONTROLS.find(([action]) => action === 'Open an entity')?.[1]).toContain(
      'focused card',
    );
  });
});
