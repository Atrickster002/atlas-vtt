import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StatblockFilterMenu } from '../../src/app/packages/components/asset-manager/components/creature-filters/StatblockFilterMenu';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';

afterEach(cleanup);

it('shows the choice beside the heading and offers the others with their counts', () => {
  const onChange = vi.fn();
  render(
    <TooltipProvider>
      <StatblockFilterMenu control={{ value: 'linked', counts: { any: 12, linked: 9, unlinked: 3 }, onChange }} />
    </TooltipProvider>,
  );
  const trigger = screen.getByRole('button', { name: 'Characters: with statblock' });
  expect(trigger.textContent).toBe('With statblock');
  fireEvent.click(trigger);
  const items = screen.getAllByRole('menuitemradio');
  expect(items.map((item) => [item.textContent, item.getAttribute('aria-checked')])).toEqual([
    ['All characters12', 'false'], ['With statblock9', 'true'], ['Without statblock3', 'false'],
  ]);
  fireEvent.click(items[2]!);
  expect(onChange).toHaveBeenCalledWith('unlinked');
});
