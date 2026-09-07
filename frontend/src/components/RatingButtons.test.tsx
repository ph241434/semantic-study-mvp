import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RatingButtons } from './RatingButtons';

describe('RatingButtons', () => {
  it('emits the selected rating', () => {
    const onRate = vi.fn();
    render(<RatingButtons onRate={onRate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Good' }));

    expect(onRate).toHaveBeenCalledWith('GOOD');
  });
});
